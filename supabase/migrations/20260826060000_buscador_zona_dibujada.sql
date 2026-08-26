-- Buscador IA · buscar dentro de una zona dibujada y guardada por el asesor
--
-- Lo que pidio Leonardo el 26-ago-2026: que el asesor pueda decir en el chat "dame las
-- propiedades con parrilla dentro de BUSQUEDA MAXI" -- el nombre que EL le puso a una zona
-- que dibujo a mano en el mapa -- y que el Buscador entienda de que zona habla, busque
-- adentro de ese dibujo, y le aplique encima los filtros de siempre.
--
-- Las zonas viven en mapa_zonas y son PRIVADAS: cada uno ve solo las suyas, ni el director ve
-- las de un asesor. Eso lo garantiza la app filtrando por user_id; esta migracion solo agrega
-- la capacidad de filtrar por el dibujo.
--
-- ── EL INDICE NO ES OPCIONAL ──
--
-- Medido contra produccion el 26-ago-2026, sobre la zona real "BUSQUEDA MAXI" (un poligono de
-- 295 vertices sobre Palermo, de 1,2 x 1,5 km):
--
--     con is_active = true (usa idx_roomix_geo) .........     12 ms       0 MB
--     con is_active is not false (no lo usa) ............  4.225 ms   2.488 MB
--
-- 350 veces peor. El indice geo que ya existia, idx_roomix_geo, es PARCIAL: su condicion es
-- WHERE is_active, o sea solo los marcados como vigentes. Pero la busqueda usa
-- `is_active is not false` para no perder los 62.396 avisos con la marca en NULL (una carga
-- vieja que el crawler nunca marco, de los cuales 50.602 siguen publicados). Con esa condicion
-- el indice parcial no aplica y Postgres lee la tabla entera.
--
-- Por eso el indice nuevo lleva EXACTAMENTE la misma condicion que la busqueda.
--
-- ── POR QUE EL POLIGONO SE FILTRA EN SQL Y NO DESPUES ──
--
-- La alternativa era traer de mas por rectangulo y recortar el dibujo en el servidor. Medido,
-- el recorte exacto en SQL sale 17 ms y usa el indice igual, asi que no hay razon para traer
-- 300 propiedades y tirar 200.
--
-- Aplicado en produccion por Management API el 26-ago-2026. Esta migracion es el registro
-- versionado: las del repo NO se aplican solas.

-- El indice, con la MISMA condicion que usa la busqueda. `concurrently` para no bloquear la
-- tabla mientras se construye: la red se consulta todo el tiempo.
create index concurrently if not exists idx_roomix_geo_vigentes
  on public.roomix_properties
  using gist (point(lng, lat))
  where is_active is not false;

-- Las dos funciones van dentro de UNA transaccion, y no es decorativo: para cambiarles la
-- lista de parametros hay que soltarlas y volverlas a crear. Si el `create` fallara despues
-- del `drop` y esto corriera suelto, el Buscador se quedaria SIN funcion de busqueda, en
-- produccion. Adentro de la transaccion, un error deja todo como estaba.
-- (El indice va afuera: `concurrently` no puede correr dentro de una transaccion.)
begin;

-- ─────────── La red de colaboracion ───────────
drop function if exists public.buscar_roomix(text, text, text[], integer, integer, integer, numeric, numeric, text, text[], text[], text[], text[], integer, integer, text[], integer, integer);

create or replace function public.buscar_roomix(
  p_query_embedding      text,
  p_operation            text    default 'ambas',
  p_type_patterns        text[]  default '{}',
  p_rooms                integer default null,
  p_bedrooms             integer default null,
  p_bathrooms            integer default null,
  p_price_max            numeric default null,
  p_price_min            numeric default null,
  p_currency             text    default null,
  p_loc_patterns         text[]  default '{}',
  p_amenity_patterns     text[]  default '{}',
  p_free_text_patterns   text[]  default '{}',
  p_agency_name_patterns text[]  default '{}',
  p_floor_min            integer default null,
  p_floor_max            integer default null,
  p_excluir_ids          text[]  default '{}',
  p_poligono             text    default null,
  p_candidatas           integer default 8000,
  p_limit                integer default 100
)
returns table(id character varying, match_pct integer, semantic_sim real)
language plpgsql
stable
as $function$
declare
  v_emb vector(768) := null;
