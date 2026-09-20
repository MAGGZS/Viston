-- A fundacao dos planos: quem paga, por qual plano, e quanto ja gastou do que
-- comprou.
--
-- Nada aqui muda o comportamento de quem usa o sistema hoje. Esta migration so
-- acrescenta: nenhuma rota consulta estas tabelas ainda, e o gating vem depois.
--
-- As tres decisoes que explicam o desenho:
--
-- 1. A assinatura pertence a conta de gestor, nao ao predio. Quem paga por um
--    predio e quem o criou, e e isso que `buildings.owner_manager_id` guarda.
--    Um predio tem varios gestores (ver `building_managers`), mas um so dono,
--    senao "de quem e a cobranca" nao teria resposta.
--
-- 2. O catalogo dos planos vive no codigo (src/utils/plans.ts), nunca aqui. O
--    banco guarda qual plano a conta tem; o que o plano permite e regra de
--    produto, muda com o produto e nao tem por que exigir migration nem ficar
--    editavel por quem alcanca o banco. Por isso `plan_grants.plan` e
--    `subscriptions.plan` sao so o codigo do plano, sem nenhuma coluna de
--    limite ao lado.
--
-- 3. A precedencia do acesso e: concessao ativa do admin vence sempre; senao a
--    assinatura do Stripe, quando o status for TRIALING, ACTIVE ou PAST_DUE;
--    senao LIVRE. Ela e resolvida em `planService.resolvePlan`, e nao em view
--    nem em trigger, porque e a aplicacao que responde 403 e precisa dizer
--    qual das tres respondeu.
--
-- Os IF NOT EXISTS seguem o resto das migrations: rodar duas vezes nao pode
-- quebrar o deploy.

-- == 1. Os enums =============================================================
-- PlanCode e o codigo do plano, e so isso: os limites de cada um estao no
-- codigo (ver a decisao 2 acima).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PlanCode') THEN
    CREATE TYPE "PlanCode" AS ENUM ('LIVRE', 'ESSENCIAL', 'PRO');
  END IF;
END
$$;

-- Espelha o status da assinatura no Stripe, com os mesmos nomes que chegam no
-- webhook. Traduzir os nomes aqui so criaria um dicionario a manter, e ele
-- estaria errado no dia em que o Stripe acrescentasse um estado.
--
-- Os tres que dao acesso sao TRIALING, ACTIVE e PAST_DUE. PAST_DUE da acesso de
-- proposito: a cobranca falhou e o Stripe vai tentar de novo por alguns dias —
-- cortar o produto no primeiro cartao recusado castiga quem so trocou de cartao.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SubscriptionStatus') THEN
    CREATE TYPE "SubscriptionStatus" AS ENUM (
      'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'INCOMPLETE', 'UNPAID'
    );
  END IF;
END
$$;

-- Mensal ou anual, com os nomes do Stripe pelo mesmo motivo do status acima.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BillingInterval') THEN
    CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'YEARLY');
  END IF;
END
$$;

-- As acoes de plano na trilha de auditoria. Conceder, revogar e congelar sao
-- decisoes que mudam o que uma conta pode fazer, e precisam de dono e data.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PLAN_GRANTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PLAN_REVOKED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'BUILDING_FROZEN';

-- == 2. A assinatura =========================================================
-- Uma por gestor — o unique em `manager_id` e o que garante isso. Duas
-- assinaturas para a mesma conta nao e um estado com significado: seria duas
-- respostas para "qual e o plano dele".
--
-- `extra_buildings` e o que foi comprado alem dos predios inclusos no plano. Ele
-- mora aqui, e nao no catalogo, porque e quantidade contratada e muda por conta;
-- o teto de quanto se pode comprar e que esta no codigo.
--
-- Os ids do Stripe ficam nulos enquanto a assinatura nao existir la — e o caso
-- de quem so tem concessao do admin.
CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id"                     TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "manager_id"             TEXT NOT NULL,
  "plan"                   "PlanCode" NOT NULL,
  "status"                 "SubscriptionStatus" NOT NULL,
  "interval"               "BillingInterval" NOT NULL DEFAULT 'MONTHLY',
  "extra_buildings"        INTEGER NOT NULL DEFAULT 0,
  "stripe_customer_id"     TEXT,
  "stripe_subscription_id" TEXT,
  -- Ate quando o periodo pago vai. E a data que a tela de cobranca mostra e a
  -- que decide se uma assinatura cancelada ainda vale hoje.
  "current_period_end"     TIMESTAMP(3),
  -- Cancelou, mas segue valendo ate o fim do periodo ja pago.
  "cancel_at_period_end"   BOOLEAN NOT NULL DEFAULT false,
  "created_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_manager_id_key"
  ON "subscriptions" ("manager_id");
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_stripe_subscription_id_key"
  ON "subscriptions" ("stripe_subscription_id");
