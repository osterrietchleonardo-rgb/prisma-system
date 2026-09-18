-- supabase/rollback/20260918_chat_web_freno_por_ip_rollback.sql
-- Saca el freno por conexión: la columna y su índice. No toca ningún mensaje.

begin;

drop index if exists web_mensajes_freno_idx;
alter table public.web_mensajes drop column if exists ip_huella;

commit;
