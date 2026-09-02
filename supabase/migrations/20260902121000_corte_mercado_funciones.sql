-- CORTE a mercado_avisos (2-sep-2026) · parte 1: las funciones calientes.
--
-- Las funciones del ACM, el Buscador y el Mapa se reescriben DIRECTO contra mercado_avisos
-- (no contra la vista de compatibilidad): una vista con renombres + JOIN no deja usar los
-- índices y reviviría las batallas de timeout ya ganadas (20260819120100, 20260826030000).
--
-- MÉTODO: cada cuerpo se tomó de la función VIVA con pg_get_functiondef y se transformó con
-- reemplazos exactos verificados por script (conteo por reemplazo + aserción de que no queda
-- ningún resto de roomix). Todo lo no nombrado quedó carácter por carácter igual. Igual que
-- se hicieron 20260819120100 y 20260826030000.
--
-- Mapeo aplicado: tabla roomix_properties→mercado_avisos · area_m2→superficie_total_m2 ·
-- covered_area_m2→superficie_cubierta_m2 · rooms→ambientes · bedrooms→dormitorios ·
-- bathrooms→banos · floor→piso · property_age_years→antiguedad_anios · address→direccion ·
-- neighborhood→barrio · city→ciudad · property_type→tipo · title→titulo · description→
-- descripcion · price→precio · currency→moneda · roomix_agency_name→publicador_nombre ·
-- canonical_url→url_publica · images→fotos · updated_at→actualizado_en ·
-- operation 'sale'/'rent' → operacion 'venta'/'alquiler' (¡valores, no solo nombre!) ·
-- is_active → (estado='activo' and calidad='ok') · id bigint → ::varchar en la salida
-- (las firmas devuelven character varying y el código trata el id como string).
--
-- Los índices espejo (aditivos, ya aplicados el 2-sep y verificados con EXPLAIN sobre las
-- dos particiones: polígono 19,7 ms · trgm 31,6 ms) replican los de roomix que las
-- expresiones vivas necesitan. Las funciones de heatmap (mapa_precio_m2*) NO viajan acá:
-- leen tablas precalculadas (mapa_precio_m2_celdas/manzanas/barrios), no roomix.
--
-- IMPORTANTE: aplicar JUNTO con 20260902121500_corte_mercado_vista.sql en UNA transacción.

create extension if not exists pg_trgm;

-- Espejo de idx_roomix_geo_vigentes: sirve al polígono dibujado del Buscador Y al bbox del Mapa.
create index if not exists mercado_avisos_punto_idx
  on public.mercado_avisos using gist (point(lng, lat))
  where estado = 'activo' and calidad = 'ok';

-- Espejo de idx_roomix_loc_trgm: la expresión es EXACTAMENTE la del `ilike any` de buscar_roomix.
create index if not exists mercado_avisos_loc_trgm_idx
  on public.mercado_avisos using gin (lower(coalesce(barrio,'') || ' ' || coalesce(direccion,'') || ' ' || coalesce(titulo,'')) gin_trgm_ops)
  where estado = 'activo' and calidad = 'ok';

