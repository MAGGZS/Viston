-- A ultima tabela do schema `public` sem RLS.
--
-- A migration 20260813000200 ligou RLS em tudo que o Prisma cria, mas
-- `_prisma_migrations` nasce fora do schema.prisma — quem a cria e o proprio
-- migrate — e por isso ficou de fora. Ela esta no mesmo schema publico, entao a
-- API PostgREST do Supabase a expoe do mesmo jeito: com a anon key da para ler
-- o historico de migrations e, pior, escrever nele. Uma linha inventada ali faz
-- o proximo `migrate deploy` pular uma migration de verdade.
--
-- Mesma trava das demais: RLS ligada e nenhuma policy: anon e authenticated nao
-- enxergam linha alguma. O migrate continua igual, porque conecta como
-- `postgres`, que tem BYPASSRLS — e e ele quem esta rodando este arquivo.

ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
