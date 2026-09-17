begin;
drop function if exists public.prefactibilidad_terrenos_cerca(double precision, double precision, integer, integer);
drop function if exists public.increment_prefactibilidad_view(text);
drop table if exists public.prefactibilidades;
commit;
