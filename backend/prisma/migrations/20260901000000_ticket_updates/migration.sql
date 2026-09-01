-- A linha do tempo da manutencao.
--
-- Ate aqui o unico registro do trabalho era `done_report`: um texto so, escrito
-- no fim e sobrescrito a cada edicao. Manutencao que leva dias nao cabe nele —
-- o que se descobriu na segunda, a peca que chegou na quarta e o teste da sexta
-- viravam um paragrafo ou nada. Cada linha desta tabela e um passo com hora
-- propria, e o conjunto e o que o moderador le antes de fechar o chamado.
--
-- `author_name` fica congelado ao lado de `author_id` pelo mesmo motivo de
-- `maintenance_records.responsible`: o gestor nao esta em `users`, entao o id
-- fica nulo quando e ele que escreve, e o vinculo do usuario e SET NULL, entao
-- a conta pode sumir. Nos dois casos a linha continua dizendo quem a escreveu.
--
-- `photos` e TEXT[] com as URLs publicas do bucket de fotos — a mesma casa dos
-- avatares, e pela mesma razao (a foto vai em `<img>`, e URL assinada expiraria
-- na tela). Nao ha tabela de anexo porque nao ha nada a dizer sobre uma foto
-- alem de onde ela esta.
--
-- `ON DELETE CASCADE` no chamado: a linha do tempo nao sobrevive a ocorrencia
-- que ela conta.
--
-- Os IF NOT EXISTS seguem o padrao das migracoes anteriores: rodar duas vezes
-- nao pode quebrar.

CREATE TABLE IF NOT EXISTS "ticket_updates" (
  "id"          TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "ticket_id"   TEXT NOT NULL,
  "author_id"   TEXT,
  "author_name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "photos"      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Quando o autor corrigiu o texto. Nulo = como foi escrita.
  "edited_at"   TIMESTAMP(3),
  CONSTRAINT "ticket_updates_pkey" PRIMARY KEY ("id")
);

-- A leitura e sempre "a linha do tempo deste chamado, do comeco ao fim".
CREATE INDEX IF NOT EXISTS "ticket_updates_ticket_id_created_at_idx"
  ON "ticket_updates" ("ticket_id", "created_at");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ticket_updates_ticket_id_fkey') THEN
    ALTER TABLE "ticket_updates"
      ADD CONSTRAINT "ticket_updates_ticket_id_fkey"
      FOREIGN KEY ("ticket_id") REFERENCES "maintenance_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ticket_updates_author_id_fkey') THEN
    ALTER TABLE "ticket_updates"
      ADD CONSTRAINT "ticket_updates_author_id_fkey"
      FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- Mesma trava das demais tabelas (ver 20260813000200_row_level_security): a API
-- PostgREST do Supabase esta na internet, e ninguem fala com esta tabela por
-- ela. Sem politica nenhuma, anon e authenticated nao enxergam linha alguma; o
-- Prisma conecta como `postgres`, que tem BYPASSRLS.
ALTER TABLE "ticket_updates" ENABLE ROW LEVEL SECURITY;
