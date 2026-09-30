-- Três chaves estrangeiras que o advisor do Supabase ainda apontava sem índice.
-- Sem eles, apagar um usuário ou gestor faz varredura completa nessas tabelas
-- (o ON DELETE precisa achar as linhas filhas).
--
-- Só cria índice: não altera nem apaga dado.

CREATE INDEX IF NOT EXISTS "building_access_requests_user_id_idx"
  ON "building_access_requests"("user_id");

CREATE INDEX IF NOT EXISTS "building_ownership_transfers_from_manager_id_idx"
  ON "building_ownership_transfers"("from_manager_id");

CREATE INDEX IF NOT EXISTS "buildings_created_by_idx"
  ON "buildings"("created_by");
