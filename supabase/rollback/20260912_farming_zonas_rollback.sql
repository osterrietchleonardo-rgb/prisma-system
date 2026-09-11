-- supabase/rollback/20260912_farming_zonas_rollback.sql
-- Deshace 20260912120000_farming_zonas.sql. Borra SOLO las dos tablas nuevas de Farming.
-- No toca mapa_zonas, mercado_avisos ni ninguna otra tabla.
begin;
drop table if exists public.farming_zonas_compartidas;
drop table if exists public.farming_zonas;
commit;
