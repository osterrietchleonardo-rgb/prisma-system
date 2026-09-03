-- FIX (3-sep-2026): un comparable sin superficie aparecía al 95%.
-- Reportado por Leonardo: buscando en Belgrano (137 m2, 2 dorm, 6 años) el ACM traía
-- primero "VENTA MONOAMBIENTE DE POZO" (US$ 86.920) al 95%. El aviso no tiene superficie,
-- ni ambientes, ni baños — el % se armaba solo con zona (100) + cochera (100) + amenities
-- (100) + semántica (71). Dos causas, dos arreglos:
--
--  1) FILTRO DE M2: tenía un `or (superficie) is null` que dejaba pasar avisos sin
--     superficie cuando el sujeto SÍ declara m2. Sin superficie no hay precio/m2 — la
--     dimensión #1 de una tasación — así que un aviso así no es comparable. Se saca ese OR
--     en las dos ramas. Verificado: el fantasma desaparece, 0 comparables sin superficie,
--     sigue devolviendo 50. Solo 37 avisos sin superficie en toda la base (8 fantasma).
--
--  2) POZO: "DE POZO"/"EN POZO" no se detectaba como obra (el loader solo miraba
--     "en construcción"), así que entraban como "usada". Detección agregada al loader
--     (mercado-sync/loader.mjs) + el backfill de abajo. 964 avisos con "(en|de) pozo";
--     "pozo de aire y luz" NO matchea (el 'de' va después de pozo).
--
-- Aplicado por Management API el 3-sep (transacción, con la aserción de que el fantasma
-- ya no aparece). El backfill primero, luego el drop+create de la función.

update public.mercado_avisos m
   set en_construccion = true, antiguedad_anios = null
 where not m.en_construccion
   and (m.titulo || ' ' || coalesce(m.descripcion, '')) ~* '\m(en|de)\s+pozo\M';


drop function public.acm_match_roomix(text, text, text[], numeric, integer, integer, integer, integer, text[], text[], boolean, text, boolean, text, boolean, boolean, boolean, boolean, smallint, smallint, integer, boolean, integer, text, text, text);

