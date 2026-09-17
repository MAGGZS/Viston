-- Tokens temporarios de compartilhamento por predio (QR Code, link e codigo de 15 minutos)

CREATE TABLE IF NOT EXISTS "building_share_tokens" (
    "id" TEXT NOT NULL,
    "building_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "building_share_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "building_share_tokens_token_key" ON "building_share_tokens"("token");
CREATE INDEX IF NOT EXISTS "building_share_tokens_token_idx" ON "building_share_tokens"("token");
CREATE INDEX IF NOT EXISTS "building_share_tokens_building_id_expires_at_idx" ON "building_share_tokens"("building_id", "expires_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'building_share_tokens_building_id_fkey'
  ) THEN
    ALTER TABLE "building_share_tokens"
      ADD CONSTRAINT "building_share_tokens_building_id_fkey"
      FOREIGN KEY ("building_id") REFERENCES "buildings"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

ALTER TABLE "building_share_tokens" ENABLE ROW LEVEL SECURITY;
