-- ACM · La busqueda en la RED de colaboracion se cortaba por timeout y el asesor se quedaba
-- SIN comparables de la red.
--
-- El sintoma, reportado por un asesor de Central Real Estate el 18-ago-2026 (ACM de Cabildo
-- 200, Belgrano, con "incluir barrios linderos" tildado): el cartel rojo "No pudimos
-- completar la busqueda en la red de comparables". No era un problema de pantalla: el RPC
-- devolvia 57014 (canceling statement due to statement timeout) y la app, que ese caso lo
-- maneja bien, marcaba roomix_fallo. Medido sobre las busquedas guardadas en acm_searches:
-- 11 de 33 ACM perdieron los comparables de la red, y las 5 que iban con linderos fallaron
-- las 5.
--
-- CAUSA RAIZ, del EXPLAIN ANALYZE y no de la intuicion: la CTE `cand` ordenaba por
-- `embedding <=> v_emb` con LIMIT 2000. Ese ORDER BY vive dentro de un join con filtros, asi
-- que el planner no puede usar idx_roomix_embedding_hnsw: resolvia con Nested Loop + top-N
-- heapsort, o sea leer el embedding de 768 dimensiones de TODAS las filas activas de la zona
-- y calcular la distancia coseno una por una. Almagro + linderos = 26.761 filas -> 13.490 ms
-- y 31.082 buffers leidos de disco, contra un statement_timeout de 8s en el rol
-- `authenticated`. El hnsw.ef_search=1000 y el iterative_scan que setea la funcion no venian
-- al caso: el indice no se usaba.
--
-- Por que aparecio recien ahora: roomix_properties venia de sumar ~90.000 filas entre el 13
-- y el 15-ago (349.299 filas / 3,5 GB al momento del diagnostico). Los embeddings dejaron de
-- entrar en cache. Ojo con esto al probar: la MISMA consulta tardo 5.954 ms en frio y 349 ms
-- con las paginas ya cacheadas, asi que una sola corrida rapida no prueba nada. Hay que
-- medir en frio o contra un barrio que nadie toco.
--
-- EL ARREGLO: filtros duros primero, embedding despues.
--
--   antes:  filtros duros -> distancia coseno de TODO -> quedarse con 2000 -> puntuar -> 50
--   ahora:  filtros duros -> puntuar lo estructural   -> quedarse con 1500 -> coseno -> 50
--
-- El corte se hace por el puntaje MAXIMO POSIBLE de cada fila: lo estructural ya calculado
-- (zona, superficie, ambientes, dormitorios, banos, antiguedad) mas las dos partes que
-- faltan valuadas en su tope (amenities y semantica en 1). Es una cota superior, asi que
-- ninguna fila descartada podia haber entrado al top 50.
--
-- Se mueve tambien el puntaje de amenities despues del corte: necesita concatenar la
-- descripcion completa del aviso, otra columna cara de leer para decenas de miles de filas.
--
-- QUE CAMBIA EN LO QUE VE EL ASESOR. Mejora, y en un caso cambia el resultado -- para bien.
-- El LIMIT 2000 viejo no solo era lento: descartaba por CERCANIA SEMANTICA, que pesa 20
-- puntos sobre ~130 del total. En zonas con mas de 2000 candidatos tiraba comparables buenos
-- antes de puntuarlos. Ejemplo medido en Barrio Chino (7.094 candidatos): entran dos
-- comparables de 85% y 84% que antes no aparecian, y salen dos de 83%. El ranking nuevo es
-- el correcto.
--
-- COMO SE VERIFICO QUE NO ROMPE NADA. Se creo una variante identica pero sin corte alguno
-- (v_pool = 100.000.000) y se comparo fila a fila contra esta: mismas filas, mismo orden y
-- mismos porcentajes en 11 combinaciones de barrio, zona_min y operacion, incluyendo los
-- barrios mas grandes (Palermo, Recoleta, Belgrano, Centro, Caballito) en venta y alquiler.
-- Ademas se comparo contra la funcion vieja en 8 barrios: identica en 7, y en el octavo la
-- diferencia es la mejora descrita arriba.
--
-- Tiempos medidos por REST, con el mismo timeout de 8s que sufre el asesor:
--
--   Belgrano con linderos (el caso de la queja)   timeout / 2.686 ms  ->    294 ms
--   Palermo con linderos                          timeout            ->  4.098 ms
--   Recoleta con linderos                         timeout            ->  3.430 ms
--   Villa Urquiza con linderos                      3.658 ms         ->    359 ms
--   Los Lagartos (barrio no mapeado)               timeout           ->     80 ms
--   Martinez                                        1.769 ms         ->    248 ms
--
-- La definicion se tomo de la funcion VIVA con pg_get_functiondef y se transformo con
-- reemplazos exactos, para no pisar cambios que no esten en las migraciones del repo. Todo
-- lo que no se nombra en este comentario quedo caracter por caracter igual.
--
-- Dos cosas mas que viajan en esta migracion:
--
--  · is_active = true escrito explicito. NO es un cambio de conducta: `and r.is_active` ya
--    dejaba afuera las false Y las null (en SQL, NULL en un WHERE no pasa). Queda escrito
--    asi para que se lea sin tener que acordarse de la logica de tres valores. La decision
--    de excluir tambien las NULL es de Leonardo y viene de 20260815100000.
--
--  · La rama de respaldo (barrio que no resuelve contra acm_barrio_relacion) cambia su
--    filtro de barrio de `exists (select 1 from unnest(...) lp where ... like acm_norm(lp))`
--    a `... like any (v_loc_norm)`. Es la MISMA condicion; la diferencia es que asi el
--    planner puede usar el indice de trigramas que crea 20260819120000. Con el `exists`
--    hacia Seq Scan de 251.229 filas (4.589 ms); con `like any`, 7 ms.

