-- supabase/rollback/20260917_buscar_web_paginas_rollback.sql
--
-- Deshace 20260917140000_buscar_web_paginas.sql. Saca la función de búsqueda del chat web.
-- No toca datos: las páginas guardadas quedan donde están.

begin;

drop function if exists buscar_web_paginas(uuid, vector, int);

commit;
