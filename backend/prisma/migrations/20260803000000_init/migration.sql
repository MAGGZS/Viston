-- Migration baseline: estado inicial do schema Viston
-- Gerada com --create-only e marcada como aplicada via:
--   npx prisma migrate resolve --applied 20260803000000_init
-- NÃO será re-executada pelo Prisma (já está no banco).

-- ─────────────────────────────────────────────
-- ENUMS
-- ─────────────────────────────────────────────

CREATE TYPE "Role" AS ENUM ('ADMIN', 'INSPECTOR', 'VIEWER');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DELETED');
CREATE TYPE "InspectionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');
CREATE TYPE "FloorStatus" AS ENUM ('OK', 'ATENCAO', 'PROBLEMA');
CREATE TYPE "ItemCategory" AS ENUM ('MANUTENCAO', 'LIMPEZA');
CREATE TYPE "ItemStatus" AS ENUM ('OK', 'NOK', 'NA');
CREATE TYPE "AuditAction" AS ENUM (
  'CREATE',
  'UPDATE',
  'DELETE',
  'LOGIN',
  'LOGOUT',
  'SYNC_GOOGLE_FORM',
  'SYNC_GOOGLE_FORM_FAILED',
  'FINISH_INSPECTION',
  'GENERATE_EXCEL'
);

-- ─────────────────────────────────────────────
-- TABLES
-- ─────────────────────────────────────────────

CREATE TABLE "users" (
    "id"            TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "email"         TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role"          "Role" NOT NULL DEFAULT 'INSPECTOR',
    "avatar_url"    TEXT,
    "status"        "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE TABLE "buildings" (
    "id"   TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "buildings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "floors" (
    "id"          TEXT NOT NULL,
    "building_id" TEXT NOT NULL,
    "label"       TEXT NOT NULL,
    "order"       INTEGER NOT NULL,

    CONSTRAINT "floors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "floors_building_id_order_key" ON "floors"("building_id", "order");

CREATE TABLE "inspection_reports" (
    "id"                    TEXT NOT NULL,
    "inspector_id"          TEXT NOT NULL,
    "building_id"           TEXT NOT NULL,
    "date"                  DATE NOT NULL,
    "started_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at"           TIMESTAMP(3),
    "floors_inspected"      TEXT[],
    "status"                "InspectionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "excel_url"             TEXT,
    "google_form_synced"    BOOLEAN NOT NULL DEFAULT false,
    "google_form_synced_at" TIMESTAMP(3),
    "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspection_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "floor_form_entries" (
    "id"           TEXT NOT NULL,
    "report_id"    TEXT NOT NULL,
    "floor_id"     TEXT NOT NULL,
    "status_geral" "FloorStatus" NOT NULL,
    "observations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "photos"       TEXT[] DEFAULT ARRAY[]::TEXT[],
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "floor_form_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "floor_form_entries_report_id_floor_id_key"
    ON "floor_form_entries"("report_id", "floor_id");

CREATE TABLE "form_item_responses" (
    "id"                  TEXT NOT NULL,
    "floor_form_entry_id" TEXT NOT NULL,
    "category"            "ItemCategory" NOT NULL,
    "item_name"           TEXT NOT NULL,
    "has_item"            BOOLEAN,
    "quantity"            INTEGER,
    "is_marked"           BOOLEAN,
    "status"              "ItemStatus",

    CONSTRAINT "form_item_responses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
    "id"        TEXT NOT NULL,
    "user_id"   TEXT,
    "action"    "AuditAction" NOT NULL,
    "entity"    TEXT,
    "entity_id" TEXT,
    "metadata"  JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- ─────────────────────────────────────────────
-- FOREIGN KEYS
-- ─────────────────────────────────────────────

ALTER TABLE "floors"
    ADD CONSTRAINT "floors_building_id_fkey"
    FOREIGN KEY ("building_id") REFERENCES "buildings"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inspection_reports"
    ADD CONSTRAINT "inspection_reports_inspector_id_fkey"
    FOREIGN KEY ("inspector_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inspection_reports"
    ADD CONSTRAINT "inspection_reports_building_id_fkey"
    FOREIGN KEY ("building_id") REFERENCES "buildings"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "floor_form_entries"
    ADD CONSTRAINT "floor_form_entries_report_id_fkey"
    FOREIGN KEY ("report_id") REFERENCES "inspection_reports"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "floor_form_entries"
    ADD CONSTRAINT "floor_form_entries_floor_id_fkey"
    FOREIGN KEY ("floor_id") REFERENCES "floors"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "form_item_responses"
    ADD CONSTRAINT "form_item_responses_floor_form_entry_id_fkey"
    FOREIGN KEY ("floor_form_entry_id") REFERENCES "floor_form_entries"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "audit_logs"
    ADD CONSTRAINT "audit_logs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────
-- RECUPERAÇÃO DO QUE FOI FEITO FORA DAS MIGRATIONS (2026-08-04 a 2026-08-08)
-- ─────────────────────────────────────────────
-- Entre esta baseline e `20260808000000_cascade_deletes`, o banco de produção
-- ganhou colunas e tabelas direto pelo painel do Supabase, sem migration. As
-- migrations seguintes já contam com elas, então um banco criado do zero (o do
-- CI, o de um dev novo) quebrava logo na segunda migration.
--
-- O bloco abaixo reproduz esse estado com a forma que as tabelas têm em
-- produção (defaults em SQL, `timestamp` sem precisão, FKs sem ON UPDATE).
-- Produção não roda isto de novo: esta migration já consta como aplicada lá.

ALTER TABLE "buildings" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "buildings" ADD COLUMN IF NOT EXISTS "created_by" TEXT;

ALTER TABLE "floors" DROP CONSTRAINT IF EXISTS "floors_building_id_order_key";
DROP INDEX IF EXISTS "floors_building_id_order_key";
ALTER TABLE "floors" DROP COLUMN IF EXISTS "order";
CREATE UNIQUE INDEX IF NOT EXISTS "floors_building_id_label_key" ON "floors"("building_id", "label");

CREATE TABLE IF NOT EXISTS "building_members" (
    "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "building_id" TEXT NOT NULL,
    "user_id"     TEXT NOT NULL,
    "role"        TEXT NOT NULL,
    "joined_at"   TIMESTAMP DEFAULT now(),

    CONSTRAINT "building_members_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "building_members_building_id_user_id_key" UNIQUE ("building_id", "user_id"),
    CONSTRAINT "building_members_building_id_fkey" FOREIGN KEY ("building_id")
        REFERENCES "buildings"("id") ON DELETE CASCADE,
    CONSTRAINT "building_members_user_id_fkey" FOREIGN KEY ("user_id")
        REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "building_access_requests" (
    "id"           TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "building_id"  TEXT NOT NULL,
    "user_id"      TEXT NOT NULL,
    "status"       TEXT NOT NULL DEFAULT 'PENDING',
    "requested_at" TIMESTAMP DEFAULT now(),
    "reviewed_at"  TIMESTAMP,

    CONSTRAINT "building_access_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "building_access_requests_building_id_user_id_key" UNIQUE ("building_id", "user_id"),
    CONSTRAINT "building_access_requests_status_check"
        CHECK ("status" = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'REJECTED'::text])),
    CONSTRAINT "building_access_requests_building_id_fkey" FOREIGN KEY ("building_id")
        REFERENCES "buildings"("id") ON DELETE CASCADE,
    CONSTRAINT "building_access_requests_user_id_fkey" FOREIGN KEY ("user_id")
        REFERENCES "users"("id") ON DELETE CASCADE
);
