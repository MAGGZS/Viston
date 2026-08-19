-- O relatorio do responsavel ao concluir.
--
-- Ate aqui o "terminei" era so um carimbo de data: o moderador recebia o
-- chamado de volta sem uma linha sobre o que foi feito, e tinha de perguntar
-- por fora para poder fechar. `done_report` e esse texto, e faz par com
-- `maintenance_note`, que e o que o moderador escreve do lado dele.
--
-- Opcional de proposito: nem toda manutencao tem o que relatar, e obrigar o
-- campo so encheria o banco de "ok" e "feito".
--
-- Os IF NOT EXISTS seguem o resto das migrations: rodar duas vezes nao pode
-- quebrar o deploy.

ALTER TABLE "maintenance_records" ADD COLUMN IF NOT EXISTS "done_report" TEXT;
