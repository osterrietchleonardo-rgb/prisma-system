-- supabase/rollback/20260916_farming_avisos_rollback.sql
-- Deshace 20260916120000_farming_avisos.sql. Borra SOLO lo de la etapa 2 de Farming.
-- No toca mercado_avisos, farming_zonas ni farming_zonas_compartidas.
begin;
drop function if exists public.farming_avisos_en_zona(text, text, bigint[], integer, integer);
drop function if exists public.farming_avisos_conteos(text, bigint[]);
drop table if exists public.farming_avisos_marca;
commit;
