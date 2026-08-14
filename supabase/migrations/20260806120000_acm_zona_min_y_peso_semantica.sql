-- ACM v6: zona estricta por defecto + peso semántico configurable.
--
-- 1) p_zona_min → mínimo zona_score que se admite. 100 = solo mismo barrio,
--    70 = mismo barrio + sub-barrios (Belgrano R, Palermo Soho), 50 = además
--    limítrofes (Belgrano → Núñez). Default 50 = comportamiento de hoy; la app
--    manda 70 salvo que el asesor tilde "Incluir barrios linderos".
--    Motivo: auditados los 36 ACM de Central, 70 de 618 comparables de Belgrano
--    venían de Núñez/Saavedra/Colegiales. El valor casi no se distorsiona
--    (mediana US$3.790/m² vs US$3.714/m², -2%) pero el cliente ve otro barrio
--    en su tasación y descarta el informe entero.
--
-- 2) p_peso_semantica → peso de la similitud descriptiva, hasta ahora fijo en 10.
--    Sube a 20 cuando el asesor cargó fotos y la IA describió la propiedad: ahí
--    la comparación de texto deja de ser redundante con las dimensiones duras
--    (tipo, m², ambientes ya se puntúan aparte) y pasa a aportar señal real.
--
-- Los dos defaults dejan producción idéntica hasta que la app mande otros valores.


-- Cambia la firma de las dos funciones de matching → drop de las versiones actuales.
-- OJO para la próxima migración que cambie estas firmas: p_zona_min y p_peso_semantica son
-- smallint (no integer, a diferencia de todos los demás parámetros numéricos de acá abajo).
-- Un `drop function if exists` que ponga `integer` en esas dos posiciones no hace match, no
-- tira error, y deja un overload duplicado colgado en vez de reemplazar la función — hay que
-- copiar los tipos tal cual están en el CREATE OR REPLACE de más abajo.
drop function if exists public.acm_match_properties(uuid, text, text, text[], numeric, integer, integer, integer, integer, text[], text[], uuid, boolean, text, boolean, text, boolean, boolean, integer);
drop function if exists public.acm_match_roomix(text, text, text[], numeric, integer, integer, integer, integer, text[], text[], boolean, text, boolean, text, boolean, boolean, boolean, boolean, integer);


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
  p_exclude_ph boolean DEFAULT false,
  p_obra text DEFAULT 'off',
  p_obra_sin_dato boolean DEFAULT true,
  p_barrio text DEFAULT NULL,
  p_zona_niveles boolean DEFAULT false,
  p_m2_cubierta boolean DEFAULT false,
  p_zona_min smallint DEFAULT 50,
  p_peso_semantica smallint DEFAULT 10,
  p_limit integer DEFAULT 50
)
RETURNS TABLE(
  id uuid, match_pct integer,
  sc_zona integer, sc_superficie integer, sc_ambientes integer, sc_dormitorios integer,
  sc_banos integer, sc_antiguedad integer, sc_amenities integer, sc_semantica integer,
  cand_m2 numeric, cand_amb integer, cand_dorm integer, cand_ant integer
)
LANGUAGE plpgsql STABLE AS $fn$
declare
  v_emb vector(768) := null;
  v_key text := public.acm_norm(btrim(coalesce(p_barrio, '')));
  v_usar_zonas boolean := false;
