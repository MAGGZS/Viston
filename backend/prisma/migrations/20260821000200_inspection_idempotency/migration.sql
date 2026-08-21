-- Envio duplicado deixa de criar duas vistorias.
--
-- Não havia nada impedindo: toque duplo no botão, ou o retry automático de uma
-- rede ruim, criava dois relatórios idênticos — duas linhas no calendário, dois
-- chamados por ocorrência, e a planilha do dia refeita duas vezes. No uso em
-- campo, com 4G no corredor de um prédio, isso não é hipótese.
--
-- O caminho não é um índice único em (prédio, inspetor, dia): duas vistorias do
-- mesmo prédio no mesmo dia pelo mesmo inspetor são legítimas — a planilha do
-- dia existe justamente para juntá-las. O que precisa ser único é a *tentativa*
-- de envio, e é isso que a chave guarda.
--
-- Nula em tudo que já existe, e nula é permitida no unique do Postgres: só os
-- envios novos, que mandam o cabeçalho `Idempotency-Key`, entram na regra.
ALTER TABLE "inspection_reports" ADD COLUMN "submission_key" TEXT;

CREATE UNIQUE INDEX "inspection_reports_submission_key_key"
  ON "inspection_reports" ("submission_key");
