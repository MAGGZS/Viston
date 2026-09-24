-- Repete o backfill do dono do predio.
--
-- A migration `planos_fundacao` criou `buildings.owner_manager_id` e preencheu
-- o que existia naquele instante, mas o codigo que cria predio so passou a
-- gravar a coluna agora. Todo predio cadastrado entre um deploy e outro nasceu
-- sem dono — e predio sem dono e predio que nenhum plano limita e por quem
-- ninguem paga.
--
-- Mesma regra da primeira vez: quem criou e o dono; onde `created_by` ficou
-- nulo, o gestor mais antigo entre os que administram o predio. Predio sem
-- gestor nenhum continua sem dono, que e o correto — nao ha a quem cobrar.
--
-- `WHERE owner_manager_id IS NULL` torna a repeticao inofensiva e nao reescreve
-- dono nenhum que ja tenha sido decidido.
UPDATE "buildings" b
SET "owner_manager_id" = COALESCE(
  b."created_by",
  (
    SELECT bm."manager_id"
    FROM "building_managers" bm
    WHERE bm."building_id" = b."id"
    ORDER BY bm."joined_at" ASC, bm."id" ASC
    LIMIT 1
  )
)
WHERE b."owner_manager_id" IS NULL;