begin
  if p_query_embedding is not null and length(p_query_embedding) > 2 then
    v_emb := p_query_embedding::vector(768);
    perform set_config('hnsw.ef_search', '1000', true);
    perform set_config('hnsw.iterative_scan', 'relaxed_order', true);
  end if;

  -- Solo usamos el mapa de zonas si el barrio del sujeto se resolvió contra la tabla.
  -- Si no (texto libre raro, barrio del interior sin datos), se cae al gate viejo.
  if p_zona_niveles and v_key <> '' then
    v_usar_zonas := exists (select 1 from public.acm_barrio_relacion r where r.barrio = v_key);
  end if;

  return query
  with zonas as (
    -- El barrio propio (100) nunca se filtra: siempre entra.
    select v_key as k, 100 as score where v_usar_zonas
    union all
    select r.relacionado, r.zona_score::int from public.acm_barrio_relacion r
    where v_usar_zonas and r.barrio = v_key and r.zona_score >= p_zona_min
  ),
  cand as (
    select
      p.id,
      case when p_m2_cubierta then coalesce(nullif(p.covered_area, 0), p.total_area)
           else coalesce(p.total_area, p.covered_area) end as m2,
      case when (p.tokko_data->>'room_amount') ~ '^[1-9][0-9]*$' then (p.tokko_data->>'room_amount')::int
           when p.bedrooms > 0 then p.bedrooms + 1 else null end as amb,
      case when p.bedrooms > 0 then p.bedrooms else null end as dorm,
      p.bathrooms as ban,
      case when (p.tokko_data->>'age') ~ '^-?[0-9]+$' then (p.tokko_data->>'age')::int else null end as ant,
      coalesce(z.score, 0) as zona,
      lower(coalesce(p.description,'') || ' ' || coalesce(p.title,'') || ' ' ||
        coalesce((select string_agg(t->>'name',' ') from jsonb_array_elements(p.tokko_data->'tags') t),'')) as amen_hay,
      case when v_emb is null then 0::real else greatest(0::real, (1 - (p.embedding <=> v_emb))::real) end as sem
    from properties p
    left join zonas z
      on v_usar_zonas
     and z.k = public.acm_norm(btrim(coalesce(nullif(p.city, ''), p.tokko_data->'location'->>'name', '')))
    where p.agency_id = p_agency_id
      and p.is_active
      and p.embedding is not null
      and (p_exclude_id is null or p.id <> p_exclude_id)
      and (p_operation = 'ambas'
        or (p_operation='venta' and p.status='Venta')
        or (p_operation='alquiler' and p.status in ('Alquiler','Temporary rent')))
      and (array_length(p_type_patterns,1) is null
        or exists (select 1 from unnest(p_type_patterns) tp where p.property_type ilike tp or p.title ilike tp))
      and (p_m2 is null
        or (case when p_m2_cubierta then coalesce(nullif(p.covered_area,0), p.total_area)
                 else coalesce(p.total_area, p.covered_area) end) is null
        or (case when p_m2_cubierta then coalesce(nullif(p.covered_area,0), p.total_area)
                 else coalesce(p.total_area, p.covered_area) end) between p_m2 * 0.6 and p_m2 * 1.4)
      and (p_rooms is null
        or (case when (p.tokko_data->>'room_amount') ~ '^[1-9][0-9]*$' then (p.tokko_data->>'room_amount')::int
                 when p.bedrooms > 0 then p.bedrooms + 1 else null end) is null
        or abs((case when (p.tokko_data->>'room_amount') ~ '^[1-9][0-9]*$' then (p.tokko_data->>'room_amount')::int
                 when p.bedrooms > 0 then p.bedrooms + 1 else null end) - p_rooms) <= 1)
      -- GATE de ZONA: por niveles si el barrio se resolvió; si no, el patrón de siempre.
      and (case when v_usar_zonas then z.score is not null
                else (array_length(p_loc_patterns,1) is null
                  or exists (select 1 from unnest(p_loc_patterns) lp
                             where public.acm_norm(coalesce(p.city,'') || ' ' ||
                                   coalesce(p.tokko_data->'location'->>'name','') || ' ' ||
                                   coalesce(p.tokko_data->'location'->>'full_location','')) like public.acm_norm(lp)))
           end)
      and (not p_exclude_ph
        or (coalesce(p.property_type,'') || ' ' || coalesce(p.title,'') || ' ' || coalesce(p.description,'')) !~* '\mph\M')
      and public.acm_pasa_obra(
            case when (p.tokko_data->>'age') ~ '^-?[0-9]+$' then (p.tokko_data->>'age')::int else null end,
            p_obra, p_obra_sin_dato, false)
    order by case when v_emb is null then 0 else (p.embedding <=> v_emb) end asc
    limit 2000
  ),
  scored as (
    select c.id, c.m2, c.amb, c.dorm, c.ban, c.ant, c.sem, c.zona,
      (case when v_usar_zonas then 20 else 0 end) as w_zona,
      (c.zona / 100.0)::numeric as s_zona,
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
      (case when v_emb is not null then p_peso_semantica else 0 end) as w_sem,
      c.sem::numeric as s_sem
    from cand c
  )
  select
    s.id,
    round(((s.s_zona*s.w_zona + s.s_sup*s.w_sup + s.s_amb*s.w_amb + s.s_dorm*s.w_dorm + s.s_ban*s.w_ban + s.s_ant*s.w_ant + s.s_amen*s.w_amen + s.s_sem*s.w_sem)
           / nullif(s.w_zona+s.w_sup+s.w_amb+s.w_dorm+s.w_ban+s.w_ant+s.w_amen+s.w_sem,0)) * 100)::int as match_pct,
    case when v_usar_zonas then s.zona
         when array_length(p_loc_patterns,1) is not null then 100 else null end as sc_zona,
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
  p_exclude_ph boolean DEFAULT false,
  p_obra text DEFAULT 'off',
  p_obra_sin_dato boolean DEFAULT true,
  p_barrio text DEFAULT NULL,
  p_zona_niveles boolean DEFAULT false,
  p_m2_cubierta boolean DEFAULT false,
  p_dedup boolean DEFAULT false,
  p_excluir_sujeto boolean DEFAULT false,
  p_zona_min smallint DEFAULT 50,
  p_peso_semantica smallint DEFAULT 10,
  p_limit integer DEFAULT 50
)
RETURNS TABLE(
  id character varying, match_pct integer,
  sc_zona integer, sc_superficie integer, sc_ambientes integer, sc_dormitorios integer,
  sc_banos integer, sc_antiguedad integer, sc_amenities integer, sc_semantica integer,
  cand_m2 numeric, cand_amb integer, cand_dorm integer, cand_ant integer
)
LANGUAGE plpgsql STABLE AS $fn$
declare
  v_emb vector(768) := null;
  v_key text := public.acm_norm(btrim(coalesce(p_barrio, '')));
  v_usar_zonas boolean := false;
