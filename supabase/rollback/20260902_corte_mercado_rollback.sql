-- ROLLBACK del corte a mercado_avisos (2-sep-2026). NO es una migración normal:
-- solo se aplica si el corte salió mal DESPUÉS de comprometido. Vuelve la tabla vieja a su
-- nombre y restaura los cuerpos VIVOS pre-corte de las 3 funciones (bajados con
-- pg_get_functiondef el 2-sep-2026, antes de tocar nada). Todo en una transacción.
-- Los cambios de TypeScript se revierten con git (revert del branch del corte).

begin;

drop view if exists public.roomix_properties;
alter table public.roomix_properties_legacy rename to roomix_properties;

CREATE OR REPLACE FUNCTION public.buscar_roomix(p_query_embedding text, p_operation text DEFAULT 'ambas'::text, p_type_patterns text[] DEFAULT '{}'::text[], p_rooms integer DEFAULT NULL::integer, p_bedrooms integer DEFAULT NULL::integer, p_bathrooms integer DEFAULT NULL::integer, p_price_max numeric DEFAULT NULL::numeric, p_price_min numeric DEFAULT NULL::numeric, p_currency text DEFAULT NULL::text, p_loc_patterns text[] DEFAULT '{}'::text[], p_amenity_patterns text[] DEFAULT '{}'::text[], p_free_text_patterns text[] DEFAULT '{}'::text[], p_agency_name_patterns text[] DEFAULT '{}'::text[], p_floor_min integer DEFAULT NULL::integer, p_floor_max integer DEFAULT NULL::integer, p_excluir_ids text[] DEFAULT '{}'::text[], p_poligono text DEFAULT NULL::text, p_candidatas integer DEFAULT 8000, p_limit integer DEFAULT 100)
 RETURNS TABLE(id character varying, match_pct integer, semantic_sim real)
 LANGUAGE plpgsql
 STABLE
AS $function$
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

grant execute on function public.buscar_roomix to anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.acm_match_roomix(p_query_embedding text DEFAULT NULL::text, p_operation text DEFAULT 'venta'::text, p_type_patterns text[] DEFAULT '{}'::text[], p_m2 numeric DEFAULT NULL::numeric, p_rooms integer DEFAULT NULL::integer, p_dormitorios integer DEFAULT NULL::integer, p_bathrooms integer DEFAULT NULL::integer, p_antiguedad integer DEFAULT NULL::integer, p_loc_patterns text[] DEFAULT '{}'::text[], p_amenities text[] DEFAULT '{}'::text[], p_exclude_ph boolean DEFAULT false, p_obra text DEFAULT 'off'::text, p_obra_sin_dato boolean DEFAULT true, p_barrio text DEFAULT NULL::text, p_zona_niveles boolean DEFAULT false, p_m2_cubierta boolean DEFAULT false, p_dedup boolean DEFAULT false, p_excluir_sujeto boolean DEFAULT false, p_zona_min smallint DEFAULT 50, p_peso_semantica smallint DEFAULT 10, p_limit integer DEFAULT 50)
 RETURNS TABLE(id character varying, match_pct integer, sc_zona integer, sc_superficie integer, sc_ambientes integer, sc_dormitorios integer, sc_banos integer, sc_antiguedad integer, sc_amenities integer, sc_semantica integer, cand_m2 numeric, cand_amb integer, cand_dorm integer, cand_ant integer)
 LANGUAGE plpgsql
 STABLE
 SET statement_timeout TO '25s'
AS $function$
declare
  v_emb vector(768) := null;
  -- Cuantas filas pasan del filtro duro (barato) a la etapa cara: leer el embedding
  -- de 768 dimensiones y el texto de la descripcion. Ver el comentario de `pool`.
  v_pool int := 1500;
  -- Los patrones de barrio ya normalizados, para poder compararlos con `like any`.
  v_loc_norm text[] := (select array_agg(public.acm_norm(lp)) from unnest(p_loc_patterns) lp);
  v_key text := public.acm_norm(btrim(coalesce(p_barrio, '')));
  v_usar_zonas boolean := false;
  -- Filtro de operación como comparación simple (no cadena de OR) para que sea indexable de
  -- forma confiable: v_op_libre=true → no filtra (p_operation='ambas', igual que hoy);
  -- v_op_eq=null con v_op_libre=false → NINGUNA fila matchea (mismo comportamiento que hoy
  -- ante un p_operation inválido/inesperado: la cadena de OR original tampoco matchea nada).
  v_op_libre boolean := (p_operation = 'ambas');
  v_op_eq text := case p_operation when 'venta' then 'sale' when 'alquiler' then 'rent' else null end;
