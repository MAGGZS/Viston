-- O que ja estava correndo continua correndo.
--
-- Os chamados que hoje estao EM_ANDAMENTO (e os que passaram dali para
-- AGUARDANDO_TERCEIRO, AGUARDANDO_FECHAMENTO ou CONCLUIDO) foram encaminhados
-- antes de o aceite existir: na pratica o responsavel os recebeu, so nao havia
-- onde carimbar isso. Ficam com `received_at` = `forwarded_at`, que e a unica
-- data verdadeira que temos do momento em que o chamado chegou a ele.
--
-- Nenhum registro antigo vira ENCAMINHADO. Jogar para "aguardando aceite" um
-- trabalho que ja esta sendo feito pararia a fila de quem esta com ele na mao,
-- e pediria um aceite de algo aceito ha semanas.
--
-- Separada da migration anterior porque a clausula abaixo cita 'ENCAMINHADO', e
-- o Postgres nao deixa usar um valor de enum na mesma transacao em que ele foi
-- criado — o Prisma roda cada migration numa transacao.
--
-- Rodar duas vezes nao muda nada: o `received_at IS NULL` faz o papel que o
-- IF NOT EXISTS faz no DDL das outras migrations.

UPDATE "maintenance_records"
   SET "received_at" = "forwarded_at"
 WHERE "received_at"  IS NULL
   AND "forwarded_at" IS NOT NULL
   AND "status" <> 'ABERTO'
   AND "status" <> 'ENCAMINHADO';
