-- Encaminhar deixa de comecar o trabalho: agora ha o aceite do responsavel.
--
-- Ate aqui o moderador encaminhava e o chamado ja nascia EM_ANDAMENTO — o
-- sistema afirmava que alguem tinha comecado a trabalhar sem que essa pessoa
-- tivesse dito nada. Quem atende ficava sabendo do chamado pela tela, e o
-- moderador nao tinha como distinguir "mandei" de "esta sendo feito".
--
-- ENCAMINHADO e esse passo que faltava, e entra logo depois de ABERTO porque e
-- por onde o chamado passa antes de andar: ABERTO -> ENCAMINHADO ->
-- EM_ANDAMENTO. `received_at` e o carimbo do aceite, na mesma familia de
-- forwarded_at/done_at/closed_at: o status diz onde o chamado esta, as datas
-- dizem quando ele chegou la.
--
-- O backfill vem numa migration separada (ticket_encaminhado_backfill) de
-- proposito: o Prisma roda cada migration numa transacao, e o Postgres nao
-- deixa *usar* um valor de enum criado na mesma transacao em que foi criado.
--
-- Os IF NOT EXISTS seguem o resto das migrations: rodar duas vezes nao pode
-- quebrar o deploy.

ALTER TYPE "RecordStatus" ADD VALUE IF NOT EXISTS 'ENCAMINHADO' AFTER 'ABERTO';

ALTER TABLE "maintenance_records" ADD COLUMN IF NOT EXISTS "received_at" TIMESTAMP(3);
