-- Confirmação de e-mail no cadastro.
--
-- O cadastro é aberto: qualquer um cria conta. Até aqui a conta nascia usável,
-- então ninguém precisava provar ser dono do endereço que digitou. Passa a
-- precisar: `email_verified_at` nulo é conta que existe e não entra.
--
-- Vale para as duas tabelas de conta. `managers` tem cadastro público igual ao
-- de `users`, e deixar gestor de fora seria abrir a porta que esta migration
-- fecha — não existe exceção por tipo de conta nem por papel.

ALTER TABLE "users"    ADD COLUMN "email_verified_at" TIMESTAMP(3);
ALTER TABLE "managers" ADD COLUMN "email_verified_at" TIMESTAMP(3);

-- E-mail único ignorando a caixa.
--
-- O unique que já existia é sobre o texto cru: `Joao@x.com` e `joao@x.com`
-- passavam como dois endereços, virando duas contas do mesmo dono — as duas com
-- link de confirmação válido. Verificado antes de aplicar: nenhuma colisão nas
-- 10 contas existentes, nem dentro de cada tabela nem entre elas.
CREATE UNIQUE INDEX "uq_users_email_lower"    ON "users"    (lower("email"));
CREATE UNIQUE INDEX "uq_managers_email_lower" ON "managers" (lower("email"));

-- BACKFILL. Quem já tem senha passa a valer como confirmado.
--
-- Sem estas duas linhas o bloqueio novo tranca, no instante do deploy, todas as
-- contas que já usavam o sistema. Elas nasceram antes desta regra existir e não
-- têm link para clicar: exigir delas uma confirmação que nunca foi enviada é
-- trancar a porta com todo mundo do lado de fora.
UPDATE "users"    SET "email_verified_at" = NOW() WHERE "password_hash" IS NOT NULL;
UPDATE "managers" SET "email_verified_at" = NOW() WHERE "password_hash" IS NOT NULL;

-- O link, guardado como hash.
--
-- `token_hash` é o sha256 do valor que foi no e-mail. O valor cru não existe em
-- lugar nenhum do sistema depois do envio: quem ler esta tabela inteira não
-- confirma conta nenhuma.
CREATE TABLE "email_tokens" (
    "id"         TEXT NOT NULL,
    "user_id"    TEXT,
    "manager_id" TEXT,
    "email"      TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at"    TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_tokens_pkey" PRIMARY KEY ("id"),
    -- Duas colunas de dono, uma conta por token. O `<>` entre dois booleanos é
    -- XOR: recusa o token órfão e o token que aponta para os dois lados.
    CONSTRAINT "email_tokens_one_owner"
      CHECK (("user_id" IS NOT NULL) <> ("manager_id" IS NOT NULL))
);

CREATE UNIQUE INDEX "email_tokens_token_hash_key" ON "email_tokens" ("token_hash");
CREATE INDEX "email_tokens_user_id_idx"    ON "email_tokens" ("user_id");
CREATE INDEX "email_tokens_manager_id_idx" ON "email_tokens" ("manager_id");

-- O teto de envios por hora conta por endereço, não por conta: no cadastro o
-- e-mail chega antes de existir conta para contar.
CREATE INDEX "email_tokens_email_created_at_idx"
  ON "email_tokens" (lower("email"), "created_at" DESC);

-- Conta apagada leva os links junto. Um token sem dono não confirma nada, e
-- deixá-lo para trás é guardar hash de e-mail de quem pediu para sair.
ALTER TABLE "email_tokens" ADD CONSTRAINT "email_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_tokens" ADD CONSTRAINT "email_tokens_manager_id_fkey"
  FOREIGN KEY ("manager_id") REFERENCES "managers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Mesma escolha de 20260813000200_row_level_security: RLS ligado, política
-- nenhuma. Fecha a porta do PostgREST, que fica exposta na internet; o Prisma
-- conecta como `postgres`, que tem BYPASSRLS, e não sente diferença.
ALTER TABLE "email_tokens" ENABLE ROW LEVEL SECURITY;