-- ─────────────────── Buscador IA: buscar_roomix → mercado_avisos ───────────────────
-- Validada el 2-sep contra producción (función de prueba, luego borrada): Belgrano 3 amb
-- venta = 100 filas con id numérico-texto; embedding real sim 0.902–1.000; polígono sobre
-- Belgrano = 100 filas; alquiler = 0 (corte limpio).

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
      r.id::varchar as id,
      coalesce(nullif(r.ambientes,0), case when r.dormitorios > 0 then r.dormitorios + 1 else null end) as amb,
      r.piso as floor_val,
      lower(coalesce(r.titulo,'') || ' ' || coalesce(r.descripcion,'') || ' ' || coalesce(r.direccion,'') || ' ' ||
        coalesce(r.barrio,'') || ' ' || coalesce(r.region,'') || ' ' || coalesce(r.ciudad,'') || ' ' ||
        coalesce(r.tipo,'') || ' ' || coalesce(array_to_string(r.amenities,' '),'')) as ft_hay
    from mercado_avisos r
    where r.embedding is not null
      -- Un aviso dado de baja no es una opcion para mostrarle a un cliente. En mercado_avisos
      -- el estado es un enum limpio (sin los NULL heredados de roomix) y la cuarentena de
      -- calidad tampoco se muestra.
      and r.estado = 'activo' and r.calidad = 'ok'
      -- Zona dibujada a mano. Se escribe como `point(lng,lat) <@ poligono` A PROPOSITO: es la
      -- MISMA expresion que indexa mercado_avisos_punto_idx, y por eso se resuelve por indice
      -- en 12 ms en vez de leer 2.488 MB. Escrito de cualquier otra forma (lat between ... y
      -- lng between ...) el indice NO entra: medido, 4.225 ms y 2.488 MB.
      and (p_poligono is null
        or (r.lat is not null and r.lng is not null
            and point(r.lng, r.lat) <@ p_poligono::polygon))
      and (array_length(p_excluir_ids,1) is null or r.id::text <> all (p_excluir_ids))
      and (p_operation = 'ambas'
        or (p_operation = 'venta'    and r.operacion = 'venta')
        or (p_operation = 'alquiler' and r.operacion = 'alquiler'))
      and (array_length(p_agency_name_patterns,1) is null
        or exists (select 1 from unnest(p_agency_name_patterns) ap where r.publicador_nombre ilike ap))
      and (array_length(p_type_patterns,1) is null
        or exists (select 1 from unnest(p_type_patterns) tp where r.tipo ilike tp or r.titulo ilike tp))
      and (p_rooms is null
        or coalesce(nullif(r.ambientes,0), case when r.dormitorios>0 then r.dormitorios+1 else null end) is null
        or abs(coalesce(nullif(r.ambientes,0), case when r.dormitorios>0 then r.dormitorios+1 else null end) - p_rooms) <= 1)
      and (p_bedrooms is null or coalesce(r.dormitorios,0) <= 0 or abs(r.dormitorios - p_bedrooms) <= 1)
      and (p_bathrooms is null or coalesce(r.banos,0) <= 0 or r.banos >= p_bathrooms)
      and (p_price_max is null or coalesce(r.precio,0) <= 0
        or (p_currency is not null and r.moneda is not null and lower(r.moneda) <> lower(p_currency))
        or r.precio <= p_price_max * 1.20)
      and (p_price_min is null or coalesce(r.precio,0) <= 0
        or (p_currency is not null and r.moneda is not null and lower(r.moneda) <> lower(p_currency))
        or r.precio >= p_price_min * 0.95)
      -- `ilike any (...)` y no `exists (select ... unnest ...)`: significan lo mismo, pero solo
      -- esta forma engancha mercado_avisos_loc_trgm_idx. Con la otra el planner lee la tabla entera.
      and (array_length(p_loc_patterns,1) is null
        or lower(coalesce(r.barrio,'') || ' ' || coalesce(r.direccion,'') || ' ' || coalesce(r.titulo,'')) ilike any (p_loc_patterns))
      and (
        (p_floor_min is null and p_floor_max is null)
        or r.piso is null
        or r.piso between coalesce(p_floor_min,0) and coalesce(p_floor_max,9999)
      )
      -- Los amenities DESCARTAN (ver nota 1 arriba). Cada patron es una alternancia de
      -- sinonimos que arma la app: 'cochera|garage|garaje|estacionamiento'.
      and (array_length(p_amenity_patterns,1) is null
        or not exists (
          select 1 from unnest(p_amenity_patterns) pat
          where lower(coalesce(r.descripcion,'') || ' ' || coalesce(r.titulo,'') || ' ' ||
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
  join mercado_avisos r on r.id::text = c.id
  order by
    match_pct desc nulls last,
    (case when (p_floor_min is not null or p_floor_max is not null) and c.floor_val is not null then 1 else 0 end) desc,
    semantic_sim desc
  limit p_limit;
end;
$function$;

grant execute on function public.buscar_roomix to anon, authenticated, service_role;
