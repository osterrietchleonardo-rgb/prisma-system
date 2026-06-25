-- ACM (Análisis Comparativo de Mercado): comparables propiedad-contra-propiedad.
-- Filtros duros (gate) + ranking por embedding + % de comparabilidad con sub-scores por dimensión.
-- El PRECIO queda FUERA del %. Los pesos se redistribuyen entre las dimensiones que tienen dato
-- (no se penaliza un dato faltante). Dimensiones y pesos base:
--   Zona 25 · Superficie 25 · Ambientes 20 · Baños 10 · Amenities 10 · Semántica 10  (= 100)
-- (La "antigüedad" se omite a propósito: no hay columna confiable en properties/roomix; sería dato inventado.)
--
-- Estas funciones NO modifican ni reemplazan a match_properties_ia / match_roomix_ia (las del Buscador IA):
-- son adicionales y exclusivas del módulo ACM.

CREATE OR REPLACE FUNCTION public.acm_match_properties(
  p_agency_id uuid,
  p_query_embedding text DEFAULT NULL,
  p_operation text DEFAULT 'venta',
  p_type_patterns text[] DEFAULT '{}',
  p_m2 numeric DEFAULT NULL,
  p_rooms integer DEFAULT NULL,
  p_bathrooms integer DEFAULT NULL,
  p_loc_patterns text[] DEFAULT '{}',
  p_amenities text[] DEFAULT '{}',
  p_exclude_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 20
)
RETURNS TABLE(
  id uuid, match_pct integer,
  sc_zona integer, sc_superficie integer, sc_ambientes integer,
  sc_banos integer, sc_amenities integer, sc_semantica integer,
  cand_m2 numeric, cand_amb integer
)
LANGUAGE plpgsql STABLE AS $fn$
declare v_emb vector(768) := null;
begin
  if p_query_embedding is not null and length(p_query_embedding) > 2 then
    v_emb := p_query_embedding::vector(768);
    perform set_config('hnsw.ef_search', '1000', true);
    perform set_config('hnsw.iterative_scan', 'relaxed_order', true);
  end if;

  return query
  with cand as (
    select
      p.id,
      coalesce(p.total_area, p.covered_area) as m2,
      case when (p.tokko_data->>'room_amount') ~ '^[1-9][0-9]*$' then (p.tokko_data->>'room_amount')::int
           when p.bedrooms > 0 then p.bedrooms + 1 else null end as amb,
      p.bathrooms as ban,
      lower(coalesce(p.city,'') || ' ' || coalesce(p.address,'') || ' ' || coalesce(p.title,'')) as zona_hay,
      lower(coalesce(p.description,'') || ' ' || coalesce(p.title,'') || ' ' ||
        coalesce((select string_agg(t->>'name',' ') from jsonb_array_elements(p.tokko_data->'tags') t),'')) as amen_hay,
      case when v_emb is null then 0::real else greatest(0::real, (1 - (p.embedding <=> v_emb))::real) end as sem
    from properties p
    where p.agency_id = p_agency_id
      and p.is_active
      and p.embedding is not null
      and (p_exclude_id is null or p.id <> p_exclude_id)
      and (p_operation = 'ambas'
        or (p_operation='venta' and p.status='Venta')
        or (p_operation='alquiler' and p.status in ('Alquiler','Temporary rent')))
      and (array_length(p_type_patterns,1) is null
        or exists (select 1 from unnest(p_type_patterns) tp where p.property_type ilike tp or p.title ilike tp))
      and (p_m2 is null or coalesce(p.total_area,p.covered_area) is null
        or coalesce(p.total_area,p.covered_area) between p_m2 * 0.6 and p_m2 * 1.4)
      and (p_rooms is null
        or (case when (p.tokko_data->>'room_amount') ~ '^[1-9][0-9]*$' then (p.tokko_data->>'room_amount')::int
                 when p.bedrooms > 0 then p.bedrooms + 1 else null end) is null
        or abs((case when (p.tokko_data->>'room_amount') ~ '^[1-9][0-9]*$' then (p.tokko_data->>'room_amount')::int
                 when p.bedrooms > 0 then p.bedrooms + 1 else null end) - p_rooms) <= 1)
    order by case when v_emb is null then 0 else (p.embedding <=> v_emb) end asc
    limit 2000
  ),
  scored as (
    select c.id, c.m2, c.amb, c.ban, c.sem,
      (case when array_length(p_loc_patterns,1) is not null then 25 else 0 end) as w_zona,
      (case when array_length(p_loc_patterns,1) is null then 0
            when exists (select 1 from unnest(p_loc_patterns) lp where c.zona_hay ilike lp) then 1 else 0 end)::numeric as s_zona,
      (case when p_m2 is not null and p_m2 > 0 and c.m2 is not null and c.m2 > 0 then 25 else 0 end) as w_sup,
      (case when p_m2 is not null and p_m2 > 0 and c.m2 is not null and c.m2 > 0
            then greatest(0, 1 - abs(c.m2 - p_m2)/p_m2) else 0 end)::numeric as s_sup,
      (case when p_rooms is not null and c.amb is not null then 20 else 0 end) as w_amb,
      (case when p_rooms is null or c.amb is null then 0
            when c.amb = p_rooms then 1 when abs(c.amb - p_rooms) = 1 then 0.5 else 0 end)::numeric as s_amb,
      (case when p_bathrooms is not null and c.ban is not null and c.ban > 0 then 10 else 0 end) as w_ban,
      (case when p_bathrooms is null or c.ban is null or c.ban = 0 then 0
            when c.ban = p_bathrooms then 1 when abs(c.ban - p_bathrooms) = 1 then 0.5 else 0 end)::numeric as s_ban,
      (case when array_length(p_amenities,1) is not null then 10 else 0 end) as w_amen,
      (case when array_length(p_amenities,1) is null then 0
            else (select count(*) from unnest(p_amenities) a where c.amen_hay ~* a)::numeric
                 / array_length(p_amenities,1) end) as s_amen,
      (case when v_emb is not null then 10 else 0 end) as w_sem,
      c.sem::numeric as s_sem
    from cand c
  )
  select
    s.id,
    round(((s.s_zona*s.w_zona + s.s_sup*s.w_sup + s.s_amb*s.w_amb + s.s_ban*s.w_ban + s.s_amen*s.w_amen + s.s_sem*s.w_sem)
           / nullif(s.w_zona+s.w_sup+s.w_amb+s.w_ban+s.w_amen+s.w_sem,0)) * 100)::int as match_pct,
    case when s.w_zona>0 then round(s.s_zona*100)::int end,
    case when s.w_sup>0  then round(s.s_sup*100)::int  end,
    case when s.w_amb>0  then round(s.s_amb*100)::int  end,
    case when s.w_ban>0  then round(s.s_ban*100)::int  end,
    case when s.w_amen>0 then round(s.s_amen*100)::int end,
    case when s.w_sem>0  then round(s.s_sem*100)::int  end,
    s.m2, s.amb
  from scored s
  order by match_pct desc nulls last, s.s_sem desc
  limit p_limit;
