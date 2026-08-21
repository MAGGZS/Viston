-- Geração das sessões da conta.
--
-- O refresh token passa a carregar o número que valia quando foi emitido, e o
-- refresh recusa quem trouxer um número velho. Sem isto, sair do sistema era só
-- apagar o token do próprio navegador: o refresh token continuava aceito por
-- sete dias, em qualquer máquina, mesmo depois de trocar a senha.
--
-- Começa em 0 para todo mundo: os tokens já emitidos não carregam o número, e
-- são tratados como geração 0 (ver `verifyRefreshToken`). Ninguém é deslogado
-- pela migration — a revogação vale das próximas sessões em diante.
ALTER TABLE "users" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "managers" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;
