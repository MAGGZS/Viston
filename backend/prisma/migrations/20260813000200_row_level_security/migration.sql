-- RLS ligado em tudo.
--
-- O projeto no Supabase expoe a API PostgREST na internet. Sem RLS, qualquer um
-- de posse da anon key le as tabelas inteiras — inclusive users.password_hash.
-- O app nunca usou essa porta: o frontend fala so com a API do Render, e o
-- backend fala com o Postgres pelo Prisma.
--
-- Ligar RLS sem criar politica nenhuma fecha a porta: anon e authenticated
-- passam a nao enxergar linha alguma. O Prisma continua igual, porque conecta
-- como `postgres`, que tem BYPASSRLS.
--
-- Se um dia o app for falar direto com o Supabase, o caminho e escrever a
-- politica da tabela — nao desligar isto de volta.

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "buildings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "building_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "building_access_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "floors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inspection_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "floor_form_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "maintenance_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
