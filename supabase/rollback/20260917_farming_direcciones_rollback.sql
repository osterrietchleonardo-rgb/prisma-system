-- supabase/rollback/20260917_farming_direcciones_rollback.sql
-- Deshace 20260917120000_farming_direcciones.sql.
--
-- OJO: esto borra el trabajo de campo del asesor (direcciones, propietarios y contactos).
-- Solo se corre si la migración recién se aplicó y todavía no cargó nadie.
begin;
drop table if exists public.farming_contactos;
drop table if exists public.farming_propietarios;
drop table if exists public.farming_direcciones;
-- Las funciones van DESPUÉS de las tablas: mientras exista una política o un índice que las
-- use, el drop falla.
drop function if exists public.farming_puede_ver_zona(uuid, uuid);
drop function if exists public.farming_direccion_normalizada(text, text);
commit;
