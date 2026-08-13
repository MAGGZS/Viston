-- Fase 2 — users.role deixa de mandar em predio.
--
-- Rodar SO depois que o backend estiver lendo o papel de building_members
-- (ver src/middlewares/buildingAccess.ts). As duas coisas viajam no mesmo
-- deploy: o Render aplica as migrations no build, antes de subir o processo
-- novo, e o codigo novo ja nasce lendo a membership.
--
-- Depois daqui a conta so tem dois estados possiveis no sistema: ADMIN (suporte)
-- e NONE (todo o resto). Quem e gestor, inspetor ou visualizador — e de qual
-- predio — esta em building_members, e so la.

-- 1. Papel da conta: dois valores, e nada de predio no meio
CREATE TYPE "AccountRole" AS ENUM ('ADMIN', 'NONE');

ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users"
  ALTER COLUMN "role" TYPE "AccountRole"
  USING (CASE WHEN "role"::text = 'ADMIN' THEN 'ADMIN' ELSE 'NONE' END)::"AccountRole";
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'NONE';

-- 2. Papel do vinculo: sai o texto com CHECK, entra enum de verdade
CREATE TYPE "BuildingRole" AS ENUM ('GESTOR', 'INSPECTOR', 'VIEWER');

ALTER TABLE "building_members" DROP CONSTRAINT IF EXISTS "building_members_role_check";
ALTER TABLE "building_members"
  ALTER COLUMN "role" TYPE "BuildingRole" USING "role"::"BuildingRole";

-- 3. O enum antigo misturava os dois eixos; sem coluna apontando para ele, sai.
DROP TYPE "Role";

-- 4. Predio nunca fica sem gestor — agora tambem no banco.
--
-- A aplicacao ja recusa antes (409 em rebaixar/remover/sair do ultimo gestor, e
-- em apagar a conta que e a unica gestora de algum predio). Isto aqui e a rede
-- embaixo: pega o caminho que a aplicacao nao viu, o cascade de conta apagada e
-- qualquer UPDATE feito na mao pelo painel do Supabase.
--
-- Dois detalhes que o gatilho tem de acertar, e que a versao ingenua erra:
--
-- a) Apagar o predio apaga os vinculos em cascata. Sem a checagem de que o
--    predio ainda existe, o gatilho dispararia no meio da cascata e o predio
--    passaria a ser impossivel de excluir. Quando a cascata roda, a linha do
--    predio ja saiu, entao o EXISTS abaixo responde falso e o vinculo passa.
--
-- b) UPDATE OF role dispara mesmo quando o valor nao muda. Promover a GESTOR
--    quem ja e o unico gestor e uma operacao legitima, e sem o `TG_OP` abaixo
--    ela estouraria. Por isso o UPDATE tem gatilho proprio, com a condicao
--    olhando o valor novo — o WHEN de um gatilho combinado nao pode ler NEW.
-- c) Num BEFORE UPDATE, devolver OLD nao e "seguir em frente": e mandar gravar
--    OLD no lugar de NEW. O rebaixamento legitimo viraria um no-op mudo, sem
--    erro nenhum — pior que bloquear. Por isso o retorno depende do TG_OP.
CREATE OR REPLACE FUNCTION check_building_keeps_gestor()
RETURNS TRIGGER AS $$
BEGIN
  -- O predio inteiro esta indo embora (cascade): o vinculo vai junto, e tudo bem.
  IF EXISTS (SELECT 1 FROM buildings WHERE id = OLD.building_id)
     AND NOT EXISTS (
       SELECT 1 FROM building_members
       WHERE building_id = OLD.building_id
         AND role = 'GESTOR'
         AND id <> OLD.id
     )
  THEN
    RAISE EXCEPTION 'O predio % ficaria sem gestor', OLD.building_id
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER building_members_keep_gestor_on_delete
  BEFORE DELETE ON building_members
  FOR EACH ROW
  WHEN (OLD.role = 'GESTOR')
  EXECUTE FUNCTION check_building_keeps_gestor();

CREATE TRIGGER building_members_keep_gestor_on_demote
  BEFORE UPDATE OF role ON building_members
  FOR EACH ROW
  WHEN (OLD.role = 'GESTOR' AND NEW.role <> 'GESTOR')
  EXECUTE FUNCTION check_building_keeps_gestor();
