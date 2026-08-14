-- Caixa de feedback do admin.
--
-- Qualquer conta manda sugestao ao admin, quantas vezes quiser. A linha nasce
-- PENDENTE e so sai dai por decisao dele: vira TAREFA (algo a fazer), vira
-- MENSAGEM (elogio, que so se le) ou e descartada — e descartar apaga a linha.
-- Nao existe status "descartado": feedback jogado fora nao serve para nada
-- depois, e guardar um cemiterio de linhas so faria a caixa crescer sozinha.
--
-- A autoria segue o desenho de audit_logs: user_id e manager_id, exatamente um
-- preenchido, porque quem manda pode ser das duas naturezas de conta. Os dois
-- vinculos sao SET NULL — a conta sai do sistema, a tarefa do admin fica.
--
-- Os IF NOT EXISTS existem porque este schema foi aplicado no Supabase antes de
-- o deploy rodar `prisma migrate deploy`: rodar duas vezes nao pode quebrar.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FeedbackStatus') THEN
    CREATE TYPE "FeedbackStatus" AS ENUM ('PENDENTE', 'TAREFA', 'MENSAGEM');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "feedbacks" (
  "id"          TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "user_id"     TEXT,
  "manager_id"  TEXT,
  "message"     TEXT NOT NULL,
  "status"      "FeedbackStatus" NOT NULL DEFAULT 'PENDENTE',
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Quando o admin decidiu o destino. Nulo enquanto ninguem mexeu.
  "reviewed_at" TIMESTAMP(3),
  CONSTRAINT "feedbacks_pkey" PRIMARY KEY ("id")
);

-- A tela do admin le sempre "um status, do mais novo para o mais velho".
CREATE INDEX IF NOT EXISTS "feedbacks_status_created_at_idx"
  ON "feedbacks" ("status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "feedbacks_user_id_idx" ON "feedbacks" ("user_id");
CREATE INDEX IF NOT EXISTS "feedbacks_manager_id_idx" ON "feedbacks" ("manager_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedbacks_user_id_fkey') THEN
    ALTER TABLE "feedbacks"
      ADD CONSTRAINT "feedbacks_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedbacks_manager_id_fkey') THEN
    ALTER TABLE "feedbacks"
      ADD CONSTRAINT "feedbacks_manager_id_fkey"
      FOREIGN KEY ("manager_id") REFERENCES "managers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- Mesma trava das demais tabelas (ver 20260813000200_row_level_security): a API
-- PostgREST do Supabase esta na internet, e ninguem fala com esta tabela por
-- ela. Sem politica nenhuma, anon e authenticated nao enxergam linha alguma; o
-- Prisma conecta como `postgres`, que tem BYPASSRLS.
ALTER TABLE "feedbacks" ENABLE ROW LEVEL SECURITY;
