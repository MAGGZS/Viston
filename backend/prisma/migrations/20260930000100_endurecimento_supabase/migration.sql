-- Endurecimento do banco no Supabase.
--
-- 1. Nenhum privilégio para `anon` e `authenticated` no schema public.
--
--    O RLS (20260813000200) já fecha a API PostgREST: sem policy, essas duas
--    roles não enxergam linha nenhuma. Mas o Supabase dá a elas GRANT ALL em toda
--    tabela nova, e o RLS vira a única barreira: uma tabela criada sem
--    `ENABLE ROW LEVEL SECURITY` nasceria legível e gravável pela chave anon, que
--    é pública. Tirando o privilégio, esquecer o RLS deixa de ser vazamento.
--
--    O app não usa essas roles: o frontend fala só com a API do Render, e o
--    backend conecta como `postgres` pelo Prisma.
--
-- 2. Bucket `viston-excel` privado.
--
--    A migration 20260821000100 passou o código para URL assinada e pedia para
--    marcar o bucket como privado no painel, o que nunca foi feito. Enquanto ele
--    for público, link antigo de planilha abre sem login, para sempre.
--
-- Em Postgres sem Supabase (o do CI) as roles e o schema `storage` não existem,
-- e os blocos abaixo não fazem nada.

DO $$
DECLARE
  papel text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', papel);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', papel);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', papel);
      -- O que o `postgres` criar daqui em diante (as migrations) já nasce fechado.
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM %I', papel);
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', papel);
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', papel);
    END IF;
  END LOOP;

  -- Funções nascem executáveis por PUBLIC (todo mundo, inclusive anon).
  REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
END $$;

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    UPDATE storage.buckets SET public = false WHERE id = 'viston-excel';
  END IF;
END $$;
