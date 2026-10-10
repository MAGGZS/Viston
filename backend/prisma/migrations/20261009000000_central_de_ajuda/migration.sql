-- A central de ajuda: pastas (um cargo), funcionalidades (um tutorial com um
-- vídeo) e abas (os passos, que são os capítulos do vídeo).
--
-- Só acrescenta. Três tabelas novas, um enum novo, e duas colunas anuláveis e
-- dois índices únicos parciais em "feedbacks". Nenhuma linha existente muda, e
-- nada é apagado.
--
-- As decisões que explicam o desenho:
--
-- 1. O conteúdo nasce do roteiro (`tutoriais/roteiros.md` -> `catalogo.json`)
--    pelo seed (`npm run seed:ajuda` ou `POST /admin/help/sync`). As tabelas
--    nascem vazias aqui; a migration não carrega conteúdo porque o conteúdo
--    muda com o roteiro, e migration é para estrutura.
--
-- 2. Os vídeos moram no bucket privado `tutoriais`, e as colunas guardam o
--    caminho do objeto, não a URL: a URL é assinada na leitura, como a da
--    planilha (ver 20260821000100_excel_private_bucket).
--
-- 3. `help_folders.target_roles` é TEXT[], e não um enum: mistura papel de
--    prédio (INSPECTOR...) com tipo de conta (GESTOR, ADMIN, SEM_PREDIO), que
--    no schema vivem em lugares diferentes.
--
-- 4. O "Isso ajudou?" mora em "feedbacks", com duas colunas anuláveis
--    (`help_feature_id` e `helpful`), e não numa tabela própria. Motivos:
--    a. o admin já lê feedback numa caixa com triagem (pendente, tarefa,
--       mensagem, descarte), e a resposta de um tutorial é exatamente isso: um
--       recado a triar. Tabela própria pediria outra caixa, outra rota, outra
--       tela, para o mesmo trabalho;
--    b. o feedback comum não muda: as duas colunas ficam nulas nele, e nenhuma
--       consulta existente passa a se comportar diferente;
--    c. a FK é SET NULL: apagar a funcionalidade não apaga o que as pessoas
--       disseram sobre ela.
--    "Uma resposta por funcionalidade" é garantido por dois índices únicos
--    parciais (seção 5), um por natureza de conta. A consulta do backend
--    antes de gravar não basta: dois cliques simultâneos passam os dois por
--    ela. O índice não atrapalha o "descartar" do admin, que apaga a linha:
--    sem a linha, a pessoa pode responder de novo. Parciais porque o
--    feedback comum (sem tutorial) e o de conta apagada (autor SET NULL) não
--    entram na regra. O Prisma não modela índice com WHERE, então eles moram
--    só aqui, como o `building_ownership_transfers_pending_key`.

-- == 1. Enum ==================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'HelpDevice') THEN
    CREATE TYPE "HelpDevice" AS ENUM ('MOBILE', 'DESKTOP');
  END IF;
END
$$;

-- == 2. Pastas ================================================================
CREATE TABLE IF NOT EXISTS "help_folders" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "target_roles" TEXT[],
    "admin_only" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "help_folders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "help_folders_slug_key" ON "help_folders"("slug");

-- == 3. Funcionalidades =======================================================
CREATE TABLE IF NOT EXISTS "help_features" (
    "id" TEXT NOT NULL,
    "folder_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "device" "HelpDevice" NOT NULL,
    "order" INTEGER NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "video_path" TEXT,
    "captions_path" TEXT,
    "poster_path" TEXT,
    "duration_s" DOUBLE PRECISION,
    "video_script_hash" TEXT,
    "video_uploaded_at" TIMESTAMP(3),
    "video_uploaded_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "help_features_pkey" PRIMARY KEY ("id")
);

-- O `id` do roteiro é a chave do pacote de vídeo: um por funcionalidade.
CREATE UNIQUE INDEX IF NOT EXISTS "help_features_slug_key" ON "help_features"("slug");
-- A pasta é sempre lida "as funcionalidades dela, em ordem".
CREATE INDEX IF NOT EXISTS "help_features_folder_id_order_idx" ON "help_features"("folder_id", "order");
-- O Postgres não indexa FK sozinho, e o ON DELETE precisa achar as filhas.
CREATE INDEX IF NOT EXISTS "help_features_video_uploaded_by_idx" ON "help_features"("video_uploaded_by");

ALTER TABLE "help_features" ADD CONSTRAINT "help_features_folder_id_fkey"
  FOREIGN KEY ("folder_id") REFERENCES "help_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Quem enviou o vídeo pode sair do sistema; o vídeo fica.
ALTER TABLE "help_features" ADD CONSTRAINT "help_features_video_uploaded_by_fkey"
  FOREIGN KEY ("video_uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- == 4. Abas ==================================================================
CREATE TABLE IF NOT EXISTS "help_steps" (
    "id" TEXT NOT NULL,
    "feature_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "start_s" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "help_steps_pkey" PRIMARY KEY ("id")
);

-- Uma aba por posição: o seed casa a aba do roteiro com a do banco por aqui.
CREATE UNIQUE INDEX IF NOT EXISTS "help_steps_feature_id_order_key" ON "help_steps"("feature_id", "order");

ALTER TABLE "help_steps" ADD CONSTRAINT "help_steps_feature_id_fkey"
  FOREIGN KEY ("feature_id") REFERENCES "help_features"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- == 5. "Isso ajudou?" no feedback ============================================
ALTER TABLE "feedbacks" ADD COLUMN IF NOT EXISTS "help_feature_id" TEXT;
ALTER TABLE "feedbacks" ADD COLUMN IF NOT EXISTS "helpful" BOOLEAN;

CREATE INDEX IF NOT EXISTS "feedbacks_help_feature_id_idx" ON "feedbacks"("help_feature_id");

-- Uma resposta por conta e funcionalidade. As colunas acabaram de nascer
-- nulas, então não há linha antiga que possa violar.
CREATE UNIQUE INDEX IF NOT EXISTS "feedbacks_help_feature_id_user_id_key"
  ON "feedbacks" ("help_feature_id", "user_id")
  WHERE "help_feature_id" IS NOT NULL AND "user_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "feedbacks_help_feature_id_manager_id_key"
  ON "feedbacks" ("help_feature_id", "manager_id")
  WHERE "help_feature_id" IS NOT NULL AND "manager_id" IS NOT NULL;

ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_help_feature_id_fkey"
  FOREIGN KEY ("help_feature_id") REFERENCES "help_features"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- == 6. Fechadas para a API pública do Supabase ===============================
-- O mesmo par de barreiras do resto do schema (ver 20261007000000_agenda_de_vistorias,
-- seção 5): RLS ligado sem policy, e nenhum privilégio para `anon` e
-- `authenticated`. O backend conecta como `postgres` e não passa por nenhuma
-- das duas. Em Postgres sem Supabase (o do CI) as roles não existem e o bloco
-- não faz nada.
ALTER TABLE "help_folders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "help_features" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "help_steps" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  papel text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format('REVOKE ALL ON TABLE "help_folders" FROM %I', papel);
      EXECUTE format('REVOKE ALL ON TABLE "help_features" FROM %I', papel);
      EXECUTE format('REVOKE ALL ON TABLE "help_steps" FROM %I', papel);
    END IF;
  END LOOP;
END $$;