CREATE OR REPLACE FUNCTION public.acm_match_roomix(p_query_embedding text DEFAULT NULL::text, p_operation text DEFAULT 'venta'::text, p_type_patterns text[] DEFAULT '{}'::text[], p_m2 numeric DEFAULT NULL::numeric, p_rooms integer DEFAULT NULL::integer, p_dormitorios integer DEFAULT NULL::integer, p_bathrooms integer DEFAULT NULL::integer, p_antiguedad integer DEFAULT NULL::integer, p_loc_patterns text[] DEFAULT '{}'::text[], p_amenities text[] DEFAULT '{}'::text[], p_exclude_ph boolean DEFAULT false, p_obra text DEFAULT 'off'::text, p_obra_sin_dato boolean DEFAULT true, p_barrio text DEFAULT NULL::text, p_zona_niveles boolean DEFAULT false, p_m2_cubierta boolean DEFAULT false, p_dedup boolean DEFAULT false, p_excluir_sujeto boolean DEFAULT false, p_zona_min smallint DEFAULT 50, p_peso_semantica smallint DEFAULT 10, p_limit integer DEFAULT 50, p_cochera boolean DEFAULT NULL::boolean, p_piso integer DEFAULT NULL::integer, p_orientacion text DEFAULT NULL::text, p_disposicion text DEFAULT NULL::text, p_cochera_patron text DEFAULT NULL::text)
 RETURNS TABLE(id character varying, match_pct integer, sc_zona integer, sc_superficie integer, sc_ambientes integer, sc_dormitorios integer, sc_banos integer, sc_antiguedad integer, sc_amenities integer, sc_semantica integer, sc_cocheras integer, sc_piso integer, sc_orientacion integer, sc_disposicion integer, cand_m2 numeric, cand_amb integer, cand_dorm integer, cand_ant integer)
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
  v_op_eq text := case p_operation when 'venta' then 'venta' when 'alquiler' then 'alquiler' else null end;
  -- Orientación como posición en la rosa de los vientos (0..7): la adyacencia se mide circular.
  v_ori_suj int := case p_orientacion when 'N' then 0 when 'NE' then 1 when 'E' then 2 when 'SE' then 3
                                      when 'S' then 4 when 'SO' then 5 when 'O' then 6 when 'NO' then 7 end;
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
    -- Camino indexado: la zona se resuelve PRIMERO (pocas filas) y mercado_avisos se toca
    -- con un INNER JOIN sobre mercado_avisos_zona_idx — no con un LEFT JOIN + filtro al final.
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
        r.id::varchar as id,
        case when p_m2_cubierta then coalesce(nullif(r.superficie_cubierta_m2, 0), r.superficie_total_m2)
             else r.superficie_total_m2 end as m2,
        case when r.ambientes > 0 then r.ambientes when r.dormitorios > 0 then r.dormitorios + 1 else null end as amb,
        case when r.dormitorios > 0 then r.dormitorios else null end as dorm,
        r.banos as ban,
        case when r.en_construccion then null when r.antiguedad_anios >= 0 then r.antiguedad_anios else null end as ant,
        z.score as zona,
        -- Clave de duplicado: mismo aviso cargado varias veces (misma dirección, precio y medidas).
        public.acm_norm(btrim(coalesce(r.direccion,''))) || '|' || coalesce(r.precio, 0)::text || '|' ||
          coalesce(r.superficie_total_m2, 0)::text || '|' || coalesce(r.ambientes, 0)::text || '|' ||
          coalesce(r.banos, 0)::text as dkey,
        -- Ante duplicados sobrevive la fila más completa y más fresca.
        ((r.superficie_cubierta_m2 is not null)::int + (r.antiguedad_anios is not null)::int
          + (r.dormitorios is not null)::int + (r.descripcion is not null)::int) as completitud,
        r.actualizado_en as updated_at,
        r.piso as c_piso, r.disposicion as c_disp, r.cocheras as c_coch,
        case r.orientacion when 'N' then 0 when 'NE' then 1 when 'E' then 2 when 'SE' then 3
                           when 'S' then 4 when 'SO' then 5 when 'O' then 6 when 'NO' then 7 end as c_ori
      from (
        -- Un aviso matchea por su barrio O por su sub_barrio (Belgrano R puntúa 100 para un
        -- sujeto de Belgrano R, no 70 como lindero). Si matchea por los dos, gana el mayor.
        -- Cada rama engancha su índice: mercado_avisos_zona_idx / mercado_avisos_zona_sub_idx.
        select zm.id_aviso, max(zm.score) as score from (
          select r2.id as id_aviso, z0.score from zonas z0
            join mercado_avisos r2 on public.acm_norm(btrim(coalesce(nullif(r2.barrio, ''), r2.ciudad, ''))) = z0.k
           where r2.estado = 'activo' and r2.calidad = 'ok'
          union all
          select r2.id, z0.score from zonas z0
            join mercado_avisos r2 on public.acm_norm(coalesce(r2.sub_barrio, '')) = z0.k
           where r2.estado = 'activo' and r2.calidad = 'ok'
        ) zm group by zm.id_aviso
      ) z
      join mercado_avisos r on r.id = z.id_aviso
      where r.embedding is not null
        -- Solo publicaciones ACTIVAS. Un aviso dado de baja no es un comparable: es una
        -- propiedad que ya no esta en el mercado.
        and r.estado = 'activo' and r.calidad = 'ok'
        and (v_op_libre or r.operacion = v_op_eq)
        and (array_length(p_type_patterns,1) is null
          or exists (select 1 from unnest(p_type_patterns) tp where r.tipo ilike tp or r.titulo ilike tp))
        -- Superficie: cuando el sujeto declara m2, un comparable SIN superficie no sirve
        -- (no tiene precio/m2, la dimension #1 de una tasacion). Antes vivia aca un
        -- `or (superficie) is null` que dejaba entrar avisos fantasma sin ningun dato
        -- estructural: aparecian al 95% por zona+cochera+amenities+semantica. Reportado por
        -- Leonardo el 3-sep (monoambiente de pozo, US$86.920, contra un depto de 137 m2).
        and (p_m2 is null
          or (case when p_m2_cubierta then coalesce(nullif(r.superficie_cubierta_m2,0), r.superficie_total_m2) else r.superficie_total_m2 end)
              between p_m2 * 0.6 and p_m2 * 1.4)
        and (p_rooms is null
          or (case when r.ambientes > 0 then r.ambientes when r.dormitorios > 0 then r.dormitorios + 1 else null end) is null
          or abs((case when r.ambientes > 0 then r.ambientes when r.dormitorios > 0 then r.dormitorios + 1 else null end) - p_rooms) <= 1)
        and (not p_exclude_ph
          or (coalesce(r.tipo,'') || ' ' || coalesce(r.titulo,'') || ' ' || coalesce(r.descripcion,'')) !~* '\mph\M')
        and public.acm_pasa_obra(case when r.en_construccion then -1 else r.antiguedad_anios end, p_obra, p_obra_sin_dato, true)
        -- La propiedad base no es comparable de sí misma: mismos m² cubiertos (±1%), mismos
        -- baños y misma antigüedad (±2 años) = es el aviso del sujeto, no un comparable.
        and (not p_excluir_sujeto or not (
               p_m2 is not null and p_bathrooms is not null
           and (case when p_m2_cubierta then coalesce(nullif(r.superficie_cubierta_m2,0), r.superficie_total_m2) else r.superficie_total_m2 end) is not null
           and abs((case when p_m2_cubierta then coalesce(nullif(r.superficie_cubierta_m2,0), r.superficie_total_m2) else r.superficie_total_m2 end) - p_m2) <= p_m2 * 0.01
           and r.banos = p_bathrooms
           and (p_antiguedad is null or r.antiguedad_anios is null
                or abs(r.antiguedad_anios - p_antiguedad) <= 2)
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
        (case when v_emb is not null then p_peso_semantica else 0 end) as w_sem,
        (case when p_cochera then 10 else 0 end) as w_coch,
        (case when p_piso is not null and c.c_piso is not null then 6 else 0 end) as w_piso,
        (case when p_piso is null or c.c_piso is null then 0
              when c.c_piso = p_piso then 1 when abs(c.c_piso - p_piso) <= 2 then 0.5 else 0 end)::numeric as s_piso,
        (case when v_ori_suj is not null and c.c_ori is not null then 5 else 0 end) as w_ori,
        (case when v_ori_suj is null or c.c_ori is null then 0
              when least(abs(c.c_ori - v_ori_suj), 8 - abs(c.c_ori - v_ori_suj)) = 0 then 1
              when least(abs(c.c_ori - v_ori_suj), 8 - abs(c.c_ori - v_ori_suj)) = 1 then 0.5 else 0 end)::numeric as s_ori,
        (case when p_disposicion is not null and c.c_disp is not null then 5 else 0 end) as w_disp,
        (case when p_disposicion is null or c.c_disp is null then 0
              when c.c_disp = p_disposicion then 1 else 0 end)::numeric as s_disp,
        c.c_coch
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
                 + s.s_ban*s.w_ban + s.s_ant*s.w_ant + s.s_piso*s.w_piso + s.s_ori*s.w_ori + s.s_disp*s.w_disp + s.w_amen + s.w_sem + s.w_coch)
                / nullif(s.w_zona+s.w_sup+s.w_amb+s.w_dorm+s.w_ban+s.w_ant+s.w_amen+s.w_sem+s.w_coch+s.w_piso+s.w_ori+s.w_disp,0))
               desc nulls last, s.id
      limit v_pool
    ),
    -- Recien aca se tocan el embedding y la descripcion, y solo de v_pool filas.
    con_sem as (
      select p.*,
        (case when array_length(p_amenities,1) is null then 0
              else (select count(*) from unnest(p_amenities) a
                    where lower(coalesce(r.descripcion,'') || ' ' || coalesce(r.titulo,'') || ' ' ||
                          coalesce(array_to_string(r.amenities,' '),'')) ~* a)::numeric
                   / array_length(p_amenities,1) end) as s_amen,
        (case when v_emb is null then 0::numeric
              else greatest(0::real, (1 - (r.embedding <=> v_emb))::real)::numeric end) as s_sem,
        (case when not coalesce(p_cochera, false) then 0
              when p.c_coch > 0 then 1
              when p_cochera_patron is not null
                   and lower(coalesce(r.descripcion,'') || ' ' || coalesce(r.titulo,'') || ' ' ||
                             coalesce(array_to_string(r.amenities,' '),'')) ~* p_cochera_patron then 1
              else 0 end)::numeric as s_coch
      from pool p
      join mercado_avisos r on r.id::text = p.id
    ),
    con_pct as (
      select s.*,
        round(((s.s_zona*s.w_zona + s.s_sup*s.w_sup + s.s_amb*s.w_amb + s.s_dorm*s.w_dorm + s.s_ban*s.w_ban + s.s_ant*s.w_ant + s.s_amen*s.w_amen + s.s_sem*s.w_sem + s.s_coch*s.w_coch + s.s_piso*s.w_piso + s.s_ori*s.w_ori + s.s_disp*s.w_disp)
               / nullif(s.w_zona+s.w_sup+s.w_amb+s.w_dorm+s.w_ban+s.w_ant+s.w_amen+s.w_sem+s.w_coch+s.w_piso+s.w_ori+s.w_disp,0)) * 100)::int as pct
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
      case when d.w_coch>0 then round(d.s_coch*100)::int end,
      case when d.w_piso>0 then round(d.s_piso*100)::int end,
      case when d.w_ori>0  then round(d.s_ori*100)::int  end,
      case when d.w_disp>0 then round(d.s_disp*100)::int end,
      d.m2, d.amb::int, d.dorm::int, d.ant::int
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
        r.id::varchar as id,
        case when p_m2_cubierta then coalesce(nullif(r.superficie_cubierta_m2, 0), r.superficie_total_m2)
             else r.superficie_total_m2 end as m2,
        case when r.ambientes > 0 then r.ambientes when r.dormitorios > 0 then r.dormitorios + 1 else null end as amb,
        case when r.dormitorios > 0 then r.dormitorios else null end as dorm,
        r.banos as ban,
        case when r.en_construccion then null when r.antiguedad_anios >= 0 then r.antiguedad_anios else null end as ant,
        public.acm_norm(btrim(coalesce(r.direccion,''))) || '|' || coalesce(r.precio, 0)::text || '|' ||
          coalesce(r.superficie_total_m2, 0)::text || '|' || coalesce(r.ambientes, 0)::text || '|' ||
          coalesce(r.banos, 0)::text as dkey,
        ((r.superficie_cubierta_m2 is not null)::int + (r.antiguedad_anios is not null)::int
          + (r.dormitorios is not null)::int + (r.descripcion is not null)::int) as completitud,
        r.actualizado_en as updated_at,
        r.piso as c_piso, r.disposicion as c_disp, r.cocheras as c_coch,
        case r.orientacion when 'N' then 0 when 'NE' then 1 when 'E' then 2 when 'SE' then 3
                           when 'S' then 4 when 'SO' then 5 when 'O' then 6 when 'NO' then 7 end as c_ori
      from mercado_avisos r
      where r.embedding is not null
        -- Solo publicaciones ACTIVAS. Un aviso dado de baja no es un comparable: es una
        -- propiedad que ya no esta en el mercado.
        and r.estado = 'activo' and r.calidad = 'ok'
        and (v_op_libre or r.operacion = v_op_eq)
        and (array_length(p_type_patterns,1) is null
          or exists (select 1 from unnest(p_type_patterns) tp where r.tipo ilike tp or r.titulo ilike tp))
        -- Superficie: cuando el sujeto declara m2, un comparable SIN superficie no sirve
        -- (no tiene precio/m2, la dimension #1 de una tasacion). Antes vivia aca un
        -- `or (superficie) is null` que dejaba entrar avisos fantasma sin ningun dato
        -- estructural: aparecian al 95% por zona+cochera+amenities+semantica. Reportado por
        -- Leonardo el 3-sep (monoambiente de pozo, US$86.920, contra un depto de 137 m2).
        and (p_m2 is null
          or (case when p_m2_cubierta then coalesce(nullif(r.superficie_cubierta_m2,0), r.superficie_total_m2) else r.superficie_total_m2 end)
              between p_m2 * 0.6 and p_m2 * 1.4)
        and (p_rooms is null
          or (case when r.ambientes > 0 then r.ambientes when r.dormitorios > 0 then r.dormitorios + 1 else null end) is null
          or abs((case when r.ambientes > 0 then r.ambientes when r.dormitorios > 0 then r.dormitorios + 1 else null end) - p_rooms) <= 1)
        and (array_length(p_loc_patterns,1) is null
          or public.acm_norm(coalesce(r.barrio,'') || ' ' || coalesce(r.ciudad,'')) like any (v_loc_norm))
        and (not p_exclude_ph
          or (coalesce(r.tipo,'') || ' ' || coalesce(r.titulo,'') || ' ' || coalesce(r.descripcion,'')) !~* '\mph\M')
        and public.acm_pasa_obra(case when r.en_construccion then -1 else r.antiguedad_anios end, p_obra, p_obra_sin_dato, true)
        and (not p_excluir_sujeto or not (
               p_m2 is not null and p_bathrooms is not null
           and (case when p_m2_cubierta then coalesce(nullif(r.superficie_cubierta_m2,0), r.superficie_total_m2) else r.superficie_total_m2 end) is not null
           and abs((case when p_m2_cubierta then coalesce(nullif(r.superficie_cubierta_m2,0), r.superficie_total_m2) else r.superficie_total_m2 end) - p_m2) <= p_m2 * 0.01
           and r.banos = p_bathrooms
           and (p_antiguedad is null or r.antiguedad_anios is null
                or abs(r.antiguedad_anios - p_antiguedad) <= 2)
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
        (case when v_emb is not null then p_peso_semantica else 0 end) as w_sem,
        (case when p_cochera then 10 else 0 end) as w_coch,
        (case when p_piso is not null and c.c_piso is not null then 6 else 0 end) as w_piso,
        (case when p_piso is null or c.c_piso is null then 0
              when c.c_piso = p_piso then 1 when abs(c.c_piso - p_piso) <= 2 then 0.5 else 0 end)::numeric as s_piso,
        (case when v_ori_suj is not null and c.c_ori is not null then 5 else 0 end) as w_ori,
        (case when v_ori_suj is null or c.c_ori is null then 0
              when least(abs(c.c_ori - v_ori_suj), 8 - abs(c.c_ori - v_ori_suj)) = 0 then 1
              when least(abs(c.c_ori - v_ori_suj), 8 - abs(c.c_ori - v_ori_suj)) = 1 then 0.5 else 0 end)::numeric as s_ori,
        (case when p_disposicion is not null and c.c_disp is not null then 5 else 0 end) as w_disp,
        (case when p_disposicion is null or c.c_disp is null then 0
              when c.c_disp = p_disposicion then 1 else 0 end)::numeric as s_disp,
        c.c_coch
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
                 + s.s_ban*s.w_ban + s.s_ant*s.w_ant + s.s_piso*s.w_piso + s.s_ori*s.w_ori + s.s_disp*s.w_disp + s.w_amen + s.w_sem + s.w_coch)
                / nullif(s.w_zona+s.w_sup+s.w_amb+s.w_dorm+s.w_ban+s.w_ant+s.w_amen+s.w_sem+s.w_coch+s.w_piso+s.w_ori+s.w_disp,0))
               desc nulls last, s.id
      limit v_pool
    ),
    -- Recien aca se tocan el embedding y la descripcion, y solo de v_pool filas.
    con_sem as (
      select p.*,
        (case when array_length(p_amenities,1) is null then 0
              else (select count(*) from unnest(p_amenities) a
                    where lower(coalesce(r.descripcion,'') || ' ' || coalesce(r.titulo,'') || ' ' ||
                          coalesce(array_to_string(r.amenities,' '),'')) ~* a)::numeric
                   / array_length(p_amenities,1) end) as s_amen,
        (case when v_emb is null then 0::numeric
              else greatest(0::real, (1 - (r.embedding <=> v_emb))::real)::numeric end) as s_sem,
        (case when not coalesce(p_cochera, false) then 0
              when p.c_coch > 0 then 1
              when p_cochera_patron is not null
                   and lower(coalesce(r.descripcion,'') || ' ' || coalesce(r.titulo,'') || ' ' ||
                             coalesce(array_to_string(r.amenities,' '),'')) ~* p_cochera_patron then 1
              else 0 end)::numeric as s_coch
      from pool p
      join mercado_avisos r on r.id::text = p.id
    ),
    con_pct as (
      select s.*,
        round(((s.s_zona*s.w_zona + s.s_sup*s.w_sup + s.s_amb*s.w_amb + s.s_dorm*s.w_dorm + s.s_ban*s.w_ban + s.s_ant*s.w_ant + s.s_amen*s.w_amen + s.s_sem*s.w_sem + s.s_coch*s.w_coch + s.s_piso*s.w_piso + s.s_ori*s.w_ori + s.s_disp*s.w_disp)
               / nullif(s.w_zona+s.w_sup+s.w_amb+s.w_dorm+s.w_ban+s.w_ant+s.w_amen+s.w_sem+s.w_coch+s.w_piso+s.w_ori+s.w_disp,0)) * 100)::int as pct
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
      case when d.w_coch>0 then round(d.s_coch*100)::int end,
      case when d.w_piso>0 then round(d.s_piso*100)::int end,
      case when d.w_ori>0  then round(d.s_ori*100)::int  end,
      case when d.w_disp>0 then round(d.s_disp*100)::int end,
      d.m2, d.amb::int, d.dorm::int, d.ant::int
    from rankeado d
    where d.rn = 1
    order by d.pct desc nulls last, d.s_sem desc
    limit p_limit;
  end if;
end;
$function$;

alter function public.acm_match_roomix(text, text, text[], numeric, integer, integer, integer, integer, text[], text[], boolean, text, boolean, text, boolean, boolean, boolean, boolean, smallint, smallint, integer, boolean, integer, text, text, text) set statement_timeout = '25s';
grant execute on function public.acm_match_roomix to anon, authenticated, service_role;
