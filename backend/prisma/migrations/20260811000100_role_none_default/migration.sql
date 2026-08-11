-- Conta nova nasce sem nivel de acesso.
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'NONE';

-- Alinha a base com a regra: quem nao esta em predio nenhum nao tem nivel.
-- ADMIN e GESTOR ficam de fora — eles existem sem depender de vinculo.
UPDATE "users"
SET "role" = 'NONE'
WHERE "role" IN ('VIEWER', 'INSPECTOR')
  AND "id" NOT IN (SELECT "user_id" FROM "building_members");
