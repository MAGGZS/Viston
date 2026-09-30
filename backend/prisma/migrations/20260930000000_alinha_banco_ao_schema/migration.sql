-- Alinha o banco ao schema.prisma.
--
-- Depois de recriar o banco do zero a partir das migrations e comparar com o
-- `schema.prisma` (`prisma migrate diff`), sobravam só diferenças herdadas das
-- tabelas criadas à mão no painel do Supabase. Produção tem exatamente as mesmas.
-- Nenhuma muda dado:
--
-- - `id` com DEFAULT gen_random_uuid(): o Prisma gera o id no cliente
--   (`@default(uuid())`), então o default do banco nunca era usado pelo código.
--   A partir daqui, migration que fizer INSERT direto precisa informar o `id`.
-- - `joined_at` / `requested_at` passam a NOT NULL: o client já os tipa como
--   obrigatórios, e produção não tem nenhuma linha nula (conferido em 2026-09-30).
-- - `timestamp` vira `timestamp(3)`, como no resto do banco.
-- - FKs de `building_members` e `building_access_requests` ganham ON UPDATE CASCADE.
--
-- Com isso, `prisma migrate diff` entre migrations e schema dá vazio, que é o que
-- o job de migrations do CI confere.

-- DropForeignKey
ALTER TABLE "building_access_requests" DROP CONSTRAINT "building_access_requests_building_id_fkey";

-- DropForeignKey
ALTER TABLE "building_access_requests" DROP CONSTRAINT "building_access_requests_user_id_fkey";

-- DropForeignKey
ALTER TABLE "building_members" DROP CONSTRAINT "building_members_building_id_fkey";

-- DropForeignKey
ALTER TABLE "building_members" DROP CONSTRAINT "building_members_user_id_fkey";

-- AlterTable
ALTER TABLE "building_access_requests" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "requested_at" SET NOT NULL,
ALTER COLUMN "requested_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "reviewed_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "building_managers" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "building_members" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "joined_at" SET NOT NULL,
ALTER COLUMN "joined_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "building_ownership_transfers" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "feedbacks" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "managers" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "photo_assets" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "plan_grants" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "subscriptions" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ticket_updates" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "photos" DROP DEFAULT;

-- AlterTable
ALTER TABLE "usage_counters" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "building_members" ADD CONSTRAINT "building_members_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "building_members" ADD CONSTRAINT "building_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "building_access_requests" ADD CONSTRAINT "building_access_requests_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "building_access_requests" ADD CONSTRAINT "building_access_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

