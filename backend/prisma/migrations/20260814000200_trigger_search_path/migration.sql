-- Prende o search_path do gatilho que guarda "predio nunca sem gestor".
--
-- A funcao cita `buildings` e `building_managers` sem qualificar o schema,
-- entao quem resolve esses nomes e o search_path de quem disparou o gatilho —
-- e ele nao e fixo. Quem puder criar objeto num schema que venha antes de
-- `public` na lista poe uma tabela `building_managers` propria na frente da
-- verdadeira, e o gatilho passa a conferir a regra na tabela errada: o ultimo
-- gestor sairia sem que nada reclamasse.
--
-- `pg_temp` vai no fim de proposito. Ele entra na busca de qualquer jeito; sem
-- ser nomeado, entra na frente de tudo, que e justamente o buraco.
--
-- So a resolucao de nomes muda — o corpo da funcao continua o mesmo.

ALTER FUNCTION public.check_building_keeps_manager() SET search_path = public, pg_temp;
