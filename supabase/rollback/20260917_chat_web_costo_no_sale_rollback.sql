-- supabase/rollback/20260917_chat_web_costo_no_sale_rollback.sql
--
-- Devuelve el SELECT sobre TODA la tabla (incluida costo_usd). Solo tiene sentido si algo dejara
-- de funcionar por los permisos por columna.

begin;

grant select on public.web_conversaciones to authenticated, anon;
grant select on public.web_mensajes to authenticated, anon;

commit;
