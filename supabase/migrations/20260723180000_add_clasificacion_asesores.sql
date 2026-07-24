-- Clasificación opcional del asesor dentro del equipo, que asigna el director.
-- NULL = "Asesor" (valor por defecto, no hace falta guardar nada).
alter table public.profiles
  add column if not exists clasificacion text;

alter table public.profiles
  drop constraint if exists profiles_clasificacion_check;

alter table public.profiles
  add constraint profiles_clasificacion_check
  check (clasificacion is null or clasificacion in ('client_director', 'client_support'));

comment on column public.profiles.clasificacion is
  'Clasificación del asesor asignada por el director: client_director | client_support | NULL (Asesor).';
