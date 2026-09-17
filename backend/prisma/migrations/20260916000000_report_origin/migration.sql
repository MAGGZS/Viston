-- Origem do relatorio: vistoria de rotina pelo inspetor ou ocorrencia avulsa pelo responsavel.
--
-- VISTORIA e a ronda completa de andares feita por um inspetor, que gera o documento
-- e alimenta o historico de vistorias.
--
-- AVULSA e a ocorrencia individual registrada diretamente por um responsavel/tecnico.
-- Ela alimenta o historico de ocorrencias e a fila de manutencao normalmente,
-- mas fica fora do historico de vistorias.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReportOrigin') THEN
    CREATE TYPE "ReportOrigin" AS ENUM ('VISTORIA', 'AVULSA');
  END IF;
END
$$;

ALTER TABLE "inspection_reports"
  ADD COLUMN IF NOT EXISTS "origin" "ReportOrigin" NOT NULL DEFAULT 'VISTORIA';
