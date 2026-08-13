-- Fase 2 — users.role deixa de mandar em predio.
--
-- Rodar SO depois que o backend estiver lendo o papel de building_members
-- (ver src/middlewares/buildingAccess.ts). As duas coisas viajam no mesmo
-- deploy: o Render aplica as migrations no build, antes de subir o processo
-- novo, e o codigo novo ja nasce lendo a membership.
--
-- Depois daqui a conta so tem dois estados possiveis no sistema: ADMIN (suporte)
-- e NONE (todo o resto). Quem e gestor, inspetor ou visualizador — e de qual
-- predio — esta em building_members, e so la.

-- 1. Papel da conta: dois valores, e nada de predio no meio
CREATE TYPE "AccountRole" AS ENUM ('ADMIN', 'NONE');

ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users"
  ALTER COLUMN "role" TYPE "AccountRole"
  USING (CASE WHEN "role"::text = 'ADMIN' THEN 'ADMIN' ELSE 'NONE' END)::"AccountRole";
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'NONE';

-- 2. Papel do vinculo: sai o texto com CHECK, entra enum de verdade
CREATE TYPE "BuildingRole" AS ENUM ('GESTOR', 'INSPECTOR', 'VIEWER');

ALTER TABLE "building_members" DROP CONSTRAINT IF EXISTS "building_members_role_check";
ALTER TABLE "building_members"
  ALTER COLUMN "role" TYPE "BuildingRole" USING "role"::"BuildingRole";

-- 3. O enum antigo misturava os dois eixos; sem coluna apontando para ele, sai.
DROP TYPE "Role";
