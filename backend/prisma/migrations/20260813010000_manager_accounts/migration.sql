-- Gestor vira um tipo de conta proprio, fora da tabela de usuarios.
--
-- Ate aqui gestor era um usuario com vinculo GESTOR em building_members. Agora
-- e outra tabela: `managers`, com cadastro e login proprios. Estar nela ja e o
-- papel — por isso ela nao tem coluna `role`.
--
-- O que isso custa, e esta assumido: o gestor deixa de poder vistoriar, porque
-- inspection_reports.inspector_id aponta para `users` e ele sai de la.

-- ── 0. Desarmar o gatilho antigo ────────────────────────────────────────────
-- Ele guarda a regra "predio nunca fica sem gestor" olhando building_members, e
-- o passo 2 esvazia justamente as linhas GESTOR de la. Com o gatilho armado, o
-- DELETE dispara a excecao e a migration inteira aborta — junto com o deploy.
-- A mesma regra e rearmada no passo 7, ja sobre building_managers.
DROP TRIGGER IF EXISTS "building_members_keep_gestor_on_delete" ON "building_members";
DROP TRIGGER IF EXISTS "building_members_keep_gestor_on_demote" ON "building_members";
DROP FUNCTION IF EXISTS check_building_keeps_gestor();

-- ── 1. As duas tabelas novas ────────────────────────────────────────────────
CREATE TABLE "managers" (
  "id"            TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "name"          TEXT NOT NULL,
  "email"         TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "avatar_url"    TEXT,
  "status"        "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "managers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "managers_email_key" ON "managers" ("email");

-- Quem administra o predio. Tabela de ligacao, e nao uma coluna no predio: com
-- uma coluna so, o predio teria no maximo um gestor e transferir a gestao
-- exigiria reescrever quem o criou.
CREATE TABLE "building_managers" (
  "id"          TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "building_id" TEXT NOT NULL,
  "manager_id"  TEXT NOT NULL,
  "joined_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "building_managers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "building_managers_building_id_manager_id_key"
  ON "building_managers" ("building_id", "manager_id");
CREATE INDEX "building_managers_manager_id_idx" ON "building_managers" ("manager_id");

ALTER TABLE "building_managers"
  ADD CONSTRAINT "building_managers_building_id_fkey"
  FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "building_managers"
  ADD CONSTRAINT "building_managers_manager_id_fkey"
  FOREIGN KEY ("manager_id") REFERENCES "managers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 2. Mudanca de quem gestor era usuario ───────────────────────────────────
-- O id e preservado. Nao e detalhe: buildings.created_by ja aponta para esses
-- ids, e mante-los evita reescrever a coluna linha a linha.
INSERT INTO "managers" ("id", "name", "email", "password_hash", "avatar_url", "status", "created_at", "updated_at")
SELECT u."id", u."name", u."email", u."password_hash", u."avatar_url", u."status", u."created_at", u."updated_at"
FROM "users" u
WHERE EXISTS (
  SELECT 1 FROM "building_members" m WHERE m."user_id" = u."id" AND m."role" = 'GESTOR'
);

INSERT INTO "building_managers" ("building_id", "manager_id", "joined_at")
SELECT m."building_id", m."user_id", m."joined_at"
FROM "building_members" m
WHERE m."role" = 'GESTOR';

DELETE FROM "building_members" WHERE "role" = 'GESTOR';

-- ── 3. Auditoria: as acoes do gestor mudam de coluna ────────────────────────
ALTER TABLE "audit_logs" ADD COLUMN "manager_id" TEXT;

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_manager_id_fkey"
  FOREIGN KEY ("manager_id") REFERENCES "managers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "audit_logs_manager_id_idx" ON "audit_logs" ("manager_id");

-- Nada se perde: o registro passa de user_id para manager_id, com o mesmo id.
UPDATE "audit_logs" a
SET "manager_id" = a."user_id", "user_id" = NULL
WHERE EXISTS (SELECT 1 FROM "managers" g WHERE g."id" = a."user_id");

-- ── 4. created_by passa a apontar para managers ─────────────────────────────
ALTER TABLE "buildings" DROP CONSTRAINT IF EXISTS "buildings_created_by_fkey";
ALTER TABLE "buildings"
  ADD CONSTRAINT "buildings_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "managers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 5. A conta de usuario de quem virou gestor sai ──────────────────────────
-- Sem isso o mesmo e-mail existiria nas duas tabelas e o login ficaria ambiguo.
-- As vistorias que a pessoa tenha feito ficam no historico com inspector_id
-- nulo, como acontece com qualquer conta removida.
DELETE FROM "users" u
WHERE EXISTS (SELECT 1 FROM "managers" g WHERE g."id" = u."id");

-- ── 6. GESTOR sai do enum de papel de usuario ───────────────────────────────
-- Postgres nao remove valor de enum; o caminho e recriar o tipo. So funciona
-- porque o passo 2 ja tirou todas as linhas GESTOR de building_members.
ALTER TYPE "BuildingRole" RENAME TO "BuildingRole_old";
CREATE TYPE "BuildingRole" AS ENUM ('INSPECTOR', 'VIEWER');
ALTER TABLE "building_members"
  ALTER COLUMN "role" TYPE "BuildingRole" USING "role"::text::"BuildingRole";
DROP TYPE "BuildingRole_old";

-- ── 7. O gatilho do ultimo gestor, agora sobre building_managers ────────────
-- Sem rebaixamento agora: em building_managers estar na linha ja e ser gestor,
-- entao so o DELETE pode deixar o predio sem ninguem.
--
-- O EXISTS sobre buildings continua sendo o que impede o gatilho de tornar o
-- predio impossivel de excluir: quando a cascata roda, a linha do predio ja saiu.
CREATE OR REPLACE FUNCTION check_building_keeps_manager()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM buildings WHERE id = OLD.building_id)
     AND NOT EXISTS (
       SELECT 1 FROM building_managers
       WHERE building_id = OLD.building_id AND id <> OLD.id
     )
  THEN
    RAISE EXCEPTION 'O predio % ficaria sem gestor', OLD.building_id
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER building_managers_keep_one
  BEFORE DELETE ON building_managers
  FOR EACH ROW
  EXECUTE FUNCTION check_building_keeps_manager();

-- ── 8. RLS nas tabelas novas ────────────────────────────────────────────────
-- Mesma regra do resto: ligada e sem policy, para a API publica do Supabase nao
-- devolver linha nenhuma. `managers` guarda password_hash.
ALTER TABLE "managers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "building_managers" ENABLE ROW LEVEL SECURITY;