CREATE OR REPLACE FUNCTION public.acm_match_roomix(p_query_embedding text DEFAULT NULL::text, p_operation text DEFAULT 'venta'::text, p_type_patterns text[] DEFAULT '{}'::text[], p_m2 numeric DEFAULT NULL::numeric, p_rooms integer DEFAULT NULL::integer, p_dormitorios integer DEFAULT NULL::integer, p_bathrooms integer DEFAULT NULL::integer, p_antiguedad integer DEFAULT NULL::integer, p_loc_patterns text[] DEFAULT '{}'::text[], p_amenities text[] DEFAULT '{}'::text[], p_exclude_ph boolean DEFAULT false, p_obra text DEFAULT 'off'::text, p_obra_sin_dato boolean DEFAULT true, p_barrio text DEFAULT NULL::text, p_zona_niveles boolean DEFAULT false, p_m2_cubierta boolean DEFAULT false, p_dedup boolean DEFAULT false, p_excluir_sujeto boolean DEFAULT false, p_zona_min smallint DEFAULT 50, p_peso_semantica smallint DEFAULT 10, p_limit integer DEFAULT 50)
 RETURNS TABLE(id character varying, match_pct integer, sc_zona integer, sc_superficie integer, sc_ambientes integer, sc_dormitorios integer, sc_banos integer, sc_antiguedad integer, sc_amenities integer, sc_semantica integer, cand_m2 numeric, cand_amb integer, cand_dorm integer, cand_ant integer)
 LANGUAGE plpgsql
 STABLE
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
$function$
;

-- Margen de tiempo para ESTA funcion (decidido con Leonardo el 19-ago-2026).
--
-- El arreglo de arriba baja el trabajo unas 30 veces, pero no alcanza solo: la PRIMERA
-- busqueda de un barrio grande, con el cache de Postgres frio, sigue tardando mas de 8s.
-- Medido barrio por barrio sobre 14 barrios que no se habian tocado: 3 se pasaban igual
-- (Flores, Boedo, Monserrat). El patron es muy marcado y conviene tenerlo presente al
-- medir: Belgrano + linderos tarda 9.342 ms la primera vez y 317 / 339 / 331 / 306 ms las
-- cuatro siguientes. La instancia no tiene RAM para cachear toda la ciudad a la vez.
--
-- Los 8s no son un SLA de este endpoint: son el default del rol `authenticated`, pensado
-- para llamadas REST simples. El ACM es una consulta pesada por naturaleza y su route
-- (app/api/acm/comparables/route.ts) ya declara maxDuration = 60. Con 25s el peor caso
-- medido (Recoleta en frio, 15.798 ms) entra con margen, y el caso normal -- el asesor
-- buscando otra vez en la zona donde trabaja -- sigue siendo de ~300 ms.
--
-- Con esto, 0 timeouts sobre 16 barrios probados en frio.
--
-- SI ESTO VUELVE A FALLAR: no subas el numero, mira primero cuanto creció roomix_properties.
-- El costo escala con la cantidad de filas activas de la zona, y la tabla venia sumando
-- decenas de miles de filas por semana.

ALTER FUNCTION public.acm_match_roomix(text, text, text[], numeric, integer, integer, integer, integer, text[], text[], boolean, text, boolean, text, boolean, boolean, boolean, boolean, smallint, smallint, integer)
  SET statement_timeout = '25s';
