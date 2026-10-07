-- A agenda de vistorias: quem vistoria, quais andares, de quando até quando —
-- e o sino que avisa o inspetor.
--
-- Só acrescenta. Nenhuma tabela existente perde coluna nem dado; o único toque
-- no que já existe são três valores novos em "AuditAction".
--
-- As decisões que explicam o desenho:
--
-- 1. `scheduled_date` e `due_date` são DATE, como `inspection_reports.date`:
--    são dias do calendário de quem trabalha, não instantes. "Atrasado" (a
--    partir do dia agendado) e "passou do limite" (a partir do prazo) saem da
--    comparação com o dia de hoje no fuso do produto, e não de um status
--    gravado — status gravado envelhece sozinho à meia-noite.
--
-- 2. `inspector_id` é SET NULL, como em `inspection_reports`: a conta pode
--    sumir, e a agenda do prédio não some junto.
--
-- 3. Os andares ficam numa tabela de ligação, e não num array: apagar o andar
--    o tira da agenda pela chave estrangeira, sem ninguém para lembrar.
--
-- 4. `due_soon_notified_at` torna o lembrete "vence amanhã" idempotente. O job
--    marca antes de avisar, e só avisa quem conseguiu marcar — rodar duas
--    vezes no mesmo dia não manda o lembrete duas vezes. Atraso não gera aviso
--    ao inspetor: é só visual, na agenda.
--
-- 5. `notifications.type` é texto, e não enum: aviso novo não deveria custar
--    migration (o mesmo motivo de `building_access_requests.status`).

-- == 1. Enums ================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ScheduleStatus') THEN
    CREATE TYPE "ScheduleStatus" AS ENUM ('PENDENTE', 'CONCLUIDO', 'CANCELADO');
  END IF;
END
$$;

-- Marcar, mudar e desmarcar a ronda de alguém vão para a trilha do prédio.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SCHEDULE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SCHEDULE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SCHEDULE_CANCELED';

-- == 2. O agendamento ========================================================
CREATE TABLE IF NOT EXISTS "inspection_schedules" (
    "id" TEXT NOT NULL,
    "building_id" TEXT NOT NULL,
    "inspector_id" TEXT,
    "scheduled_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "notes" TEXT,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'PENDENTE',
    "completed_at" TIMESTAMP(3),
    "completed_report_id" TEXT,
    "created_by_manager_id" TEXT,
    "created_by_user_id" TEXT,
    "updated_by_manager_id" TEXT,
    "updated_by_user_id" TEXT,
    "due_soon_notified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inspection_schedules_pkey" PRIMARY KEY ("id"),
    -- O prazo não vem antes do início. A API já recusa com 400; o CHECK é para
    -- o que chegar ao banco por outro caminho. O Prisma não modela CHECK.
    CONSTRAINT "inspection_schedules_prazo_check" CHECK ("due_date" >= "scheduled_date")
);

-- A agenda do prédio é sempre "um recorte de datas, em ordem".
CREATE INDEX IF NOT EXISTS "inspection_schedules_building_id_scheduled_date_idx"
  ON "inspection_schedules"("building_id", "scheduled_date");
-- "O que está pendente para mim": a agenda do inspetor e a sugestão.
CREATE INDEX IF NOT EXISTS "inspection_schedules_inspector_id_status_idx"
  ON "inspection_schedules"("inspector_id", "status");
-- O ciclo diário procura os pendentes pelo prazo.
CREATE INDEX IF NOT EXISTS "inspection_schedules_status_due_date_idx"
  ON "inspection_schedules"("status", "due_date");
-- O Postgres não indexa FK sozinho, e o ON DELETE precisa achar as filhas.
CREATE INDEX IF NOT EXISTS "inspection_schedules_completed_report_id_idx"
  ON "inspection_schedules"("completed_report_id");
CREATE INDEX IF NOT EXISTS "inspection_schedules_created_by_manager_id_idx"
  ON "inspection_schedules"("created_by_manager_id");
CREATE INDEX IF NOT EXISTS "inspection_schedules_created_by_user_id_idx"
  ON "inspection_schedules"("created_by_user_id");
CREATE INDEX IF NOT EXISTS "inspection_schedules_updated_by_manager_id_idx"
  ON "inspection_schedules"("updated_by_manager_id");
CREATE INDEX IF NOT EXISTS "inspection_schedules_updated_by_user_id_idx"
  ON "inspection_schedules"("updated_by_user_id");

ALTER TABLE "inspection_schedules" ADD CONSTRAINT "inspection_schedules_building_id_fkey"
  FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inspection_schedules" ADD CONSTRAINT "inspection_schedules_inspector_id_fkey"
  FOREIGN KEY ("inspector_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inspection_schedules" ADD CONSTRAINT "inspection_schedules_completed_report_id_fkey"
  FOREIGN KEY ("completed_report_id") REFERENCES "inspection_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inspection_schedules" ADD CONSTRAINT "inspection_schedules_created_by_manager_id_fkey"
  FOREIGN KEY ("created_by_manager_id") REFERENCES "managers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inspection_schedules" ADD CONSTRAINT "inspection_schedules_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inspection_schedules" ADD CONSTRAINT "inspection_schedules_updated_by_manager_id_fkey"
  FOREIGN KEY ("updated_by_manager_id") REFERENCES "managers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inspection_schedules" ADD CONSTRAINT "inspection_schedules_updated_by_user_id_fkey"
  FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- == 3. Os andares do agendamento ============================================
CREATE TABLE IF NOT EXISTS "inspection_schedule_floors" (
    "schedule_id" TEXT NOT NULL,
    "floor_id" TEXT NOT NULL,

    CONSTRAINT "inspection_schedule_floors_pkey" PRIMARY KEY ("schedule_id", "floor_id")
);

CREATE INDEX IF NOT EXISTS "inspection_schedule_floors_floor_id_idx"
  ON "inspection_schedule_floors"("floor_id");

ALTER TABLE "inspection_schedule_floors" ADD CONSTRAINT "inspection_schedule_floors_schedule_id_fkey"
  FOREIGN KEY ("schedule_id") REFERENCES "inspection_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inspection_schedule_floors" ADD CONSTRAINT "inspection_schedule_floors_floor_id_fkey"
  FOREIGN KEY ("floor_id") REFERENCES "floors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- == 4. O sino ===============================================================
CREATE TABLE IF NOT EXISTS "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "building_id" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- O sino é "as minhas, não lidas primeiro, das mais novas para as velhas".
CREATE INDEX IF NOT EXISTS "notifications_user_id_read_at_created_at_idx"
  ON "notifications"("user_id", "read_at", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "notifications_building_id_idx"
  ON "notifications"("building_id");

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_building_id_fkey"
  FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- == 5. Fechadas para a API pública do Supabase ==============================
-- O mesmo par de barreiras do resto do schema (20260813000200 e
-- 20260930000100): RLS ligado sem policy, e nenhum privilégio para `anon` e
-- `authenticated`. O backend conecta como `postgres` e não passa por nenhuma
-- das duas. Em Postgres sem Supabase (o do CI) as roles não existem e o bloco
-- não faz nada.
ALTER TABLE "inspection_schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inspection_schedule_floors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  papel text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format('REVOKE ALL ON TABLE "inspection_schedules" FROM %I', papel);
      EXECUTE format('REVOKE ALL ON TABLE "inspection_schedule_floors" FROM %I', papel);
      EXECUTE format('REVOKE ALL ON TABLE "notifications" FROM %I', papel);
    END IF;
  END LOOP;
END $$;