begin
  if p_query_embedding is not null and length(p_query_embedding) > 2 then
    v_emb := p_query_embedding::vector(768);
    perform set_config('hnsw.ef_search', '1000', true);
    perform set_config('hnsw.iterative_scan', 'relaxed_order', true);
  end if;

  if p_zona_niveles and v_key <> '' then
    v_usar_zonas := exists (select 1 from public.acm_barrio_relacion r where r.barrio = v_key);
  end if;

  return query
  with zonas as (
    -- El barrio propio (100) nunca se filtra: siempre entra.
    select v_key as k, 100 as score where v_usar_zonas
    union all
    select r.relacionado, r.zona_score::int from public.acm_barrio_relacion r
    where v_usar_zonas and r.barrio = v_key and r.zona_score >= p_zona_min
  ),
  cand as (
    select
      r.id,
      case when p_m2_cubierta then coalesce(nullif(r.covered_area_m2, 0), r.area_m2)
           else r.area_m2 end as m2,
      case when r.rooms > 0 then r.rooms when r.bedrooms > 0 then r.bedrooms + 1 else null end as amb,
      case when r.bedrooms > 0 then r.bedrooms else null end as dorm,
      r.bathrooms as ban,
      case when r.property_age_years >= 0 then r.property_age_years else null end as ant,
      coalesce(z.score, 0) as zona,
      -- Clave de duplicado: mismo aviso cargado varias veces (misma dirección, precio y medidas).
      public.acm_norm(btrim(coalesce(r.address,''))) || '|' || coalesce(r.price, 0)::text || '|' ||
        coalesce(r.area_m2, 0)::text || '|' || coalesce(r.rooms, 0)::text || '|' ||
        coalesce(r.bathrooms, 0)::text as dkey,
      -- Ante duplicados sobrevive la fila más completa y más fresca.
      ((r.covered_area_m2 is not null)::int + (r.property_age_years is not null)::int
        + (r.bedrooms is not null)::int + (r.description is not null)::int) as completitud,
      r.updated_at,
      lower(coalesce(r.description,'') || ' ' || coalesce(r.title,'') || ' ' ||
        coalesce(array_to_string(r.amenities,' '),'')) as amen_hay,
      case when v_emb is null then 0::real else greatest(0::real, (1 - (r.embedding <=> v_emb))::real) end as sem
    from roomix_properties r
    left join zonas z
      on v_usar_zonas
     and z.k = public.acm_norm(btrim(coalesce(nullif(r.neighborhood, ''), r.city, '')))
    where r.embedding is not null
      and (p_operation = 'ambas'
        or (p_operation='venta' and r.operation='sale')
        or (p_operation='alquiler' and r.operation='rent'))
      and (array_length(p_type_patterns,1) is null
        or exists (select 1 from unnest(p_type_patterns) tp where r.property_type ilike tp or r.title ilike tp))
      and (p_m2 is null
        or (case when p_m2_cubierta then coalesce(nullif(r.covered_area_m2,0), r.area_m2) else r.area_m2 end) is null
        or (case when p_m2_cubierta then coalesce(nullif(r.covered_area_m2,0), r.area_m2) else r.area_m2 end)
            between p_m2 * 0.6 and p_m2 * 1.4)
      and (p_rooms is null
        or (case when r.rooms > 0 then r.rooms when r.bedrooms > 0 then r.bedrooms + 1 else null end) is null
        or abs((case when r.rooms > 0 then r.rooms when r.bedrooms > 0 then r.bedrooms + 1 else null end) - p_rooms) <= 1)
      -- GATE de ZONA: por niveles si el barrio se resolvió; si no, el patrón de siempre.
      and (case when v_usar_zonas then z.score is not null
                else (array_length(p_loc_patterns,1) is null
                  or exists (select 1 from unnest(p_loc_patterns) lp
                             where public.acm_norm(coalesce(r.neighborhood,'') || ' ' || coalesce(r.city,'')) like public.acm_norm(lp)))
           end)
      and (not p_exclude_ph
        or (coalesce(r.property_type,'') || ' ' || coalesce(r.title,'') || ' ' || coalesce(r.description,'')) !~* '\mph\M')
      and public.acm_pasa_obra(r.property_age_years, p_obra, p_obra_sin_dato, true)
      -- La propiedad base no es comparable de sí misma: mismos m² cubiertos (±1%), mismos
      -- baños y misma antigüedad (±2 años) = es el aviso del sujeto, no un comparable.
      and (not p_excluir_sujeto or not (
             p_m2 is not null and p_bathrooms is not null
         and (case when p_m2_cubierta then coalesce(nullif(r.covered_area_m2,0), r.area_m2) else r.area_m2 end) is not null
         and abs((case when p_m2_cubierta then coalesce(nullif(r.covered_area_m2,0), r.area_m2) else r.area_m2 end) - p_m2) <= p_m2 * 0.01
         and r.bathrooms = p_bathrooms
         and (p_antiguedad is null or r.property_age_years is null
              or abs(r.property_age_years - p_antiguedad) <= 2)
      ))
    order by case when v_emb is null then 0 else (r.embedding <=> v_emb) end asc
    limit 2000
  ),
  scored as (
    select c.id, c.m2, c.amb, c.dorm, c.ban, c.ant, c.sem, c.zona, c.dkey, c.completitud, c.updated_at,
      (case when v_usar_zonas then 20 else 0 end) as w_zona,
      (c.zona / 100.0)::numeric as s_zona,
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
      (case when v_emb is not null then p_peso_semantica else 0 end) as w_sem,
      c.sem::numeric as s_sem
    from cand c
  ),
  con_pct as (
    select s.*,
      round(((s.s_zona*s.w_zona + s.s_sup*s.w_sup + s.s_amb*s.w_amb + s.s_dorm*s.w_dorm + s.s_ban*s.w_ban + s.s_ant*s.w_ant + s.s_amen*s.w_amen + s.s_sem*s.w_sem)
             / nullif(s.w_zona+s.w_sup+s.w_amb+s.w_dorm+s.w_ban+s.w_ant+s.w_amen+s.w_sem,0)) * 100)::int as pct
    from scored s
  ),
  -- Deduplicación: un solo comparable por aviso repetido.
  rankeado as (
    select c.*,
      case when p_dedup
           then row_number() over (partition by c.dkey order by c.completitud desc, c.updated_at desc nulls last, c.id)
           else 1 end as rn
    from con_pct c
  )
  select
    d.id, d.pct as match_pct,
    case when v_usar_zonas then d.zona
         when array_length(p_loc_patterns,1) is not null then 100 else null end as sc_zona,
    case when d.w_sup>0  then round(d.s_sup*100)::int  end,
    case when d.w_amb>0  then round(d.s_amb*100)::int  end,
    case when d.w_dorm>0 then round(d.s_dorm*100)::int end,
    case when d.w_ban>0  then round(d.s_ban*100)::int  end,
    case when d.w_ant>0  then round(d.s_ant*100)::int  end,
    case when d.w_amen>0 then round(d.s_amen*100)::int end,
    case when d.w_sem>0  then round(d.s_sem*100)::int  end,
    d.m2, d.amb, d.dorm, d.ant
  from rankeado d
  where d.rn = 1
  order by d.pct desc nulls last, d.s_sem desc
  limit p_limit;
end;
$fn$;
