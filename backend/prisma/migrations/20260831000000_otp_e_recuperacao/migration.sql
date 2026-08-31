-- Codigo de 6 digitos no lugar do link, e a mesma tabela servindo tambem a
-- recuperacao de senha.
--
-- O link saiu por dois motivos. Um: robo de e-mail — scanner corporativo,
-- antivirus, pre-visualizador — abre a URL antes da pessoa, e a tela consumia
-- o token no carregamento; o link morria usado sem ninguem ter clicado. Dois:
-- quem cadastra no computador le e-mail no celular, e o link comeca a sessao
-- no aparelho errado. Codigo digitado nao sofre nem de um nem de outro.

-- Para que serve este registro.
--
-- A mecanica e a mesma nos dois casos — emitir, expirar, contar erro, gastar —
-- e o que muda e so o que acontece no fim. Duas tabelas iguais lado a lado
-- seriam duas chances de corrigir um bug em uma e esquecer da outra.
CREATE TYPE "TokenPurpose" AS ENUM ('EMAIL_VERIFY', 'PASSWORD_RESET');

ALTER TABLE "email_tokens"
  ADD COLUMN "purpose" "TokenPurpose" NOT NULL DEFAULT 'EMAIL_VERIFY';

-- O hash do codigo. O valor legivel existe dentro do e-mail e em lugar nenhum
-- daqui — mesma regra que valia para o link.
ALTER TABLE "email_tokens" ADD COLUMN "code_hash" TEXT;

-- Chutes errados contra este registro.
--
-- E esta coluna, e nao o prazo, que impede forca bruta: seis digitos sao um
-- milhao de combinacoes, e cinco chutes por codigo emitido deixam a busca
-- inviavel mesmo com o teto de reenvio no maximo.
ALTER TABLE "email_tokens" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;

-- O link deixou de existir, e a coluna dele com ele.
--
-- As 5 linhas que a tabela tem sao tokens de teste emitidos hoje, nenhuma
-- pertence a conta de usuario real em uso. Nenhum dado de pessoa e perdido:
-- `email_tokens` guarda hash de codigo e prazo, nada mais.
DROP INDEX IF EXISTS "email_tokens_token_hash_key";
ALTER TABLE "email_tokens" DROP COLUMN "token_hash";

-- A busca chega pelo e-mail e pelo proposito: um numero de seis digitos nao
-- identifica registro nenhum sozinho.
--
-- Sobre a coluna crua, e nao sobre lower(email): tudo que entra aqui passa por
-- `normalizeEmail` antes. O indice em lower() de `users` existe porque la ha
-- linhas gravadas como digitadas, de antes da normalizacao; aqui nao ha.
DROP INDEX IF EXISTS "email_tokens_email_created_at_idx";
CREATE INDEX "email_tokens_lookup_idx"
  ON "email_tokens" ("email", "purpose", "used_at", "created_at" DESC);

-- Registros vencidos nao servem a ninguem, e os de teste de hoje foram
-- emitidos pelo desenho antigo, sem code_hash: sem isto ficariam abertos para
-- sempre, invisiveis e inuteis.
UPDATE "email_tokens" SET "used_at" = NOW() WHERE "used_at" IS NULL;
