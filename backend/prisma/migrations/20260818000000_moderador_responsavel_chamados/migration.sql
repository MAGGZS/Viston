-- Moderador, responsavel, e a ocorrencia virando chamado.
--
-- Ate aqui a ocorrencia era um registro morto: nascia na vistoria com um
-- responsavel escolhido numa lista fixa de nomes ("Alan", "Gislaine", ...) que
-- nao correspondia a conta nenhuma, e ficava assim para sempre. Agora ela e um
-- chamado com dono e caminho: o moderador do predio recebe, encaminha a um
-- responsavel de verdade (uma conta vinculada aquele predio), o responsavel
-- informa que terminou e o moderador — so ele — fecha.
--
-- Os nomes antigos ficam gravados em `responsible`: sao o que o relatorio
-- daquela data mostrou, e reescrever historico para caber no desenho novo seria
-- mentir sobre o que aconteceu. O que sai e a lista fixa no codigo.
--
-- Os IF NOT EXISTS seguem o resto das migrations: rodar duas vezes nao pode
-- quebrar o deploy.

-- ── 1. Os dois niveis de acesso novos ───────────────────────────────────────
-- Papel de predio, como INSPECTOR e VIEWER: a mesma conta pode ser responsavel
-- num predio e nao ter nada a ver com outro.
ALTER TYPE "BuildingRole" ADD VALUE IF NOT EXISTS 'MODERADOR';
ALTER TYPE "BuildingRole" ADD VALUE IF NOT EXISTS 'RESPONSAVEL';

-- ── 2. O passo que faltava no ciclo do chamado ──────────────────────────────
-- "Concluido pelo responsavel, aguardando fechamento": o chamado continua
-- aberto. Sem este estado, informar a conclusao e fechar seriam a mesma coisa —
-- e fechar e do moderador.
ALTER TYPE "RecordStatus" ADD VALUE IF NOT EXISTS 'AGUARDANDO_FECHAMENTO' AFTER 'AGUARDANDO_TERCEIRO';

-- ── 3. O chamado ────────────────────────────────────────────────────────────
-- `responsible` deixa de ser obrigatorio: o inspetor pode nao saber a quem
-- aquilo cabe, e ai o chamado nasce sem dono e o moderador o encaminha.
ALTER TABLE "maintenance_records" ALTER COLUMN "responsible" DROP NOT NULL;

ALTER TABLE "maintenance_records" ADD COLUMN IF NOT EXISTS "responsible_id" TEXT;
-- As datas de cada passo. O status diz onde o chamado esta; elas dizem quando
-- ele chegou la, que e o que a tela do moderador mostra ao lado da descricao.
ALTER TABLE "maintenance_records" ADD COLUMN IF NOT EXISTS "forwarded_at" TIMESTAMP(3);
ALTER TABLE "maintenance_records" ADD COLUMN IF NOT EXISTS "done_at" TIMESTAMP(3);
ALTER TABLE "maintenance_records" ADD COLUMN IF NOT EXISTS "closed_at" TIMESTAMP(3);
ALTER TABLE "maintenance_records" ADD COLUMN IF NOT EXISTS "closed_by_id" TEXT;
-- O que o moderador acrescenta enquanto o chamado corre.
ALTER TABLE "maintenance_records" ADD COLUMN IF NOT EXISTS "maintenance_note" TEXT;
ALTER TABLE "maintenance_records" ADD COLUMN IF NOT EXISTS "maintenance_cost" DECIMAL(12,2);

-- Os dois vinculos sao SET NULL: a conta sai do sistema e o chamado fica. O
-- historico do predio nao pode evaporar porque um tecnico foi desligado.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maintenance_records_responsible_id_fkey') THEN
    ALTER TABLE "maintenance_records"
      ADD CONSTRAINT "maintenance_records_responsible_id_fkey"
      FOREIGN KEY ("responsible_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maintenance_records_closed_by_id_fkey') THEN
    ALTER TABLE "maintenance_records"
      ADD CONSTRAINT "maintenance_records_closed_by_id_fkey"
      FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- As tres telas de chamado sao "um status, do mais novo para o mais velho"; a
-- do responsavel e "o que e meu". A tabela so tinha a chave primaria e a FK do
-- andar, entao as duas leituras varreriam tudo.
CREATE INDEX IF NOT EXISTS "maintenance_records_status_created_at_idx"
  ON "maintenance_records" ("status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "maintenance_records_responsible_id_idx"
  ON "maintenance_records" ("responsible_id");
