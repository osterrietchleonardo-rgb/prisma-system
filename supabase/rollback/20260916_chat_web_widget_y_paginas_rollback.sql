-- supabase/rollback/20260916_chat_web_widget_y_paginas_rollback.sql
--
-- Deshace 20260916120000_chat_web_widget_y_paginas.sql.
--
-- Es seguro mientras el chat web no esté en uso: las dos tablas son nuevas y nada más en
-- PRISMA las mira. Borra la configuración del widget y el sitio rastreado; el sitio se
-- vuelve a leer en un minuto, así que no se pierde nada que no se pueda recuperar solo.

begin;

drop table if exists public.web_paginas;
drop table if exists public.web_widgets;

commit;
