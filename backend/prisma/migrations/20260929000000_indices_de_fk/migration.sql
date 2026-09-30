-- Índices que faltavam em chaves estrangeiras e em buscas do dia a dia.
--
-- O Postgres não cria índice para FK sozinho. O mais importante é o primeiro:
-- o chamado não tem building_id, e todo filtro "chamados do prédio" (listagem,
-- contadores, painel analítico) desce por maintenance_records ->
-- floor_form_entries -> inspection_reports. Sem ele, o join lê a tabela de
-- chamados de todos os prédios.
--
-- Só cria índice: não altera nem apaga dado. IF NOT EXISTS deixa a migration
-- segura mesmo se algum índice já tiver sido criado à mão no banco.

CREATE INDEX IF NOT EXISTS "maintenance_records_floor_form_entry_id_idx"
  ON "maintenance_records"("floor_form_entry_id");

CREATE INDEX IF NOT EXISTS "maintenance_records_closed_by_id_idx"
  ON "maintenance_records"("closed_by_id");

CREATE INDEX IF NOT EXISTS "floor_form_entries_floor_id_idx"
  ON "floor_form_entries"("floor_id");

CREATE INDEX IF NOT EXISTS "inspection_reports_building_id_date_idx"
  ON "inspection_reports"("building_id", "date");

CREATE INDEX IF NOT EXISTS "inspection_reports_inspector_id_idx"
  ON "inspection_reports"("inspector_id");

CREATE INDEX IF NOT EXISTS "ticket_updates_author_id_idx"
  ON "ticket_updates"("author_id");

CREATE INDEX IF NOT EXISTS "plan_grants_granted_by_idx"
  ON "plan_grants"("granted_by");

-- Quem fechou o chamado, quando foi um gestor, sai do log de auditoria
-- (ticketRepository.findCloseLogs). Sem este índice a busca lia o log inteiro,
-- que ganha uma linha a cada login.
CREATE INDEX IF NOT EXISTS "audit_logs_entity_entity_id_timestamp_idx"
  ON "audit_logs"("entity", "entity_id", "timestamp" DESC);
