-- Buscador IA · la busqueda en la red de colaboracion se cortaba SIEMPRE por timeout
--
-- Sintoma: el Buscador IA nunca mostraba propiedades de la red. Le contestaba al asesor
-- "No encontre resultados con esos criterios", que era FALSO: la consulta se cortaba por
-- statement timeout (error 57014, tope de 8 s del rol authenticated) y devolvia 0 filas.
-- Medido el 21-ago-2026 sobre los 6 casos de busqueda tipicos: TODOS entre 11 y 25 segundos.
--
-- Causa: el filtro de ubicacion estaba escrito como
--     exists (select 1 from unnest(p_loc_patterns) lp where <expr> ilike lp)
-- Esa forma no es indexable: el planner arma un Nested Loop y termina leyendo las 356.314
-- filas de la tabla (713 MB) en cada busqueda. Ese Seq Scan era un piso de ~4,2 s, medido
-- identico para CUALQUIER filtro -- hasta para un `operation = 'sale'` solo. Sobre eso se
-- sumaba el trabajo del vector y se pasaba del tope.
--
-- Dos cambios, los dos verificados contra los mismos 6 casos:
--
-- 1) El indice GIN trigram sobre la expresion de ubicacion que la funcion ya usaba.
-- 2) `ilike any (...)` en lugar de `exists (select 1 from unnest(...))`. Significan lo
--    mismo, pero solo `any` engancha el indice. El indice SOLO no alcanzaba: con el
--    `exists` la funcion lo ignoraba y seguia con Seq Scan.
--
-- Resultado (Execution Time del servidor, mediana de 4 corridas):
--     Palermo 3 amb .............. 17.336 ms  ->    252 ms
--     Nunez o Saavedra ........... 18.787 ms  ->    159 ms
--     Alquiler La Plata .......... 24.963 ms  ->    159 ms
--     Con precio y texto libre ... 11.248 ms  ->  1.871 ms
--     Belgrano 2 amb .............    156 ms  ->  2.762 ms
--     SIN barrio ................. 25.266 ms  -> 25.417 ms  (sin cambio, ver abajo)
--
-- Los resultados NO cambian: 5 de los 6 casos devuelven exactamente los mismos ids. El
-- unico que cambia es por el filtro de is_active de abajo, no por el de ubicacion.
--
-- PENDIENTE: cuando la busqueda no menciona ningun barrio, no hay indice que enganchar y
-- sigue tardando 25 s. Ya era asi antes de este cambio (25.266 ms medidos en la version
-- vieja), o sea que no es una regresion -- pero sigue roto y necesita otro enfoque.
--
-- Aplicado en produccion por Management API el 21-ago-2026. Esta migracion queda como el
-- registro versionado (las migraciones del repo no se aplican solas).

create index concurrently if not exists idx_roomix_loc_trgm
  on public.roomix_properties
  using gin ((lower(coalesce(neighborhood,'') || ' ' || coalesce(address,'') || ' ' || coalesce(title,''))) gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.match_roomix_ia(p_query_embedding text, p_operation text DEFAULT 'ambas'::text, p_type_patterns text[] DEFAULT '{}'::text[], p_rooms integer DEFAULT NULL::integer, p_bedrooms integer DEFAULT NULL::integer, p_bathrooms integer DEFAULT NULL::integer, p_price_max numeric DEFAULT NULL::numeric, p_price_min numeric DEFAULT NULL::numeric, p_currency text DEFAULT NULL::text, p_loc_patterns text[] DEFAULT '{}'::text[], p_amenity_patterns text[] DEFAULT '{}'::text[], p_agency_name_patterns text[] DEFAULT '{}'::text[], p_floor_min integer DEFAULT NULL::integer, p_floor_max integer DEFAULT NULL::integer, p_free_text_patterns text[] DEFAULT '{}'::text[], p_limit integer DEFAULT 12)
 RETURNS TABLE(id character varying, match_pct integer, semantic_sim real)
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
      r.id,
      coalesce(nullif(r.rooms,0), case when r.bedrooms > 0 then r.bedrooms + 1 else null end) as amb,
      r.floor as floor_val,
      lower(coalesce(r.description,'') || ' ' || coalesce(r.title,'') || ' ' || coalesce(array_to_string(r.amenities,' '),'')) as amen_hay,
      lower(coalesce(r.title,'') || ' ' || coalesce(r.description,'') || ' ' || coalesce(r.address,'') || ' ' ||
        coalesce(r.neighborhood,'') || ' ' || coalesce(r.region,'') || ' ' || coalesce(r.city,'') || ' ' ||
        coalesce(r.property_type,'') || ' ' || coalesce(array_to_string(r.amenities,' '),'')) as ft_hay,
      case when v_emb is null then 0::real else (1 - (r.embedding <=> v_emb))::real end as sem
    from roomix_properties r
    where r.embedding is not null
      -- Un aviso dado de baja no es una opcion para mostrarle a un cliente: son 36.907 filas
      -- (verificado 21-ago-2026) que hasta ahora el Buscador IA podia devolver como si
      -- siguieran publicadas. El ACM ya las filtra; esta pantalla habia quedado sin hacerlo.
      --
      -- Se usa `is not false`, NO `= true`, a proposito: hay 62.396 filas con is_active en
      -- NULL, todas de una misma carga del 28-may-2026 que el crawler nunca marco, y 50.602 de
      -- ellas figuran como InStock en el portal. No son bajas: es un hueco del dato. Exigir
      -- `= true` sacaria de la red unas 50.000 propiedades que si estan publicadas.
      and r.is_active is not false
      and (p_operation = 'ambas'
        or (p_operation='venta' and r.operation='sale')
        or (p_operation='alquiler' and r.operation='rent'))
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
      -- `ilike any(...)` en vez de `exists (select 1 from unnest(...))`. Significan lo mismo
      -- -- "matchea alguno de los patrones" -- pero solo esta forma es indexable: con el
      -- `exists` el planner hace un Nested Loop y termina leyendo las 356.314 filas enteras
      -- (Seq Scan de 713 MB, 4.619 ms medidos). Con `any` engancha idx_roomix_loc_trgm y
      -- resuelve por Bitmap Index Scan en 997 ms. Ese escaneo era el piso de ~4,2 s que hacia
      -- que la funcion se pasara del statement_timeout de 8 s del rol authenticated, y el
      -- Buscador IA le contestara al asesor "no encontre resultados" cuando en realidad la
      -- consulta se habia cortado.
      and (array_length(p_loc_patterns,1) is null
        or lower(coalesce(r.neighborhood,'') || ' ' || coalesce(r.address,'') || ' ' || coalesce(r.title,'')) ilike any (p_loc_patterns))
      and (
        (p_floor_min is null and p_floor_max is null)
        or r.floor is null
        or r.floor between coalesce(p_floor_min,0) and coalesce(p_floor_max,9999)
      )
    order by case when v_emb is null then 0 else (r.embedding <=> v_emb) end asc
    limit case when v_emb is null then 5000 else 1000 end
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
    c.sem as semantic_sim
  from cand c
  order by
    match_pct desc nulls last,
    (case when (p_floor_min is not null or p_floor_max is not null) and c.floor_val is not null then 1 else 0 end) desc,
    c.sem desc
  limit p_limit;
end;
$function$