begin
  if p_query_embedding is not null and length(p_query_embedding) > 2 then
    v_emb := p_query_embedding::vector(768);
    perform set_config('hnsw.ef_search', '1000', true);
    perform set_config('hnsw.iterative_scan', 'relaxed_order', true);
  end if;

  if p_zona_niveles and v_key <> '' then
    v_usar_zonas := exists (select 1 from public.acm_barrio_relacion r where r.barrio = v_key);
  end if;

  if v_usar_zonas then
    -- Camino indexado: la zona se resuelve PRIMERO (pocas filas) y roomix_properties se toca
    -- con un INNER JOIN sobre idx_roomix_zona_operacion — no con un LEFT JOIN + filtro al final.
    return query
    with zonas as (
      -- El barrio propio (100) nunca se filtra: siempre entra.
      select v_key as k, 100 as score
      union all
      select r.relacionado, r.zona_score::int from public.acm_barrio_relacion r
      where r.barrio = v_key and r.zona_score >= p_zona_min
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
        z.score as zona,
        -- Clave de duplicado: mismo aviso cargado varias veces (misma dirección, precio y medidas).
        public.acm_norm(btrim(coalesce(r.address,''))) || '|' || coalesce(r.price, 0)::text || '|' ||
          coalesce(r.area_m2, 0)::text || '|' || coalesce(r.rooms, 0)::text || '|' ||
          coalesce(r.bathrooms, 0)::text as dkey,
        -- Ante duplicados sobrevive la fila más completa y más fresca.
        ((r.covered_area_m2 is not null)::int + (r.property_age_years is not null)::int
          + (r.bedrooms is not null)::int + (r.description is not null)::int) as completitud,
        r.updated_at
      from zonas z
      join roomix_properties r
        -- Misma expresión que idx_roomix_zona_operacion: acá es donde el índice engancha.
        on public.acm_norm(btrim(coalesce(nullif(r.neighborhood, ''), r.city, ''))) = z.k
      where r.embedding is not null
        -- Solo publicaciones ACTIVAS. Un aviso dado de baja no es un comparable: es una
        -- propiedad que ya no esta en el mercado.
        and r.is_active = true
        and (v_op_libre or r.operation = v_op_eq)
        and (array_length(p_type_patterns,1) is null
          or exists (select 1 from unnest(p_type_patterns) tp where r.property_type ilike tp or r.title ilike tp))
        and (p_m2 is null
          or (case when p_m2_cubierta then coalesce(nullif(r.covered_area_m2,0), r.area_m2) else r.area_m2 end) is null
          or (case when p_m2_cubierta then coalesce(nullif(r.covered_area_m2,0), r.area_m2) else r.area_m2 end)
              between p_m2 * 0.6 and p_m2 * 1.4)
        and (p_rooms is null
          or (case when r.rooms > 0 then r.rooms when r.bedrooms > 0 then r.bedrooms + 1 else null end) is null
          or abs((case when r.rooms > 0 then r.rooms when r.bedrooms > 0 then r.bedrooms + 1 else null end) - p_rooms) <= 1)
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
    ),
    scored as (
      select c.id, c.m2, c.amb, c.dorm, c.ban, c.ant, c.zona, c.dkey, c.completitud, c.updated_at,
        20 as w_zona,
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
        (case when v_emb is not null then p_peso_semantica else 0 end) as w_sem
      from cand c
    ),
    -- FILTROS DUROS PRIMERO, EMBEDDING DESPUES.
    --
    -- Antes se calculaba la distancia coseno contra TODAS las filas del barrio para
    -- despues quedarse con 50. En una zona grande son decenas de miles de embeddings
    -- de 768 dimensiones leidos de disco: 13 segundos medidos contra un
    -- statement_timeout de 8s. El asesor veia "no pudimos completar la busqueda".
    --
    -- Ahora se ordena por el puntaje MAXIMO POSIBLE de cada fila: lo estructural ya
    -- calculado (zona, superficie, ambientes, dormitorios, banos, antiguedad) mas las
    -- dos partes que faltan valuadas en su tope (s_amen = 1 y s_sem = 1). Es una COTA
    -- SUPERIOR: ninguna fila puede terminar puntuando por encima de eso, asi que
    -- quedarse con las v_pool mejores por esa cota no cambia el ranking final.
    -- Verificado contra una variante sin corte en 11 combinaciones de barrio, zona
    -- y operacion: mismas filas, mismo orden, mismos porcentajes.
    pool as materialized (
      select s.* from scored s
      order by ((s.s_zona*s.w_zona + s.s_sup*s.w_sup + s.s_amb*s.w_amb + s.s_dorm*s.w_dorm
                 + s.s_ban*s.w_ban + s.s_ant*s.w_ant + s.w_amen + s.w_sem)
                / nullif(s.w_zona+s.w_sup+s.w_amb+s.w_dorm+s.w_ban+s.w_ant+s.w_amen+s.w_sem,0))
               desc nulls last, s.id
      limit v_pool
    ),
    -- Recien aca se tocan el embedding y la descripcion, y solo de v_pool filas.
    con_sem as (
      select p.*,
        (case when array_length(p_amenities,1) is null then 0
              else (select count(*) from unnest(p_amenities) a
                    where lower(coalesce(r.description,'') || ' ' || coalesce(r.title,'') || ' ' ||
                          coalesce(array_to_string(r.amenities,' '),'')) ~* a)::numeric
                   / array_length(p_amenities,1) end) as s_amen,
        (case when v_emb is null then 0::numeric
              else greatest(0::real, (1 - (r.embedding <=> v_emb))::real)::numeric end) as s_sem
      from pool p
      join roomix_properties r on r.id = p.id
    ),
    con_pct as (
      select s.*,
        round(((s.s_zona*s.w_zona + s.s_sup*s.w_sup + s.s_amb*s.w_amb + s.s_dorm*s.w_dorm + s.s_ban*s.w_ban + s.s_ant*s.w_ant + s.s_amen*s.w_amen + s.s_sem*s.w_sem)
               / nullif(s.w_zona+s.w_sup+s.w_amb+s.w_dorm+s.w_ban+s.w_ant+s.w_amen+s.w_sem,0)) * 100)::int as pct
      from con_sem s
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
      d.zona as sc_zona,
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
  else
    -- Camino viejo, SIN TOCAR: el barrio del sujeto no resolvió contra el mapa de zonas
    -- (texto libre raro, barrio sin datos). Se cae al gate por patrones (p_loc_patterns),
    -- igual que antes de esta migración.
    return query
    with cand as (
      select
        r.id,
        case when p_m2_cubierta then coalesce(nullif(r.covered_area_m2, 0), r.area_m2)
             else r.area_m2 end as m2,
        case when r.rooms > 0 then r.rooms when r.bedrooms > 0 then r.bedrooms + 1 else null end as amb,
        case when r.bedrooms > 0 then r.bedrooms else null end as dorm,
        r.bathrooms as ban,
        case when r.property_age_years >= 0 then r.property_age_years else null end as ant,
        public.acm_norm(btrim(coalesce(r.address,''))) || '|' || coalesce(r.price, 0)::text || '|' ||
          coalesce(r.area_m2, 0)::text || '|' || coalesce(r.rooms, 0)::text || '|' ||
          coalesce(r.bathrooms, 0)::text as dkey,
        ((r.covered_area_m2 is not null)::int + (r.property_age_years is not null)::int
          + (r.bedrooms is not null)::int + (r.description is not null)::int) as completitud,
        r.updated_at
      from roomix_properties r
      where r.embedding is not null
        -- Solo publicaciones ACTIVAS. Un aviso dado de baja no es un comparable: es una
        -- propiedad que ya no esta en el mercado.
        and r.is_active = true
        and (v_op_libre or r.operation = v_op_eq)
        and (array_length(p_type_patterns,1) is null
          or exists (select 1 from unnest(p_type_patterns) tp where r.property_type ilike tp or r.title ilike tp))
        and (p_m2 is null
          or (case when p_m2_cubierta then coalesce(nullif(r.covered_area_m2,0), r.area_m2) else r.area_m2 end) is null
          or (case when p_m2_cubierta then coalesce(nullif(r.covered_area_m2,0), r.area_m2) else r.area_m2 end)
              between p_m2 * 0.6 and p_m2 * 1.4)
        and (p_rooms is null
          or (case when r.rooms > 0 then r.rooms when r.bedrooms > 0 then r.bedrooms + 1 else null end) is null
          or abs((case when r.rooms > 0 then r.rooms when r.bedrooms > 0 then r.bedrooms + 1 else null end) - p_rooms) <= 1)
        and (array_length(p_loc_patterns,1) is null
          or public.acm_norm(coalesce(r.neighborhood,'') || ' ' || coalesce(r.city,'')) like any (v_loc_norm))
        and (not p_exclude_ph
          or (coalesce(r.property_type,'') || ' ' || coalesce(r.title,'') || ' ' || coalesce(r.description,'')) !~* '\mph\M')
        and public.acm_pasa_obra(r.property_age_years, p_obra, p_obra_sin_dato, true)
        and (not p_excluir_sujeto or not (
               p_m2 is not null and p_bathrooms is not null
           and (case when p_m2_cubierta then coalesce(nullif(r.covered_area_m2,0), r.area_m2) else r.area_m2 end) is not null
           and abs((case when p_m2_cubierta then coalesce(nullif(r.covered_area_m2,0), r.area_m2) else r.area_m2 end) - p_m2) <= p_m2 * 0.01
           and r.bathrooms = p_bathrooms
           and (p_antiguedad is null or r.property_age_years is null
                or abs(r.property_age_years - p_antiguedad) <= 2)
        ))
    ),
    scored as (
      select c.id, c.m2, c.amb, c.dorm, c.ban, c.ant, c.dkey, c.completitud, c.updated_at,
        0 as w_zona,
        0::numeric as s_zona,
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
        (case when v_emb is not null then p_peso_semantica else 0 end) as w_sem
      from cand c
    ),
    -- FILTROS DUROS PRIMERO, EMBEDDING DESPUES.
    --
    -- Antes se calculaba la distancia coseno contra TODAS las filas del barrio para
    -- despues quedarse con 50. En una zona grande son decenas de miles de embeddings
    -- de 768 dimensiones leidos de disco: 13 segundos medidos contra un
    -- statement_timeout de 8s. El asesor veia "no pudimos completar la busqueda".
    --
    -- Ahora se ordena por el puntaje MAXIMO POSIBLE de cada fila: lo estructural ya
    -- calculado (zona, superficie, ambientes, dormitorios, banos, antiguedad) mas las
    -- dos partes que faltan valuadas en su tope (s_amen = 1 y s_sem = 1). Es una COTA
    -- SUPERIOR: ninguna fila puede terminar puntuando por encima de eso, asi que
    -- quedarse con las v_pool mejores por esa cota no cambia el ranking final.
    -- Verificado contra una variante sin corte en 11 combinaciones de barrio, zona
    -- y operacion: mismas filas, mismo orden, mismos porcentajes.
    pool as materialized (
      select s.* from scored s
      order by ((s.s_zona*s.w_zona + s.s_sup*s.w_sup + s.s_amb*s.w_amb + s.s_dorm*s.w_dorm
                 + s.s_ban*s.w_ban + s.s_ant*s.w_ant + s.w_amen + s.w_sem)
                / nullif(s.w_zona+s.w_sup+s.w_amb+s.w_dorm+s.w_ban+s.w_ant+s.w_amen+s.w_sem,0))
               desc nulls last, s.id
      limit v_pool
    ),
    -- Recien aca se tocan el embedding y la descripcion, y solo de v_pool filas.
    con_sem as (
      select p.*,
        (case when array_length(p_amenities,1) is null then 0
              else (select count(*) from unnest(p_amenities) a
                    where lower(coalesce(r.description,'') || ' ' || coalesce(r.title,'') || ' ' ||
                          coalesce(array_to_string(r.amenities,' '),'')) ~* a)::numeric
                   / array_length(p_amenities,1) end) as s_amen,
        (case when v_emb is null then 0::numeric
              else greatest(0::real, (1 - (r.embedding <=> v_emb))::real)::numeric end) as s_sem
      from pool p
      join roomix_properties r on r.id = p.id
    ),
    con_pct as (
      select s.*,
        round(((s.s_zona*s.w_zona + s.s_sup*s.w_sup + s.s_amb*s.w_amb + s.s_dorm*s.w_dorm + s.s_ban*s.w_ban + s.s_ant*s.w_ant + s.s_amen*s.w_amen + s.s_sem*s.w_sem)
               / nullif(s.w_zona+s.w_sup+s.w_amb+s.w_dorm+s.w_ban+s.w_ant+s.w_amen+s.w_sem,0)) * 100)::int as pct
      from con_sem s
    ),
    rankeado as (
      select c.*,
        case when p_dedup
             then row_number() over (partition by c.dkey order by c.completitud desc, c.updated_at desc nulls last, c.id)
             else 1 end as rn
      from con_pct c
    )
    select
      d.id, d.pct as match_pct,
      case when array_length(p_loc_patterns,1) is not null then 100 else null end as sc_zona,
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
  end if;
end;
$function$;

alter function public.acm_match_roomix(text, text, text[], numeric, integer, integer, integer, integer, text[], text[], boolean, text, boolean, text, boolean, boolean, boolean, boolean, smallint, smallint, integer)
  set statement_timeout = '25s';

CREATE OR REPLACE FUNCTION public.mapa_colaboracion(p_sur double precision, p_oeste double precision, p_norte double precision, p_este double precision, p_operacion text DEFAULT NULL::text, p_tipos text[] DEFAULT NULL::text[], p_precio_min numeric DEFAULT NULL::numeric, p_precio_max numeric DEFAULT NULL::numeric, p_moneda text DEFAULT NULL::text, p_ambientes integer[] DEFAULT NULL::integer[], p_limit integer DEFAULT 1000, p_barrio text DEFAULT NULL::text)
 RETURNS TABLE(ref text, title text, price numeric, currency text, property_type text, status text, bedrooms integer, bathrooms integer, total_area numeric, address text, city text, foto text, lat double precision, lng double precision, assigned_agent_id uuid, agent_name text, agent_email text, agencia_nombre text, canonical_url text, ambientes integer)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  -- Las dos salen del parametro UNA vez, para que el plan las vea como constantes.
  v_hay_cinco boolean := p_ambientes IS NOT NULL AND 5 = ANY(p_ambientes);
  v_hay_barrio boolean := p_barrio IS NOT NULL AND btrim(p_barrio) <> '';
BEGIN
  IF v_hay_barrio THEN
    RETURN QUERY
    -- MATERIALIZED no es decorativo: sin el, Postgres aplana el CTE, vuelve a elegir el
    -- indice geografico y estamos donde empezamos.
    WITH cand AS MATERIALIZED (
      SELECT r.*
      FROM roomix_properties r
      WHERE r.is_active
        AND barrio_normalizado(r.neighborhood::text) = p_barrio
        AND (p_operacion IS NULL
             OR (p_operacion = 'Venta'    AND r.operation = 'sale')
             OR (p_operacion = 'Alquiler' AND r.operation = 'rent'))
        AND (p_ambientes IS NULL
             OR r.rooms = ANY(p_ambientes)
             OR (v_hay_cinco AND r.rooms >= 5))
    )
    SELECT
      c.slug::text, c.title, c.price, c.currency::text, c.property_type::text,
      CASE WHEN c.operation = 'rent' THEN 'Alquiler' ELSE 'Venta' END,
      c.bedrooms, c.bathrooms, c.area_m2,
      COALESCE(c.address, c.neighborhood::text, ''),
      c.neighborhood::text,
      c.images[1], c.lat, c.lng,
      NULL::uuid, ''::text, ''::text,
      COALESCE(c.roomix_agency_name::text, 'Inmobiliaria colaboradora'),
      c.canonical_url,
      c.rooms
    FROM cand c
    WHERE c.lat IS NOT NULL AND c.lng IS NOT NULL
      AND point(c.lng, c.lat) <@ box(point(p_oeste, p_sur), point(p_este, p_norte))
      AND (p_tipos      IS NULL OR c.property_type::text = ANY(p_tipos))
      AND (p_moneda     IS NULL OR c.currency = p_moneda)
      AND (p_precio_min IS NULL OR c.price >= p_precio_min)
      AND (p_precio_max IS NULL OR c.price <= p_precio_max)
    LIMIT p_limit;

  ELSE
    RETURN QUERY
    SELECT
      r.slug::text, r.title, r.price, r.currency::text, r.property_type::text,
      CASE WHEN r.operation = 'rent' THEN 'Alquiler' ELSE 'Venta' END,
      r.bedrooms, r.bathrooms, r.area_m2,
      COALESCE(r.address, r.neighborhood::text, ''),
      r.neighborhood::text,
      r.images[1], r.lat, r.lng,
      NULL::uuid, ''::text, ''::text,
      COALESCE(r.roomix_agency_name::text, 'Inmobiliaria colaboradora'),
      r.canonical_url,
      r.rooms
    FROM roomix_properties r
    WHERE r.is_active
      AND r.lat IS NOT NULL AND r.lng IS NOT NULL
      AND point(r.lng, r.lat) <@ box(point(p_oeste, p_sur), point(p_este, p_norte))
      AND (p_operacion IS NULL
           OR (p_operacion = 'Venta'    AND r.operation = 'sale')
           OR (p_operacion = 'Alquiler' AND r.operation = 'rent'))
      AND (p_tipos      IS NULL OR r.property_type::text = ANY(p_tipos))
      AND (p_moneda     IS NULL OR r.currency = p_moneda)
      AND (p_precio_min IS NULL OR r.price >= p_precio_min)
      AND (p_precio_max IS NULL OR r.price <= p_precio_max)
      AND (p_ambientes IS NULL
           OR r.rooms = ANY(p_ambientes)
           OR (v_hay_cinco AND r.rooms >= 5))
    LIMIT p_limit;
  END IF;
END;
$function$;

commit;