end;
$fn$;


CREATE OR REPLACE FUNCTION public.acm_match_roomix(
  p_query_embedding text DEFAULT NULL,
  p_operation text DEFAULT 'venta',
  p_type_patterns text[] DEFAULT '{}',
  p_m2 numeric DEFAULT NULL,
  p_rooms integer DEFAULT NULL,
  p_bathrooms integer DEFAULT NULL,
  p_loc_patterns text[] DEFAULT '{}',
  p_amenities text[] DEFAULT '{}',
  p_limit integer DEFAULT 20
)
RETURNS TABLE(
  id character varying, match_pct integer,
  sc_zona integer, sc_superficie integer, sc_ambientes integer,
  sc_banos integer, sc_amenities integer, sc_semantica integer,
  cand_m2 numeric, cand_amb integer
)
LANGUAGE plpgsql STABLE AS $fn$
declare v_emb vector(768) := null;
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
      r.area_m2 as m2,
      case when r.rooms > 0 then r.rooms when r.bedrooms > 0 then r.bedrooms + 1 else null end as amb,
      r.bathrooms as ban,
      lower(coalesce(r.neighborhood,'') || ' ' || coalesce(r.address,'') || ' ' || coalesce(r.title,'')) as zona_hay,
      lower(coalesce(r.description,'') || ' ' || coalesce(r.title,'') || ' ' ||
        coalesce(array_to_string(r.amenities,' '),'')) as amen_hay,
      case when v_emb is null then 0::real else greatest(0::real, (1 - (r.embedding <=> v_emb))::real) end as sem
    from roomix_properties r
    where r.embedding is not null
      and (p_operation = 'ambas'
        or (p_operation='venta' and r.operation='sale')
        or (p_operation='alquiler' and r.operation='rent'))
      and (array_length(p_type_patterns,1) is null
        or exists (select 1 from unnest(p_type_patterns) tp where r.property_type ilike tp or r.title ilike tp))
      and (p_m2 is null or r.area_m2 is null or r.area_m2 between p_m2 * 0.6 and p_m2 * 1.4)
      and (p_rooms is null
        or (case when r.rooms > 0 then r.rooms when r.bedrooms > 0 then r.bedrooms + 1 else null end) is null
        or abs((case when r.rooms > 0 then r.rooms when r.bedrooms > 0 then r.bedrooms + 1 else null end) - p_rooms) <= 1)
    order by case when v_emb is null then 0 else (r.embedding <=> v_emb) end asc
    limit 2000
  ),
  scored as (
    select c.id, c.m2, c.amb, c.ban, c.sem,
      (case when array_length(p_loc_patterns,1) is not null then 25 else 0 end) as w_zona,
      (case when array_length(p_loc_patterns,1) is null then 0
            when exists (select 1 from unnest(p_loc_patterns) lp where c.zona_hay ilike lp) then 1 else 0 end)::numeric as s_zona,
      (case when p_m2 is not null and p_m2 > 0 and c.m2 is not null and c.m2 > 0 then 25 else 0 end) as w_sup,
      (case when p_m2 is not null and p_m2 > 0 and c.m2 is not null and c.m2 > 0
            then greatest(0, 1 - abs(c.m2 - p_m2)/p_m2) else 0 end)::numeric as s_sup,
      (case when p_rooms is not null and c.amb is not null then 20 else 0 end) as w_amb,
      (case when p_rooms is null or c.amb is null then 0
            when c.amb = p_rooms then 1 when abs(c.amb - p_rooms) = 1 then 0.5 else 0 end)::numeric as s_amb,
      (case when p_bathrooms is not null and c.ban is not null and c.ban > 0 then 10 else 0 end) as w_ban,
      (case when p_bathrooms is null or c.ban is null or c.ban = 0 then 0
            when c.ban = p_bathrooms then 1 when abs(c.ban - p_bathrooms) = 1 then 0.5 else 0 end)::numeric as s_ban,
      (case when array_length(p_amenities,1) is not null then 10 else 0 end) as w_amen,
      (case when array_length(p_amenities,1) is null then 0
            else (select count(*) from unnest(p_amenities) a where c.amen_hay ~* a)::numeric
                 / array_length(p_amenities,1) end) as s_amen,
      (case when v_emb is not null then 10 else 0 end) as w_sem,
      c.sem::numeric as s_sem
    from cand c
  )
  select
    s.id,
    round(((s.s_zona*s.w_zona + s.s_sup*s.w_sup + s.s_amb*s.w_amb + s.s_ban*s.w_ban + s.s_amen*s.w_amen + s.s_sem*s.w_sem)
           / nullif(s.w_zona+s.w_sup+s.w_amb+s.w_ban+s.w_amen+s.w_sem,0)) * 100)::int as match_pct,
    case when s.w_zona>0 then round(s.s_zona*100)::int end,
    case when s.w_sup>0  then round(s.s_sup*100)::int  end,
    case when s.w_amb>0  then round(s.s_amb*100)::int  end,
    case when s.w_ban>0  then round(s.s_ban*100)::int  end,
    case when s.w_amen>0 then round(s.s_amen*100)::int end,
    case when s.w_sem>0  then round(s.s_sem*100)::int  end,
    s.m2, s.amb
  from scored s
  order by match_pct desc nulls last, s.s_sem desc
  limit p_limit;
end;
$fn$;
