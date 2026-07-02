-- ACM v2: (1) el BARRIO/ZONA pasa a ser FILTRO DURO (gate) — todos los comparables son del
-- mismo barrio que el sujeto (Belgrano→Belgrano, Palermo→Palermo, La Plata→La Plata, etc.);
-- (2) el checklist suma TODAS las variables comparables con dato real (agrega DORMITORIOS y
-- ANTIGÜEDAD, sin inventar: se puntúan solo cuando hay dato en el sujeto y en el comparable).
--
-- Por qué el barrio es gate y sale del %: si todos los comparables ya son del mismo barrio,
-- la zona deja de discriminar (todos 100) → se muestra como "filtro cumplido" (igual que tipo y
-- operación) y su peso se reparte entre las dimensiones que sí discriminan.
--
-- Fuentes de dato REALES (verificadas en la BD, nada hardcodeado):
--   Barrio  → properties.city + tokko_data.location.name/full_location ; roomix.neighborhood + city
--   Dorm.   → properties.bedrooms ; roomix.bedrooms
--   Antig.  → properties.tokko_data.age (0=a estrenar, -1=en pozo/sin dato→null) ; roomix.property_age_years
-- El PISO NO se agrega: properties no tiene piso de la UNIDAD confiable (tokko floors_amount = plantas
-- del edificio, no el piso), así que puntuarlo sería inventar dato para la cartera.
--
-- Pesos base del % (se redistribuyen entre las dimensiones con dato; el precio queda FUERA):
--   Superficie 22 · Ambientes 16 · Dormitorios 14 · Baños 12 · Antigüedad 14 · Amenities 12 · Semántica 10 (=100)
--   (Zona = gate, peso 0. Tipo y operación = gate, peso 0.)

-- Normalizador acento-insensible (Nuñez/Núñez, etc.). IMMUTABLE para poder usarlo en índices/gates.
create or replace function public.acm_norm(t text)
returns text language sql immutable as $$
  select translate(lower(coalesce(t,'')),
                   'áàäâãéèëêíìïîóòöôõúùüûñç',
                   'aaaaaeeeeiiiiooooouuuunc');
$$;

-- Reemplazo con nueva firma (agrega params) → hay que DROPear las versiones viejas primero.
drop function if exists public.acm_match_properties(uuid, text, text, text[], numeric, integer, integer, text[], text[], uuid, integer);
drop function if exists public.acm_match_roomix(text, text, text[], numeric, integer, integer, text[], text[], integer);


