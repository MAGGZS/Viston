-- Chave de compartilhamento por predio.
-- O vinculo de usuarios passa a usar esta chave aleatoria em vez do id real do predio.

ALTER TABLE "buildings" ADD COLUMN "share_key" TEXT;

-- Backfill: 12 caracteres derivados do id + random (unico por linha),
-- traduzindo 0/1 para G/H para manter o alfabeto sem ambiguidade.
UPDATE "buildings"
SET "share_key" = upper(substr(translate(md5("id" || random()::text), '01', 'gh'), 1, 12))
WHERE "share_key" IS NULL;

ALTER TABLE "buildings" ALTER COLUMN "share_key" SET NOT NULL;

CREATE UNIQUE INDEX "buildings_share_key_key" ON "buildings"("share_key");
