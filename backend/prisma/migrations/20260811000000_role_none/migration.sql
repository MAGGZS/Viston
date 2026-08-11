-- Papel NONE: conta criada e ainda sem vinculo com predio nenhum.
-- Vira VIEWER quando o gestor aprova o vinculo, e volta para NONE quando a
-- pessoa deixa o ultimo predio.
--
-- O valor novo entra sozinho nesta migration: o Postgres so aceita usar um
-- valor de enum recem-criado depois que a transacao que o criou termina.

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'NONE';
