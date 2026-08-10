-- Papel GESTOR: dono do predio.
-- Cria e administra os proprios predios e define o papel de quem se vincula a eles.
-- O ADMIN deixa de administrar predios e passa a cuidar so das contas.

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'GESTOR';
