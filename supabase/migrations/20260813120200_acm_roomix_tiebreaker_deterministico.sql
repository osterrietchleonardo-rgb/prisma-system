-- ACM: `acm_match_roomix` — tiebreaker determinístico en el corte `limit 2000` de la CTE `cand`
-- (las dos ramas: con zona indexada y la vieja sin tocar), agregado sobre la reescritura de
-- 20260813120100_acm_roomix_indexado_zona_primero.sql. No cambia la firma ni el contrato
-- documentado ahí (mismos parámetros, mismo RETURNS TABLE); esta migración reemplaza la función
-- de nuevo (CREATE OR REPLACE) solo para agregar `, r.id` al final del `order by` que precede a
-- cada `limit 2000`.
--
-- Por qué hace falta (hallazgo M13 de la revisión final de la rama): cuando no hay embedding
-- (`v_emb is null`, ej. falló la generación del embedding del sujeto y el ACM cae a ranking
-- estructural), la expresión de orden es literalmente `0` para TODAS las filas — un empate total.
-- Postgres no garantiza qué 2000 filas sobreviven un `ORDER BY <empate> LIMIT n` sin tiebreaker:
-- depende del plan (heap scan físico, bitmap heap scan vía el índice de zona, etc.), que puede
-- cambiar entre corridas por motivos ajenos a los datos (autovacuum, estadísticas, incluso qué
-- plan cachea el planner). En un barrio grande donde el gate de zona deja MÁS de 2000
-- candidatos (medido: Palermo/venta con embedding real, 9.766 candidatos solo por zona+operación,
-- ver verificación abajo) esto es alcanzable en producción, no un caso de laboratorio.
--
-- La evidencia de "resultados idénticos en las 8 corridas" de la migración anterior
-- (task-13-report.md) es real para lo que se midió — pero se midió CON embedding, donde
-- `r.embedding <=> v_emb` casi nunca empata en punto flotante y el orden ya sale estable de
-- por sí. La garantía de esa medición no se extiende, por construcción, al camino SIN embedding
-- con más de 2000 candidatos: ahí el empate es total y el orden previo a este fix era
-- efectivamente arbitrario. Agregar `r.id` como segundo criterio hace que el corte sea siempre
-- el mismo conjunto de 2000 filas para el mismo estado de la tabla, sin importar qué plan haya
-- elegido el planner.
--
-- Efecto esperado en cada camino:
--   - CON embedding (el 99% de las búsquedas reales): sin cambio observable. Verificado
--     re-corriendo la misma consulta (Palermo, embedding real, zona_min 70, con m²/ambientes/
--     antigüedad) antes y después de aplicar esta migración — mismos 50 ids, mismo orden, mismo
--     match_pct.
--   - SIN embedding (ranking estructural, casos con mucho empate): el conjunto de "cuáles 2000
--     sobreviven" puede diferir del que devolvía la función anterior a ESTA migración — eso es
--     el fix funcionando, no una regresión: antes ese conjunto ya era arbitrario (dependía del
--     plan), ahora es estable pero determinado por `id`, un criterio tan válido como cualquier
--     otro para desempatar filas que la función considera 100% equivalentes.
--
-- Aplicar SOLO este archivo (CREATE OR REPLACE FUNCTION, sin CONCURRENTLY — no tiene la
-- restricción de transacción de la migración de índice hermana, se puede aplicar junto con otro
-- SQL si hiciera falta, aunque en la práctica se aplicó sola vía scratch/apply-sql.mjs).
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
        r.updated_at,
        lower(coalesce(r.description,'') || ' ' || coalesce(r.title,'') || ' ' ||
          coalesce(array_to_string(r.amenities,' '),'')) as amen_hay,
        case when v_emb is null then 0::real else greatest(0::real, (1 - (r.embedding <=> v_emb))::real) end as sem
      from zonas z
      join roomix_properties r
        -- Misma expresión que idx_roomix_zona_operacion: acá es donde el índice engancha.
        on public.acm_norm(btrim(coalesce(nullif(r.neighborhood, ''), r.city, ''))) = z.k
      where r.embedding is not null
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
      order by case when v_emb is null then 0 else (r.embedding <=> v_emb) end asc, r.id
      limit 2000
    ),
    scored as (
      select c.id, c.m2, c.amb, c.dorm, c.ban, c.ant, c.sem, c.zona, c.dkey, c.completitud, c.updated_at,
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
        r.updated_at,
        lower(coalesce(r.description,'') || ' ' || coalesce(r.title,'') || ' ' ||
          coalesce(array_to_string(r.amenities,' '),'')) as amen_hay,
        case when v_emb is null then 0::real else greatest(0::real, (1 - (r.embedding <=> v_emb))::real) end as sem
      from roomix_properties r
      where r.embedding is not null
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
          or exists (select 1 from unnest(p_loc_patterns) lp
                     where public.acm_norm(coalesce(r.neighborhood,'') || ' ' || coalesce(r.city,'')) like public.acm_norm(lp)))
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
      order by case when v_emb is null then 0 else (r.embedding <=> v_emb) end asc, r.id
      limit 2000
    ),
    scored as (
      select c.id, c.m2, c.amb, c.dorm, c.ban, c.ant, c.sem, c.dkey, c.completitud, c.updated_at,
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
$fn$;
