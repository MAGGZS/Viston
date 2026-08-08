-- Permite exclusao real de predios e usuarios.
-- Predio: cascata para andares, inspecoes, entradas de andar e respostas.
-- Usuario: inspecoes preservadas com inspector_id nulo; predios criados mantem created_by nulo.

-- inspection_reports.inspector_id passa a ser opcional
ALTER TABLE "inspection_reports" ALTER COLUMN "inspector_id" DROP NOT NULL;

-- buildings.created_by -> SET NULL ao apagar usuario
ALTER TABLE "buildings" DROP CONSTRAINT IF EXISTS "buildings_created_by_fkey";
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- floors.building_id -> CASCADE
ALTER TABLE "floors" DROP CONSTRAINT IF EXISTS "floors_building_id_fkey";
ALTER TABLE "floors" ADD CONSTRAINT "floors_building_id_fkey"
    FOREIGN KEY ("building_id") REFERENCES "buildings"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- inspection_reports.inspector_id -> SET NULL
ALTER TABLE "inspection_reports" DROP CONSTRAINT IF EXISTS "inspection_reports_inspector_id_fkey";
ALTER TABLE "inspection_reports" ADD CONSTRAINT "inspection_reports_inspector_id_fkey"
    FOREIGN KEY ("inspector_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- inspection_reports.building_id -> CASCADE
ALTER TABLE "inspection_reports" DROP CONSTRAINT IF EXISTS "inspection_reports_building_id_fkey";
ALTER TABLE "inspection_reports" ADD CONSTRAINT "inspection_reports_building_id_fkey"
    FOREIGN KEY ("building_id") REFERENCES "buildings"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- floor_form_entries.report_id -> CASCADE
ALTER TABLE "floor_form_entries" DROP CONSTRAINT IF EXISTS "floor_form_entries_report_id_fkey";
ALTER TABLE "floor_form_entries" ADD CONSTRAINT "floor_form_entries_report_id_fkey"
    FOREIGN KEY ("report_id") REFERENCES "inspection_reports"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- floor_form_entries.floor_id -> CASCADE
ALTER TABLE "floor_form_entries" DROP CONSTRAINT IF EXISTS "floor_form_entries_floor_id_fkey";
ALTER TABLE "floor_form_entries" ADD CONSTRAINT "floor_form_entries_floor_id_fkey"
    FOREIGN KEY ("floor_id") REFERENCES "floors"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- form_item_responses.floor_form_entry_id -> CASCADE
ALTER TABLE "form_item_responses" DROP CONSTRAINT IF EXISTS "form_item_responses_floor_form_entry_id_fkey";
ALTER TABLE "form_item_responses" ADD CONSTRAINT "form_item_responses_floor_form_entry_id_fkey"
    FOREIGN KEY ("floor_form_entry_id") REFERENCES "floor_form_entries"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
