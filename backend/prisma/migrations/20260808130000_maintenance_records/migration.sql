-- Troca o checklist fixo de itens (form_item_responses) pelas ocorrencias de manutencao.
-- ATENCAO: destrutivo. As respostas antigas de checklist sao apagadas.

-- ─────────────────────────────────────────────
-- ENUMS
-- ─────────────────────────────────────────────

CREATE TYPE "MaintenanceType" AS ENUM (
    'AR_CONDICIONADO',
    'CIVIL',
    'ELETRICA',
    'EQUIPAMENTO',
    'EVENTOS',
    'HIDRELETRICA',
    'HIGIENIZACAO_LIMPEZA',
    'INFILTRACAO',
    'MARCENARIA',
    'MOVEIS_CADEIRAS',
    'PINTURA',
    'PROJETOR',
    'VAZAMENTO'
);

CREATE TYPE "MaintenanceCategory" AS ENUM (
    'PREVENTIVA',
    'CORRETIVA',
    'EMERGENCIAL',
    'EVENTOS',
    'PROJETOS'
);

CREATE TYPE "Priority" AS ENUM ('ALTA', 'MEDIA', 'BAIXA');

CREATE TYPE "RecordStatus" AS ENUM (
    'ABERTO',
    'EM_ANDAMENTO',
    'AGUARDANDO_TERCEIRO',
    'CONCLUIDO'
);

-- ─────────────────────────────────────────────
-- NOVA TABELA
-- ─────────────────────────────────────────────

CREATE TABLE "maintenance_records" (
    "id" TEXT NOT NULL,
    "floor_form_entry_id" TEXT NOT NULL,
    "maintenance_type" "MaintenanceType" NOT NULL,
    "category" "MaintenanceCategory" NOT NULL,
    "priority" "Priority" NOT NULL,
    "description" TEXT NOT NULL,
    "responsible" TEXT NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ABERTO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_records_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "maintenance_records"
    ADD CONSTRAINT "maintenance_records_floor_form_entry_id_fkey"
    FOREIGN KEY ("floor_form_entry_id") REFERENCES "floor_form_entries"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────
-- LIMPEZA DO MODELO ANTIGO
-- ─────────────────────────────────────────────

ALTER TABLE "floor_form_entries" DROP COLUMN IF EXISTS "observations";
ALTER TABLE "floor_form_entries" DROP COLUMN IF EXISTS "photos";

DROP TABLE IF EXISTS "form_item_responses";
DROP TYPE IF EXISTS "ItemCategory";
DROP TYPE IF EXISTS "ItemStatus";