begin
  if p_query_embedding is not null and length(p_query_embedding) > 2 then
    v_emb := p_query_embedding::vector(768);
  end if;

  return query
  -- `materialized` no es decorativo: obliga a resolver esta parte primero y a FRENAR en
  -- p_candidatas. Sin eso el planner puede meter el orden de afuera adentro y volver a leerlo
  -- todo, que es exactamente lo que se quiere evitar.
  with candidatas as materialized (
    select
      r.id,
      coalesce(nullif(r.rooms,0), case when r.bedrooms > 0 then r.bedrooms + 1 else null end) as amb,
      r.floor as floor_val,
      lower(coalesce(r.title,'') || ' ' || coalesce(r.description,'') || ' ' || coalesce(r.address,'') || ' ' ||
        coalesce(r.neighborhood,'') || ' ' || coalesce(r.region,'') || ' ' || coalesce(r.city,'') || ' ' ||
        coalesce(r.property_type,'') || ' ' || coalesce(array_to_string(r.amenities,' '),'')) as ft_hay
    from roomix_properties r
    where r.embedding is not null
      -- Un aviso dado de baja no es una opcion para mostrarle a un cliente. `is not false` y no
      -- `= true` a proposito: hay 62.396 filas con is_active en NULL de una carga vieja que el
      -- crawler nunca marco, y 50.602 de ellas siguen publicadas. Exigir `= true` sacaria de la
      -- red unas 50.000 propiedades que si estan.
      and r.is_active is not false
      -- Zona dibujada a mano. Se escribe como `point(lng,lat) <@ poligono` A PROPOSITO: es la
      -- MISMA expresion que indexa idx_roomix_geo_vigentes, y por eso se resuelve por indice
      -- en 12 ms en vez de leer 2.488 MB. Escrito de cualquier otra forma (lat between ... y
      -- lng between ...) el indice NO entra: medido, 4.225 ms y 2.488 MB.
      and (p_poligono is null
        or (r.lat is not null and r.lng is not null
            and point(r.lng, r.lat) <@ p_poligono::polygon))
      and (array_length(p_excluir_ids,1) is null or r.id <> all (p_excluir_ids))
      and (p_operation = 'ambas'
        or (p_operation = 'venta'    and r.operation = 'sale')
        or (p_operation = 'alquiler' and r.operation = 'rent'))
      and (array_length(p_agency_name_patterns,1) is null
        or exists (select 1 from unnest(p_agency_name_patterns) ap where r.roomix_agency_name ilike ap))
      and (array_length(p_type_patterns,1) is null
        or exists (select 1 from unnest(p_type_patterns) tp where r.property_type ilike tp or r.title ilike tp))
      and (p_rooms is null
        or coalesce(nullif(r.rooms,0), case when r.bedrooms>0 then r.bedrooms+1 else null end) is null
        or abs(coalesce(nullif(r.rooms,0), case when r.bedrooms>0 then r.bedrooms+1 else null end) - p_rooms) <= 1)
      and (p_bedrooms is null or coalesce(r.bedrooms,0) <= 0 or abs(r.bedrooms - p_bedrooms) <= 1)
      and (p_bathrooms is null or coalesce(r.bathrooms,0) <= 0 or r.bathrooms >= p_bathrooms)
      and (p_price_max is null or coalesce(r.price,0) <= 0
        or (p_currency is not null and r.currency is not null and lower(r.currency) <> lower(p_currency))
        or r.price <= p_price_max * 1.20)
      and (p_price_min is null or coalesce(r.price,0) <= 0
        or (p_currency is not null and r.currency is not null and lower(r.currency) <> lower(p_currency))
        or r.price >= p_price_min * 0.95)
      -- `ilike any (...)` y no `exists (select ... unnest ...)`: significan lo mismo, pero solo
      -- esta forma engancha idx_roomix_loc_trgm. Con la otra el planner lee la tabla entera.
      and (array_length(p_loc_patterns,1) is null
        or lower(coalesce(r.neighborhood,'') || ' ' || coalesce(r.address,'') || ' ' || coalesce(r.title,'')) ilike any (p_loc_patterns))
      and (
        (p_floor_min is null and p_floor_max is null)
        or r.floor is null
        or r.floor between coalesce(p_floor_min,0) and coalesce(p_floor_max,9999)
      )
      -- Los amenities DESCARTAN (ver nota 1 arriba). Cada patron es una alternancia de
      -- sinonimos que arma la app: 'cochera|garage|garaje|estacionamiento'.
      and (array_length(p_amenity_patterns,1) is null
        or not exists (
          select 1 from unnest(p_amenity_patterns) pat
          where lower(coalesce(r.description,'') || ' ' || coalesce(r.title,'') || ' ' ||
                      coalesce(array_to_string(r.amenities,' '),'')) !~* pat))
    limit p_candidatas
  )
  select
    c.id,
    -- El % que ve el asesor en la tarjeta. Los amenities ya no entran: si estan, es porque
    -- pasaron el filtro. Queda lo que si admite grados: los ambientes y el texto libre.
    round((
      (case when p_rooms is null then 0
            when c.amb is null then 17.5
            when c.amb = p_rooms then 35
            when abs(c.amb - p_rooms) = 1 then 17.5
            else 0 end)
      + (case when array_length(p_free_text_patterns,1) is null then 0
              else 30.0 * ((select count(*) from unnest(p_free_text_patterns) ft where c.ft_hay ~* ft)::numeric
                           / array_length(p_free_text_patterns,1)) end)
    ) / nullif(
      (case when p_rooms is null then 0 else 35 end)
      + (case when array_length(p_free_text_patterns,1) is null then 0 else 30 end)
    ,0) * 100)::int as match_pct,
    (case when v_emb is null then 0::real else (1 - (r.embedding <=> v_emb))::real end) as semantic_sim
  from candidatas c
  join roomix_properties r on r.id = c.id
  order by
    match_pct desc nulls last,
    (case when (p_floor_min is not null or p_floor_max is not null) and c.floor_val is not null then 1 else 0 end) desc,
    semantic_sim desc
  limit p_limit;
