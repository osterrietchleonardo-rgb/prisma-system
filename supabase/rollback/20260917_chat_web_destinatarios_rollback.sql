-- supabase/rollback/20260917_chat_web_destinatarios_rollback.sql
--
-- Deshace 20260917220000_chat_web_destinatarios.sql: saca las dos columnas.
-- Se pierde el email de destino y la persona elegida del equipo; se vuelven a cargar en un minuto.

begin;

alter table public.web_widgets
  drop column if exists email_destino,
  drop column if exists perfil_equipo_id;

commit;