CREATE OR REPLACE FUNCTION public.acm_match_properties(
  p_agency_id uuid,
  p_query_embedding text DEFAULT NULL,
  p_operation text DEFAULT 'venta',
  p_type_patterns text[] DEFAULT '{}',
  p_m2 numeric DEFAULT NULL,
  p_rooms integer DEFAULT NULL,
  p_dormitorios integer DEFAULT NULL,
  p_bathrooms integer DEFAULT NULL,
  p_antiguedad integer DEFAULT NULL,
  p_loc_patterns text[] DEFAULT '{}',
  p_amenities text[] DEFAULT '{}',
  p_exclude_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS TABLE(
  id uuid, match_pct integer,
  sc_zona integer, sc_superficie integer, sc_ambientes integer, sc_dormitorios integer,
  sc_banos integer, sc_antiguedad integer, sc_amenities integer, sc_semantica integer,
  cand_m2 numeric, cand_amb integer, cand_dorm integer, cand_ant integer
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
      case when p.bedrooms > 0 then p.bedrooms else null end as dorm,
      p.bathrooms as ban,
      case when (p.tokko_data->>'age') ~ '^[0-9]+$' then (p.tokko_data->>'age')::int else null end as ant,
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
      -- GATE de BARRIO: todos los comparables son del mismo barrio que el sujeto (campos
      -- estructurados city/location, insensible a acentos). Si el sujeto no trae barrio, no filtra.
      and (array_length(p_loc_patterns,1) is null
        or exists (select 1 from unnest(p_loc_patterns) lp
                   where public.acm_norm(coalesce(p.city,'') || ' ' ||
                         coalesce(p.tokko_data->'location'->>'name','') || ' ' ||
                         coalesce(p.tokko_data->'location'->>'full_location','')) like public.acm_norm(lp)))
    order by case when v_emb is null then 0 else (p.embedding <=> v_emb) end asc
    limit 2000
  ),
  scored as (
    select c.id, c.m2, c.amb, c.dorm, c.ban, c.ant, c.sem,
      (case when p_m2 is not null and p_m2 > 0 and c.m2 is not null and c.m2 > 0 then 22 else 0 end) as w_sup,
      (case when p_m2 is not null and p_m2 > 0 and c.m2 is not null and c.m2 > 0
            then greatest(0, 1 - abs(c.m2 - p_m2)/p_m2) else 0 end)::numeric as s_sup,
      (case when p_rooms is not null and c.amb is not null then 16 else 0 end) as w_amb,
      (case when p_rooms is null or c.amb is null then 0
            when c.amb = p_rooms then 1 when abs(c.amb - p_rooms) = 1 then 0.5 else 0 end)::numeric as s_amb,
      (case when p_dormitorios is not null and c.dorm is not null then 14 else 0 end) as w_dorm,
      (case when p_dormitorios is null or c.dorm is null then 0
            when c.dorm = p_dormitorios then 1 when abs(c.dorm - p_dormitorios) = 1 then 0.5 else 0 end)::numeric as s_dorm,
      (case when p_bathrooms is not null and c.ban is not null and c.ban > 0 then 12 else 0 end) as w_ban,
      (case when p_bathrooms is null or c.ban is null or c.ban = 0 then 0
            when c.ban = p_bathrooms then 1 when abs(c.ban - p_bathrooms) = 1 then 0.5 else 0 end)::numeric as s_ban,
      (case when p_antiguedad is not null and c.ant is not null then 14 else 0 end) as w_ant,
      (case when p_antiguedad is null or c.ant is null then 0
            else greatest(0, 1 - abs(c.ant - p_antiguedad)/20.0) end)::numeric as s_ant,
      (case when array_length(p_amenities,1) is not null then 12 else 0 end) as w_amen,
      (case when array_length(p_amenities,1) is null then 0
            else (select count(*) from unnest(p_amenities) a where c.amen_hay ~* a)::numeric
                 / array_length(p_amenities,1) end) as s_amen,
      (case when v_emb is not null then 10 else 0 end) as w_sem,
      c.sem::numeric as s_sem
    from cand c
  )
  select
    s.id,
    round(((s.s_sup*s.w_sup + s.s_amb*s.w_amb + s.s_dorm*s.w_dorm + s.s_ban*s.w_ban + s.s_ant*s.w_ant + s.s_amen*s.w_amen + s.s_sem*s.w_sem)
           / nullif(s.w_sup+s.w_amb+s.w_dorm+s.w_ban+s.w_ant+s.w_amen+s.w_sem,0)) * 100)::int as match_pct,
    case when array_length(p_loc_patterns,1) is not null then 100 else null end as sc_zona,
    case when s.w_sup>0  then round(s.s_sup*100)::int  end,
    case when s.w_amb>0  then round(s.s_amb*100)::int  end,
    case when s.w_dorm>0 then round(s.s_dorm*100)::int end,
    case when s.w_ban>0  then round(s.s_ban*100)::int  end,
    case when s.w_ant>0  then round(s.s_ant*100)::int  end,
    case when s.w_amen>0 then round(s.s_amen*100)::int end,
    case when s.w_sem>0  then round(s.s_sem*100)::int  end,
    s.m2, s.amb, s.dorm, s.ant
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
  p_dormitorios integer DEFAULT NULL,
  p_bathrooms integer DEFAULT NULL,
  p_antiguedad integer DEFAULT NULL,
  p_loc_patterns text[] DEFAULT '{}',
  p_amenities text[] DEFAULT '{}',
  p_limit integer DEFAULT 50
)
RETURNS TABLE(
  id character varying, match_pct integer,
  sc_zona integer, sc_superficie integer, sc_ambientes integer, sc_dormitorios integer,
  sc_banos integer, sc_antiguedad integer, sc_amenities integer, sc_semantica integer,
  cand_m2 numeric, cand_amb integer, cand_dorm integer, cand_ant integer
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
      case when r.bedrooms > 0 then r.bedrooms else null end as dorm,
      r.bathrooms as ban,
      case when r.property_age_years >= 0 then r.property_age_years else null end as ant,
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
      -- GATE de BARRIO (neighborhood/city estructurado, insensible a acentos).
      and (array_length(p_loc_patterns,1) is null
        or exists (select 1 from unnest(p_loc_patterns) lp
                   where public.acm_norm(coalesce(r.neighborhood,'') || ' ' || coalesce(r.city,'')) like public.acm_norm(lp)))
    order by case when v_emb is null then 0 else (r.embedding <=> v_emb) end asc
    limit 2000
  ),
  scored as (
    select c.id, c.m2, c.amb, c.dorm, c.ban, c.ant, c.sem,
      (case when p_m2 is not null and p_m2 > 0 and c.m2 is not null and c.m2 > 0 then 22 else 0 end) as w_sup,
      (case when p_m2 is not null and p_m2 > 0 and c.m2 is not null and c.m2 > 0
            then greatest(0, 1 - abs(c.m2 - p_m2)/p_m2) else 0 end)::numeric as s_sup,
      (case when p_rooms is not null and c.amb is not null then 16 else 0 end) as w_amb,
      (case when p_rooms is null or c.amb is null then 0
            when c.amb = p_rooms then 1 when abs(c.amb - p_rooms) = 1 then 0.5 else 0 end)::numeric as s_amb,
      (case when p_dormitorios is not null and c.dorm is not null then 14 else 0 end) as w_dorm,
      (case when p_dormitorios is null or c.dorm is null then 0
            when c.dorm = p_dormitorios then 1 when abs(c.dorm - p_dormitorios) = 1 then 0.5 else 0 end)::numeric as s_dorm,
      (case when p_bathrooms is not null and c.ban is not null and c.ban > 0 then 12 else 0 end) as w_ban,
      (case when p_bathrooms is null or c.ban is null or c.ban = 0 then 0
            when c.ban = p_bathrooms then 1 when abs(c.ban - p_bathrooms) = 1 then 0.5 else 0 end)::numeric as s_ban,
      (case when p_antiguedad is not null and c.ant is not null then 14 else 0 end) as w_ant,
      (case when p_antiguedad is null or c.ant is null then 0
            else greatest(0, 1 - abs(c.ant - p_antiguedad)/20.0) end)::numeric as s_ant,
      (case when array_length(p_amenities,1) is not null then 12 else 0 end) as w_amen,
      (case when array_length(p_amenities,1) is null then 0
            else (select count(*) from unnest(p_amenities) a where c.amen_hay ~* a)::numeric
                 / array_length(p_amenities,1) end) as s_amen,
      (case when v_emb is not null then 10 else 0 end) as w_sem,
      c.sem::numeric as s_sem
    from cand c
  )
  select
    s.id,
    round(((s.s_sup*s.w_sup + s.s_amb*s.w_amb + s.s_dorm*s.w_dorm + s.s_ban*s.w_ban + s.s_ant*s.w_ant + s.s_amen*s.w_amen + s.s_sem*s.w_sem)
           / nullif(s.w_sup+s.w_amb+s.w_dorm+s.w_ban+s.w_ant+s.w_amen+s.w_sem,0)) * 100)::int as match_pct,
    case when array_length(p_loc_patterns,1) is not null then 100 else null end as sc_zona,
    case when s.w_sup>0  then round(s.s_sup*100)::int  end,
    case when s.w_amb>0  then round(s.s_amb*100)::int  end,
    case when s.w_dorm>0 then round(s.s_dorm*100)::int end,
    case when s.w_ban>0  then round(s.s_ban*100)::int  end,
    case when s.w_ant>0  then round(s.s_ant*100)::int  end,
    case when s.w_amen>0 then round(s.s_amen*100)::int end,
    case when s.w_sem>0  then round(s.s_sem*100)::int  end,
    s.m2, s.amb, s.dorm, s.ant
  from scored s
  order by match_pct desc nulls last, s.s_sem desc
  limit p_limit;
end;
$fn$;
