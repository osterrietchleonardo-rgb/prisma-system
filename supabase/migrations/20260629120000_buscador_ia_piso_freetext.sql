-- Buscador IA: agrega al matcheo (1) preferencia de PISO/NIVEL del departamento y
-- (2) búsqueda flexible de características sueltas (free-text) sobre TODA la ficha.
--
-- Diseño "sin romper nada":
--   • PISO (suave): alto = 6° o más; bajo/medio = planta baja (0) al 5°. El dato de piso
--     está poco cargado (properties ~32%, roomix ~7%), así que SOLO se excluyen las fichas
--     cuyo piso está cargado Y contradice la banda; las que no informan piso se CONSERVAN
--     (ausencia ≠ piso bajo) y, cuando se pidió banda, las de piso confirmado quedan primeras.
--   • FREE-TEXT (suave): cada característica suelta se busca con ~* sobre el texto completo
--     de la ficha. NO descarta filas: suma como una dimensión de ranking (peso 30), igual
--     que amenities. Con array vacío el comportamiento es idéntico al actual.
--
-- Se cambian las firmas (params nuevos) → hay que DROP + CREATE (CREATE OR REPLACE no alcanza
-- porque crearía un overload ambiguo con las llamadas por nombre del route).

DROP FUNCTION IF EXISTS public.match_properties_ia(uuid,text,text,text[],integer,integer,integer,numeric,numeric,text,text[],text[],uuid,uuid,integer);

CREATE FUNCTION public.match_properties_ia(
  p_agency_id uuid,
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
  p_floor_min integer DEFAULT NULL::integer,
  p_floor_max integer DEFAULT NULL::integer,
  p_free_text_patterns text[] DEFAULT '{}'::text[],
  p_include_agent uuid DEFAULT NULL::uuid,
  p_exclude_agent uuid DEFAULT NULL::uuid,
  p_limit integer DEFAULT 12
)
RETURNS TABLE(id uuid, match_pct integer, semantic_sim real, assigned_agent_id uuid)
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
      p.id, p.assigned_agent_id,
      case
        when (p.tokko_data->>'room_amount') ~ '^[1-9][0-9]*$' then (p.tokko_data->>'room_amount')::int
        when p.bedrooms > 0 then p.bedrooms + 1
        else null
      end as amb,
      -- piso/nivel del depto (string en tokko_data->floor; "" o no numérico => sin dato)
      case when nullif(p.tokko_data->>'floor','') ~ '^[0-9]+$' then (p.tokko_data->>'floor')::int else null end as floor_val,
      lower(coalesce(p.description,'') || ' ' || coalesce(p.title,'') || ' ' ||
        coalesce((select string_agg(t->>'name',' ') from jsonb_array_elements(p.tokko_data->'tags') t),'')) as amen_hay,
      -- texto completo de la ficha para free-text (zona, tipo, dirección, etc.)
      lower(coalesce(p.title,'') || ' ' || coalesce(p.description,'') || ' ' || coalesce(p.address,'') || ' ' ||
        coalesce(p.city,'') || ' ' || coalesce(p.property_type,'') || ' ' ||
        coalesce((select string_agg(t->>'name',' ') from jsonb_array_elements(p.tokko_data->'tags') t),'')) as ft_hay,
      case when v_emb is null then 0::real else (1 - (p.embedding <=> v_emb))::real end as sem
    from properties p
    where p.agency_id = p_agency_id
      and p.is_active
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
      -- PISO (suave): solo excluyo si el piso está cargado y queda FUERA de la banda pedida; sin dato => pasa
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
    -- cuando se pidió banda de piso, las de nivel confirmado quedan primero (sin afectar el % mostrado)
    (case when (p_floor_min is not null or p_floor_max is not null) and c.floor_val is not null then 1 else 0 end) desc,
    c.sem desc
  limit p_limit;
end;
$function$;


DROP FUNCTION IF EXISTS public.match_roomix_ia(text,text,text[],integer,integer,integer,numeric,numeric,text,text[],text[],text[],integer);

CREATE FUNCTION public.match_roomix_ia(
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
    perform set_config('hnsw.ef_search', '400', true);
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
    limit case when v_emb is null then 5000 else 400 end
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
