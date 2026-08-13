-- Fase 1 — o vinculo passa a poder dizer "gestor".
--
-- Ate aqui quem administrava um predio era quem constava em buildings.created_by,
-- e o CHECK abaixo so aceitava INSPECTOR/VIEWER — por isso o gestor nao aparecia
-- entre os membros do proprio predio. Esta migration e aditiva de proposito: o
-- backend antigo continua funcionando depois dela, porque nada do que ele le
-- muda de forma.

-- 1. GESTOR vira um papel de vinculo valido
ALTER TABLE "building_members" DROP CONSTRAINT IF EXISTS "building_members_role_check";
ALTER TABLE "building_members"
  ADD CONSTRAINT "building_members_role_check"
  CHECK ("role" IN ('GESTOR', 'INSPECTOR', 'VIEWER'));

-- 2. Backfill: quem criou o predio vira membro GESTOR dele.
--
-- Cobre 100% da base — o unico predio orfao (criado pela conta admin e sem
-- gestor identificavel) foi excluido antes desta migration, junto com o unico
-- andar dele, sem relatorio nem membro nenhum.
--
-- O ON CONFLICT cobre o caso de o criador ja constar como membro comum: ele
-- sobe para GESTOR em vez de a insercao falhar.
INSERT INTO "building_members" ("building_id", "user_id", "role")
SELECT b."id", b."created_by", 'GESTOR'
FROM "buildings" b
WHERE b."created_by" IS NOT NULL
ON CONFLICT ("building_id", "user_id") DO UPDATE SET "role" = 'GESTOR';

-- 3. Consulta por usuario: a partir daqui todo request resolve o papel pela
-- membership, e o unico indice existente comeca por building_id.
CREATE INDEX IF NOT EXISTS "building_members_user_id_idx" ON "building_members" ("user_id");

-- 4. Trilha de auditoria por predio.
--
-- Sem esta coluna o gestor nao consegue separar o historico do predio dele do
-- resto do sistema: os relatorios tem building_id, os logs nao tinham.
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "building_id" TEXT;

ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_building_id_fkey";
ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_building_id_fkey"
  FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "audit_logs_building_id_idx" ON "audit_logs" ("building_id");
