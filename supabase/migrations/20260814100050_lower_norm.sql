-- Normaliza un texto igual que normalizeBarrio() de lib/acm/ficha.ts y que normalizar() del
-- script de carga. Existe para poder comparar el barrio que declara un POI contra el nombre
-- del barrio real sin depender de la extensión unaccent.
create or replace function public.lower_norm(t text)
returns text language sql immutable as $$
  select trim(regexp_replace(
    regexp_replace(
      translate(lower(coalesce(t, '')), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'),
      '[^a-z0-9\s]', ' ', 'g'),
    '\s+', ' ', 'g'))
$$;
