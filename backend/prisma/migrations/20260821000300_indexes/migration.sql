-- Índices que faltavam.
--
-- `floors_inspected` é `TEXT[]`, e o filtro "vistorias que passaram por este
-- andar" (`has`) percorre a tabela inteira sem índice. Hoje a base é pequena; o
-- custo cresce em linha reta com ela. GIN é o índice de array do Postgres.
CREATE INDEX IF NOT EXISTS "inspection_reports_floors_inspected_idx"
  ON "inspection_reports" USING GIN ("floors_inspected");

-- A trilha de auditoria só tinha índice por prédio e por gestor, e toda consulta
-- dela ordena por tempo — sem índice, é ordenação da tabela inteira, numa tabela
-- que ganha uma linha a cada login e nunca perde nenhuma.
CREATE INDEX IF NOT EXISTS "audit_logs_building_id_timestamp_idx"
  ON "audit_logs" ("building_id", "timestamp" DESC);

CREATE INDEX IF NOT EXISTS "audit_logs_user_id_timestamp_idx"
  ON "audit_logs" ("user_id", "timestamp" DESC);

-- O índice só por prédio vira redundante: o composto acima responde as mesmas
-- consultas, e um índice a menos é uma escrita a menos por linha inserida.
DROP INDEX IF EXISTS "audit_logs_building_id_idx";
