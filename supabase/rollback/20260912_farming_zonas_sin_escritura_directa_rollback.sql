-- supabase/rollback/20260912_farming_zonas_sin_escritura_directa_rollback.sql
--
-- Deshace 20260912130000_farming_zonas_sin_escritura_directa.sql: devuelve a `authenticated`
-- y `anon` los grants de escritura que tenían por default de Supabase. Esto REABRE el
-- agujero del Important 1 (un asesor puede mover su zona a otra agencia por PostgREST): solo
-- correr si hace falta volver atrás por algún efecto no previsto de la migración.

begin;

grant insert, update, delete on public.farming_zonas to authenticated, anon;
grant insert, update, delete on public.farming_zonas_compartidas to authenticated, anon;

commit;
