-- O teto diário de e-mails da agenda, somando todos os clientes.
--
-- Só acrescenta: uma tabela nova, pequena, sem tocar em nada que existe.
--
-- Por que não `usage_counters`: lá cada linha é de uma conta de gestor
-- (`manager_id` NOT NULL, com chave estrangeira) e de um mês. O teto aqui é do
-- sistema inteiro e de um dia — encaixar nele exigiria um gestor de mentira.
--
-- Uma linha por (escopo, dia). O dia é `yyyy-MM-dd` no fuso do produto, como o
-- `period` de `usage_counters` é o mês. O backend reserva o envio com um único
-- INSERT ... ON CONFLICT DO UPDATE ... WHERE sent < teto RETURNING: duas
-- requisições juntas não passam as duas do teto.
CREATE TABLE IF NOT EXISTS "email_daily_counters" (
  "scope"      TEXT NOT NULL,
  "day"        TEXT NOT NULL,
  "sent"       INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_daily_counters_pkey" PRIMARY KEY ("scope", "day")
);

-- Fechada para a API pública do Supabase, como o resto do schema (ver
-- 20261007000000_agenda_de_vistorias, seção 5).
ALTER TABLE "email_daily_counters" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  papel text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format('REVOKE ALL ON TABLE "email_daily_counters" FROM %I', papel);
    END IF;
  END LOOP;
END $$;