end;
$function$;

-- ─────────── La cartera propia y la de la agencia ───────────
drop function if exists public.match_properties_ia(uuid, text, text, text[], integer, integer, integer, numeric, numeric, text, text[], text[], integer, integer, text[], uuid, uuid, integer);

CREATE OR REPLACE FUNCTION public.match_properties_ia(p_agency_id uuid, p_query_embedding text, p_operation text DEFAULT 'ambas'::text, p_type_patterns text[] DEFAULT '{}'::text[], p_rooms integer DEFAULT NULL::integer, p_bedrooms integer DEFAULT NULL::integer, p_bathrooms integer DEFAULT NULL::integer, p_price_max numeric DEFAULT NULL::numeric, p_price_min numeric DEFAULT NULL::numeric, p_currency text DEFAULT NULL::text, p_loc_patterns text[] DEFAULT '{}'::text[], p_amenity_patterns text[] DEFAULT '{}'::text[], p_floor_min integer DEFAULT NULL::integer, p_floor_max integer DEFAULT NULL::integer, p_free_text_patterns text[] DEFAULT '{}'::text[], p_include_agent uuid DEFAULT NULL::uuid, p_exclude_agent uuid DEFAULT NULL::uuid, p_poligono text DEFAULT NULL::text, p_limit integer DEFAULT 12)
 RETURNS TABLE(id uuid, match_pct integer, semantic_sim real, assigned_agent_id uuid)
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_emb vector(768) := null;
begin
  if p_query_embedding is not null and length(p_query_embedding) > 2 then
    v_emb := p_query_embedding::vector(768);
    perform set_config('hnsw.ef_search', '1000', true);
    perform set_config('hnsw.iterative_scan', 'relaxed_order', true);
  end if;

  return query
  with cand as (
    select
      p.id, p.assigned_agent_id,
      case
        when (p.tokko_data->>'room_amount') ~ '^[1-9][0-9]*$' then (p.tokko_data->>'room_amount')::int
        when p.bedrooms > 0 then p.bedrooms + 1
        else null
      end as amb,
      case when nullif(p.tokko_data->>'floor','') ~ '^[0-9]+$' then (p.tokko_data->>'floor')::int else null end as floor_val,
      lower(coalesce(p.description,'') || ' ' || coalesce(p.title,'') || ' ' ||
        coalesce((select string_agg(t->>'name',' ') from jsonb_array_elements(p.tokko_data->'tags') t),'')) as amen_hay,
      lower(coalesce(p.title,'') || ' ' || coalesce(p.description,'') || ' ' || coalesce(p.address,'') || ' ' ||
        coalesce(p.city,'') || ' ' || coalesce(p.property_type,'') || ' ' ||
        coalesce((select string_agg(t->>'name',' ') from jsonb_array_elements(p.tokko_data->'tags') t),'')) as ft_hay,
      case when v_emb is null then 0::real else (1 - (p.embedding <=> v_emb))::real end as sem
    from properties p
    where p.agency_id = p_agency_id
      and p.is_active
      -- Zona dibujada a mano por el asesor. Sin zona (null) no filtra nada y la funcion se
      -- comporta exactamente como antes.
      and (p_poligono is null
        or (p.lat is not null and p.lng is not null
            and point(p.lng, p.lat) <@ p_poligono::polygon))
      and p.embedding is not null
      and (p_operation = 'ambas'
        or (p_operation='venta' and p.status='Venta')
        or (p_operation='alquiler' and p.status in ('Alquiler','Temporary rent')))
      and (p_include_agent is null or p.assigned_agent_id = p_include_agent)
      and (p_exclude_agent is null or p.assigned_agent_id is distinct from p_exclude_agent)
      and (array_length(p_type_patterns,1) is null
        or exists (select 1 from unnest(p_type_patterns) tp where p.property_type ilike tp or p.title ilike tp))
      and (p_rooms is null
        or (case when (p.tokko_data->>'room_amount') ~ '^[1-9][0-9]*$' then (p.tokko_data->>'room_amount')::int
                 when p.bedrooms > 0 then p.bedrooms + 1 else null end) is null
        or abs((case when (p.tokko_data->>'room_amount') ~ '^[1-9][0-9]*$' then (p.tokko_data->>'room_amount')::int
                 when p.bedrooms > 0 then p.bedrooms + 1 else null end) - p_rooms) <= 1)
      and (p_bedrooms is null or coalesce(p.bedrooms,0) <= 0 or abs(p.bedrooms - p_bedrooms) <= 1)
      and (p_bathrooms is null or coalesce(p.bathrooms,0) <= 0 or p.bathrooms >= p_bathrooms)
      and (p_price_max is null or coalesce(p.price,0) <= 0
        or (p_currency is not null and p.currency is not null and lower(p.currency) <> lower(p_currency))
        or p.price <= p_price_max * 1.20)
      and (p_price_min is null or coalesce(p.price,0) <= 0
        or (p_currency is not null and p.currency is not null and lower(p.currency) <> lower(p_currency))
        or p.price >= p_price_min * 0.95)
      and (array_length(p_loc_patterns,1) is null
        or exists (select 1 from unnest(p_loc_patterns) lp
                   where lower(coalesce(p.city,'') || ' ' || coalesce(p.address,'') || ' ' || coalesce(p.title,'')) ilike lp))
      and (
        (p_floor_min is null and p_floor_max is null)
        or (case when nullif(p.tokko_data->>'floor','') ~ '^[0-9]+$' then (p.tokko_data->>'floor')::int else null end) is null
        or (case when nullif(p.tokko_data->>'floor','') ~ '^[0-9]+$' then (p.tokko_data->>'floor')::int else null end)
             between coalesce(p_floor_min,0) and coalesce(p_floor_max,9999)
      )
    order by case when v_emb is null then 0 else (p.embedding <=> v_emb) end asc
    limit 2000
  )
  select
    c.id,
    round((
      (case when p_rooms is null then 0
            when c.amb is null then 17.5
            when c.amb = p_rooms then 35
            when abs(c.amb - p_rooms) = 1 then 17.5
            else 0 end)
      + (case when array_length(p_amenity_patterns,1) is null then 0
              else 35.0 * ((select count(*) from unnest(p_amenity_patterns) pat where c.amen_hay ~* pat)::numeric
                           / array_length(p_amenity_patterns,1)) end)
      + (case when array_length(p_free_text_patterns,1) is null then 0
              else 30.0 * ((select count(*) from unnest(p_free_text_patterns) ft where c.ft_hay ~* ft)::numeric
                           / array_length(p_free_text_patterns,1)) end)
    ) / nullif(
      (case when p_rooms is null then 0 else 35 end)
      + (case when array_length(p_amenity_patterns,1) is null then 0 else 35 end)
      + (case when array_length(p_free_text_patterns,1) is null then 0 else 30 end)
    ,0) * 100)::int as match_pct,
    c.sem as semantic_sim,
    c.assigned_agent_id
  from cand c
  order by
    match_pct desc nulls last,
    (case when (p_floor_min is not null or p_floor_max is not null) and c.floor_val is not null then 1 else 0 end) desc,
    c.sem desc
  limit p_limit;
end;
$function$;

grant execute on function public.buscar_roomix to anon, authenticated, service_role;
grant execute on function public.match_properties_ia to anon, authenticated, service_role;
commit;