CREATE INDEX IF NOT EXISTS "subscriptions_stripe_customer_id_idx"
  ON "subscriptions" ("stripe_customer_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_manager_id_fkey') THEN
    ALTER TABLE "subscriptions"
      ADD CONSTRAINT "subscriptions_manager_id_fkey"
      FOREIGN KEY ("manager_id") REFERENCES "managers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- == 3. A concessao do admin =================================================
-- O admin libera um plano para uma conta sem passar pelo Stripe: cortesia,
-- suporte, parceria, teste. A concessao vence a assinatura (ver a decisao 3),
-- porque e a unica forma de o suporte resolver na hora um problema de cobranca
-- sem mexer no que o cliente contratou.
--
-- `expires_at` nulo e concessao sem prazo. `revoked_at` e o admin voltando
-- atras antes do prazo — a linha fica, porque saber que alguem teve PRO por
-- duas semanas e o tipo de coisa que se precisa responder depois.
--
-- `reason` e obrigatorio de proposito: concessao sem motivo escrito e a que
-- ninguem consegue explicar seis meses depois.
CREATE TABLE IF NOT EXISTS "plan_grants" (
  "id"         TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "manager_id" TEXT NOT NULL,
  "plan"       "PlanCode" NOT NULL,
  "reason"     TEXT NOT NULL,
  -- Qual conta de admin concedeu. Nulo quando a concessao nao partiu de uma
  -- pessoa (o grandfathering abaixo) ou quando a conta do admin sumiu.
  "granted_by" TEXT,
  "starts_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plan_grants_pkey" PRIMARY KEY ("id")
);

-- A pergunta e sempre "a concessao que vale para esta conta agora", e a resposta
-- e a mais recente entre as que ainda nao venceram.
CREATE INDEX IF NOT EXISTS "plan_grants_manager_id_created_at_idx"
  ON "plan_grants" ("manager_id", "created_at" DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plan_grants_manager_id_fkey') THEN
    ALTER TABLE "plan_grants"
      ADD CONSTRAINT "plan_grants_manager_id_fkey"
      FOREIGN KEY ("manager_id") REFERENCES "managers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plan_grants_granted_by_fkey') THEN
    ALTER TABLE "plan_grants"
      ADD CONSTRAINT "plan_grants_granted_by_fkey"
      FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- == 4. Os eventos do Stripe =================================================
-- A chave primaria e o id do evento no Stripe, e e so isso que torna o webhook
-- idempotente: o Stripe reentrega o mesmo evento quando nao recebe 200, e sem
-- esta tabela o reenvio aplicaria a mesma mudanca duas vezes.
--
-- O corpo fica guardado porque e o unico registro do que o Stripe disse. Quando
-- a assinatura no banco discordar da assinatura no painel, e aqui que se
-- descobre qual dos dois lados errou.
CREATE TABLE IF NOT EXISTS "stripe_events" (
  "id"           TEXT NOT NULL,
  "type"         TEXT NOT NULL,
  "payload"      JSONB,
  "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stripe_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "stripe_events_processed_at_idx"
  ON "stripe_events" ("processed_at" DESC);

-- == 5. O consumo do mes =====================================================
-- Uma linha por conta e por mes (`period` no formato YYYY-MM), porque os limites
-- que se gastam sao mensais e viram zero na virada. Guardar so um contador
-- corrente exigiria alguem para zera-lo todo dia 1 — e esse alguem falha.
--
-- O mes e texto e nao data de proposito: e uma chave, nao um instante. `2026-09`
-- ordena e compara como string sem ambiguidade de fuso.
--
-- Fotos nao contam aqui: elas nao viram zero na virada do mes, ficam no banco
-- ate alguem apagar. O que esta guardado e a soma de `photo_assets`.
CREATE TABLE IF NOT EXISTS "usage_counters" (
  "id"          TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "manager_id"  TEXT NOT NULL,
  "period"      TEXT NOT NULL,
  "emails_sent" INTEGER NOT NULL DEFAULT 0,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "usage_counters_pkey" PRIMARY KEY ("id")
);

-- Unico por conta e mes: e o que permite somar com um upsert, sem ler antes de
-- escrever e sem duas linhas do mesmo mes nascendo em duas requisicoes juntas.
CREATE UNIQUE INDEX IF NOT EXISTS "usage_counters_manager_id_period_key"
  ON "usage_counters" ("manager_id", "period");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usage_counters_manager_id_fkey') THEN
    ALTER TABLE "usage_counters"
      ADD CONSTRAINT "usage_counters_manager_id_fkey"
      FOREIGN KEY ("manager_id") REFERENCES "managers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- == 6. As fotos que ocupam espaco ===========================================
-- O limite de armazenamento e por conta de gestor, mas a foto pertence ao
-- predio: quem paga por ela e o dono do predio (`buildings.owner_manager_id`), e
-- e por esse caminho que a soma e feita. Guardar o gestor aqui tambem criaria
-- uma segunda verdade sobre de quem e a foto, e ela ficaria velha no dia em que
-- o predio trocasse de dono.
--
-- `path` e o caminho no bucket, unico, e nao a URL — a mesma escolha de
-- `inspection_reports.excel_path`. `bytes` e BIGINT porque a soma de uma conta
-- com 150 GB nao cabe em INTEGER.
CREATE TABLE IF NOT EXISTS "photo_assets" (
  "id"          TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "building_id" TEXT NOT NULL,
  "path"        TEXT NOT NULL,
  "bytes"       BIGINT NOT NULL,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "photo_assets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "photo_assets_path_key" ON "photo_assets" ("path");
-- A leitura e sempre "quanto este predio ocupa", somado depois por dono.
CREATE INDEX IF NOT EXISTS "photo_assets_building_id_idx" ON "photo_assets" ("building_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'photo_assets_building_id_fkey') THEN
    ALTER TABLE "photo_assets"
      ADD CONSTRAINT "photo_assets_building_id_fkey"
      FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- == 7. A troca de dono do predio ============================================
-- Trocar o dono e passar a conta adiante, entao nao pode ser um clique so de
-- quem sai: o co-gestor indicado recebe uma solicitacao de comprometimento e
-- precisa aceitar. Aceite transfere; recusa ou silencio de sete dias inativa o
-- predio, e reativar passa pelo admin.
--
-- Esta migration cria a tabela e nada mais — o fluxo e de outro PR, e nenhuma
-- rota escreve aqui ainda.
--
-- `status` e TEXT e nao enum, como em `building_access_requests`: sao quatro
-- valores de fluxo ('PENDENTE', 'ACEITO', 'RECUSADO', 'EXPIRADO') que o produto
-- ainda pode mexer, e um enum novo por fluxo custa migration a cada ajuste.
CREATE TABLE IF NOT EXISTS "building_ownership_transfers" (
  "id"              TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "building_id"     TEXT NOT NULL,
  "from_manager_id" TEXT NOT NULL,
  "to_manager_id"   TEXT NOT NULL,
  "status"          TEXT NOT NULL DEFAULT 'PENDENTE',
  "requested_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Sete dias depois do pedido. Passado o prazo sem resposta, o predio inativa.
  "expires_at"      TIMESTAMP(3) NOT NULL,
  -- Quando o indicado respondeu. Nulo enquanto o pedido esta de pe.
  "responded_at"    TIMESTAMP(3),
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "building_ownership_transfers_pkey" PRIMARY KEY ("id")
);

-- Um pedido de pe por predio. Parcial porque o predio pode ter varios pedidos
-- ja respondidos no historico, e nenhum deles impede o proximo.
CREATE UNIQUE INDEX IF NOT EXISTS "building_ownership_transfers_pending_key"
  ON "building_ownership_transfers" ("building_id")
  WHERE "status" = 'PENDENTE';

-- A tela do co-gestor e "os pedidos que esperam por mim".
CREATE INDEX IF NOT EXISTS "building_ownership_transfers_to_manager_id_status_idx"
  ON "building_ownership_transfers" ("to_manager_id", "status");
CREATE INDEX IF NOT EXISTS "building_ownership_transfers_building_id_idx"
  ON "building_ownership_transfers" ("building_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'building_ownership_transfers_building_id_fkey') THEN
    ALTER TABLE "building_ownership_transfers"
      ADD CONSTRAINT "building_ownership_transfers_building_id_fkey"
      FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'building_ownership_transfers_from_manager_id_fkey') THEN
    ALTER TABLE "building_ownership_transfers"
      ADD CONSTRAINT "building_ownership_transfers_from_manager_id_fkey"
      FOREIGN KEY ("from_manager_id") REFERENCES "managers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'building_ownership_transfers_to_manager_id_fkey') THEN
    ALTER TABLE "building_ownership_transfers"
      ADD CONSTRAINT "building_ownership_transfers_to_manager_id_fkey"
      FOREIGN KEY ("to_manager_id") REFERENCES "managers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- == 8. As colunas novas nas tabelas que ja existiam ==========================
-- O dono do predio: quem paga por ele. Nulo e possivel porque a conta pode
-- sumir, e o predio nao some junto — ele fica sem dono ate o admin ou uma
-- transferencia resolver.
ALTER TABLE "buildings" ADD COLUMN IF NOT EXISTS "owner_manager_id" TEXT;

-- Predio inativo: continua existindo e nao aceita mais trabalho. E o destino de
-- quem estourou o plano e nao regularizou, e do predio cuja transferencia de
-- dono ninguem aceitou. Nulo e predio normal.
ALTER TABLE "buildings" ADD COLUMN IF NOT EXISTS "frozen_at" TIMESTAMP(3);

-- Conta de gestor suspensa pelo admin. Diferente de `status = 'DELETED'`: a
-- conta existe, os predios dela existem, e voltar e tirar a data.
ALTER TABLE "managers" ADD COLUMN IF NOT EXISTS "suspended_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "buildings_owner_manager_id_idx"
  ON "buildings" ("owner_manager_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'buildings_owner_manager_id_fkey') THEN
    ALTER TABLE "buildings"
      ADD CONSTRAINT "buildings_owner_manager_id_fkey"
      FOREIGN KEY ("owner_manager_id") REFERENCES "managers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- == 9. Backfill do dono =====================================================
-- Quem criou o predio e o dono. Onde `created_by` ficou nulo (a conta que criou
-- sumiu), o dono passa a ser o gestor mais antigo entre os que administram o
-- predio — que e a melhor aproximacao possivel de "quem responde por ele".
-- Predio sem gestor nenhum fica sem dono, e isso e correto: nao ha a quem
-- cobrar.
UPDATE "buildings" b
SET "owner_manager_id" = COALESCE(
  b."created_by",
  (
    SELECT bm."manager_id"
    FROM "building_managers" bm
    WHERE bm."building_id" = b."id"
    ORDER BY bm."joined_at" ASC, bm."id" ASC
    LIMIT 1
  )
)
WHERE b."owner_manager_id" IS NULL;

-- == 10. Grandfathering ======================================================
-- Quem ja usava o Viston antes dos planos nao pode acordar num produto menor do
-- que o que tinha ontem. Cada conta de gestor existente ganha uma concessao de
-- ESSENCIAL por 90 dias — tempo de conhecer os planos e escolher, em vez de
-- descobrir o assunto por um 403.
--
-- Vale so para quem existe agora: o INSERT le `managers` no instante em que a
-- migration roda, e quem se cadastrar depois comeca no LIVRE, como manda o
-- produto. O NOT EXISTS torna a repeticao inofensiva.
INSERT INTO "plan_grants" ("manager_id", "plan", "reason", "starts_at", "expires_at")
SELECT m."id", 'ESSENCIAL', 'conta anterior aos planos', CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP + INTERVAL '90 days'
FROM "managers" m
WHERE NOT EXISTS (
  SELECT 1 FROM "plan_grants" g
  WHERE g."manager_id" = m."id" AND g."reason" = 'conta anterior aos planos'
);

-- == 11. RLS =================================================================
-- Mesma trava das demais tabelas (ver 20260813000200_row_level_security): a API
-- PostgREST do Supabase esta na internet, e ninguem fala com estas tabelas por
-- ela. Sem politica nenhuma, anon e authenticated nao enxergam linha alguma; o
-- Prisma conecta como `postgres`, que tem BYPASSRLS.
--
-- Sem isto, a tabela nasce legivel pela chave anonima — e o que ela guarda e
-- quem paga quanto, por qual cartao, e o corpo dos eventos do Stripe.
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plan_grants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stripe_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "usage_counters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "photo_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "building_ownership_transfers" ENABLE ROW LEVEL SECURITY;
