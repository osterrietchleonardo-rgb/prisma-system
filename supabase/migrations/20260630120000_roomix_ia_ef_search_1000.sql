-- Buscador IA: subir el presupuesto de búsqueda vectorial de match_roomix_ia de 400 a 1000.
--
-- Por qué: roomix tiene ~69k filas. Con ef_search=400 (y pool de 400 candidatos) el escaneo HNSW
-- iterativo se quedaba corto cuando el vector de consulta no era perfecto, devolviendo POCAS o 0
-- propiedades aunque hubiera cientos que cumplían los filtros duros. La función de la cartera propia
-- (match_properties_ia) ya usa ef_search=1000 sobre una tabla mucho más chica; acá igualamos el
-- presupuesto para blindar el retrieval de la red de colaboración.
--
-- Cambios respecto a la versión anterior (mismo cuerpo, misma firma → CREATE OR REPLACE):
--   • hnsw.ef_search: 400 → 1000
--   • pool de candidatos con embedding: limit 400 → 1000
-- (Con embedding NULL se mantiene el ranking estructural con limit 5000.)

CREATE OR REPLACE FUNCTION public.match_roomix_ia(
  p_query_embedding text,
  p_operation text DEFAULT 'ambas'::text,
  p_type_patterns text[] DEFAULT '{}'::text[],
  p_rooms integer DEFAULT NULL::integer,
  p_bedrooms integer DEFAULT NULL::integer,
  p_bathrooms integer DEFAULT NULL::integer,
  p_price_max numeric DEFAULT NULL::numeric,
  p_price_min numeric DEFAULT NULL::numeric,
  p_currency text DEFAULT NULL::text,
  p_loc_patterns text[] DEFAULT '{}'::text[],
  p_amenity_patterns text[] DEFAULT '{}'::text[],
  p_agency_name_patterns text[] DEFAULT '{}'::text[],
  p_floor_min integer DEFAULT NULL::integer,
  p_floor_max integer DEFAULT NULL::integer,
  p_free_text_patterns text[] DEFAULT '{}'::text[],
  p_limit integer DEFAULT 12
)
RETURNS TABLE(id character varying, match_pct integer, semantic_sim real)
LANGUAGE plpgsql STABLE
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
      and (array_length(p_loc_patterns,1) is null
        or exists (select 1 from unnest(p_loc_patterns) lp
                   where lower(coalesce(r.neighborhood,'') || ' ' || coalesce(r.address,'') || ' ' || coalesce(r.title,'')) ilike lp))
      -- PISO (suave): solo excluyo si el piso está cargado y queda FUERA de la banda; sin dato => pasa
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
$function$;
