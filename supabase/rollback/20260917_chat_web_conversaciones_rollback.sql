-- supabase/rollback/20260917_chat_web_conversaciones_rollback.sql
--
-- Deshace 20260917200000_chat_web_conversaciones.sql.
--
-- OJO: esto SÍ borra datos si el chat ya estuvo andando — las conversaciones del sitio y sus
-- mensajes, con los teléfonos y emails que la gente dejó. Antes de correrlo, exportar lo que haya:
--   select * from web_conversaciones;  select * from web_mensajes;
-- Mientras el chat no esté publicado, las tablas están vacías y no se pierde nada.

begin;

drop table if exists public.web_mensajes;
drop table if exists public.web_conversaciones;

commit;
