-- A planilha deixa de morar numa URL pública.
--
-- A API se dá ao trabalho de responder 404 no relatório de outro prédio, e
-- depois entregava uma URL pública, permanente e sem autenticação — quem saísse
-- do prédio continuava com o link funcionando para sempre, e um link colado num
-- grupo de mensagens virava acesso vitalício. Agora a coluna guarda o *caminho*
-- do objeto no bucket, e a URL é assinada na hora do download, com validade
-- curta, por quem já passou pela checagem de vínculo.
--
-- Os arquivos não se mexem: o caminho dentro do bucket continua o mesmo. O que
-- muda é o bucket, que precisa ser marcado como privado no painel do Supabase
-- (Storage > viston-excel > Make private). Enquanto ele for público, os links
-- antigos que alguém já tenha guardado seguem abrindo.
ALTER TABLE "inspection_reports" RENAME COLUMN "excel_url" TO "excel_path";

-- O que já está gravado é URL inteira; fica só o nome do objeto. Os nomes são
-- `day_<building>_<data>_<ts>.xlsx` e `report_<id>_<ts>.xlsx` — sem barra e sem
-- caractere que precise de escape, então o último segmento é o caminho.
UPDATE "inspection_reports"
   SET "excel_path" = regexp_replace("excel_path", '^.*/', '')
 WHERE "excel_path" LIKE 'http%';
