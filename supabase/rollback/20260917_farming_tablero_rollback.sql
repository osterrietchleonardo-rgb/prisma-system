-- supabase/rollback/20260917_farming_tablero_rollback.sql
-- Deshace 20260917180000_farming_tablero.sql. Solo borra un índice: ninguna fila se pierde.
begin;
drop index if exists public.farming_contactos_propietario_idx;
commit;
