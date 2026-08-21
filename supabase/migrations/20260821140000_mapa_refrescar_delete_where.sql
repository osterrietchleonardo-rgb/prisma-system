-- El recálculo de precios del mapa fallaba todos los días desde el 12/8/2026.
--
-- SÍNTOMA
-- El workflow `mapa-refrescar.yml` falló las 10 veces que corrió (12 al 21 de agosto,
-- 100% de las corridas: nunca funcionó ni un día). El endpoint
-- /api/cron/mapa-refrescar devolvía 500 en ~1,4 s. En los logs de Vercel, el motivo:
--
--   { code: '21000', message: 'DELETE requires a WHERE clause' }   ×3, una por RPC
--
-- POR QUÉ
-- El rol `authenticator` —el que usa PostgREST, o sea TODA llamada que sale de la app—
-- tiene `session_preload_libraries=safeupdate` (verificado en pg_roles). Esa extensión
-- rechaza cualquier DELETE o UPDATE sin WHERE. Las tres funciones abrían con
-- `DELETE FROM tabla;` a secas, así que ninguna podía correr desde la app.
--
-- POR QUÉ NADIE LO VIO EN 10 DÍAS
-- Cada migración que definió estas funciones termina con un `SELECT refrescar_...()`.
-- Aplicada desde el editor de SQL, esa llamada corre como rol `postgres`, que NO tiene
-- el seguro puesto: funcionaba. Se probaba por el camino que no es el de producción.
-- La prueba quedó en los datos: mapa_barrios tenía fecha 15/8 11:15, que es cuando se
-- aplicó a mano la última migración, no cuando corrió el cron.
--
-- QUÉ CAMBIA ACÁ
--   1. `DELETE FROM x;`  ->  `DELETE FROM x WHERE true;`
--      Es la forma de decirle a safeupdate "sí, quiero vaciar la tabla entera, a
--      propósito". No se usa TRUNCATE porque toma un lock exclusivo y dejaría el mapa
--      bloqueado mientras se recalculan las 78.540 manzanas.
--
--   2. Un candado nuevo: si el recálculo devuelve 0 filas, la función corta con error.
--      Como todo esto corre dentro de una transacción, el error revierte el DELETE y la
--      tabla vieja queda intacta. Antes, un recálculo que diera vacío (un filtro que
--      cambia, un dato que falta) borraba el mapa y devolvía "ok" sin que nadie se
--      enterara. Preferimos precios de ayer antes que un mapa en blanco.
--
-- Lo único que se toca de cada función son esas dos cosas. La cuenta —las medianas, el
-- núcleo del barrio, el cruce con las manzanas— queda idéntica.

-- ---------------------------------------------------------------------------
-- 1) Catálogo de barrios del buscador
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refrescar_mapa_barrios()
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
  filas integer;
BEGIN
  DELETE FROM mapa_barrios WHERE true;

  INSERT INTO mapa_barrios (normalizado, nombre, cantidad, sur, oeste, norte, este, donde)
  WITH normalizados AS (
    SELECT
      lower(unaccent(btrim(r.neighborhood::text))) AS normalizado,
      btrim(r.neighborhood::text)                  AS nombre,
      btrim(coalesce(NULLIF(r.region::text, ''), r.city::text, '')) AS donde,
      r.lat,
      r.lng
    FROM roomix_properties r
    WHERE r.is_active
      AND r.neighborhood IS NOT NULL
      AND btrim(r.neighborhood::text) <> ''
      AND r.lat IS NOT NULL
      AND r.lng IS NOT NULL
  ),
  -- Celdas de ~5 km. Se cuenta cuantas propiedades cae en cada una.
  celdas AS (
    SELECT normalizado,
           round(lat / 0.05) * 0.05 AS clat,
           round(lng / 0.05) * 0.05 AS clng,
           count(*) AS n
    FROM normalizados
    GROUP BY 1, 2, 3
  ),
  -- La celda mas poblada de cada nombre: ese es el barrio del que se habla.
  -- El desempate por coordenada es solo para que el resultado sea reproducible.
  nucleo AS (
    SELECT DISTINCT ON (normalizado) normalizado, clat, clng
    FROM celdas
    ORDER BY normalizado, n DESC, clat, clng
  ),
  -- Todo lo que este a menos de ~10 km del nucleo. El resto es otra ciudad.
  del_nucleo AS (
    SELECT n.*
    FROM normalizados n
    JOIN nucleo c USING (normalizado)
    WHERE abs(n.lat - c.clat) <= 0.1
      AND abs(n.lng - c.clng) <= 0.1
  ),
  -- La grafia que mas se repite: la cartera escribe "Nuñez" y la red "Núñez".
  grafia_elegida AS (
    SELECT DISTINCT ON (normalizado) normalizado, nombre
    FROM (SELECT normalizado, nombre, count(*) AS veces FROM del_nucleo GROUP BY 1, 2) g
    ORDER BY normalizado, veces DESC, nombre
  ),
  -- Donde queda: la provincia (o ciudad) mas repetida DENTRO del nucleo.
  donde_elegido AS (
    SELECT DISTINCT ON (normalizado) normalizado, donde
    FROM (SELECT normalizado, donde, count(*) AS veces FROM del_nucleo WHERE donde <> '' GROUP BY 1, 2) d
    ORDER BY normalizado, veces DESC, donde
  )
  SELECT
    d.normalizado,
    g.nombre,
    count(*)::integer,
    percentile_cont(0.01) WITHIN GROUP (ORDER BY d.lat),
    percentile_cont(0.01) WITHIN GROUP (ORDER BY d.lng),
    percentile_cont(0.99) WITHIN GROUP (ORDER BY d.lat),
    percentile_cont(0.99) WITHIN GROUP (ORDER BY d.lng),
    max(w.donde)
  FROM del_nucleo d
  JOIN grafia_elegida g USING (normalizado)
  LEFT JOIN donde_elegido w USING (normalizado)
  GROUP BY d.normalizado, g.nombre;

  GET DIAGNOSTICS filas = ROW_COUNT;

  -- Candado: 0 barrios significa que algo se rompió aguas arriba. El error revierte el
  -- DELETE y el buscador sigue con el catálogo de ayer.
  IF filas = 0 THEN
    RAISE EXCEPTION 'refrescar_mapa_barrios: el recálculo dio 0 barrios. No se pisa el catálogo anterior.';
  END IF;

  RETURN filas;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2) Cuadrícula de respaldo + ranking de barrios
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refrescar_precio_m2()
 RETURNS TABLE(celdas integer, barrios integer)
 LANGUAGE plpgsql
AS $function$
DECLARE
  n_celdas  integer;
  n_barrios integer;
BEGIN
  DELETE FROM mapa_precio_m2_celdas WHERE true;
  DELETE FROM mapa_precio_m2_barrios WHERE true;

  CREATE TEMP TABLE _base ON COMMIT DROP AS
  SELECT
    CASE WHEN r.operation = 'rent' THEN 'Alquiler' ELSE 'Venta' END AS operacion,
    r.currency::text                             AS moneda,
    lower(unaccent(btrim(r.neighborhood::text))) AS normalizado,
    btrim(r.neighborhood::text)                  AS barrio,
    floor(r.lat / 0.001)::int                    AS fy,
    floor(r.lng / 0.0012)::int                   AS fx,
    r.price / r.area_m2                          AS m2
  FROM roomix_properties r
  WHERE r.is_active
    AND r.lat IS NOT NULL AND r.lng IS NOT NULL
    AND r.area_m2 >= 15
    AND r.price >= 1000
    AND r.currency IS NOT NULL;

  INSERT INTO mapa_precio_m2_celdas
    (operacion, moneda, fy, fx, propiedades, mediana_m2, centro_lat, centro_lng)
  SELECT operacion, moneda, fy, fx, count(*)::integer,
         round(percentile_cont(0.5) WITHIN GROUP (ORDER BY m2)::numeric, 0),
         (fy + 0.5) * 0.001, (fx + 0.5) * 0.0012
  FROM _base GROUP BY operacion, moneda, fy, fx;
  GET DIAGNOSTICS n_celdas = ROW_COUNT;

  -- La grafía que más se repite para cada barrio: la cartera escribe "Nuñez" y la red
  -- "Núñez", y al mapa va la que más aparece.
  --
  -- Esto ANTES era una subconsulta correlacionada dentro del INSERT de abajo: por cada
  -- uno de los 4.621 barrios volvía a recorrer las 356.314 filas de _base. Unos 1.600
  -- millones de filas leídas, y la función no terminaba ni en 2 minutos (medido el
  -- 21/8/2026: murió por statement timeout justo en ese INSERT). Calculado una sola vez
  -- acá, es una pasada en vez de 4.621. El criterio de elección y el desempate son los
  -- mismos de antes —más repetida primero, y a igual cantidad la alfabéticamente menor—
  -- así que el nombre que sale es idéntico.
  CREATE TEMP TABLE _nombre_barrio ON COMMIT DROP AS
  SELECT DISTINCT ON (normalizado) normalizado, barrio
  FROM (
    SELECT normalizado, barrio, count(*) AS veces
    FROM _base
    WHERE normalizado IS NOT NULL AND normalizado <> ''
    GROUP BY 1, 2
  ) g
  ORDER BY normalizado, veces DESC, barrio;

  INSERT INTO mapa_precio_m2_barrios
    (operacion, moneda, normalizado, nombre, propiedades, mediana_m2)
  SELECT b.operacion, b.moneda, b.normalizado,
         nb.barrio,
         count(*)::integer,
         round(percentile_cont(0.5) WITHIN GROUP (ORDER BY b.m2)::numeric, 0)
  FROM _base b
  JOIN _nombre_barrio nb ON nb.normalizado = b.normalizado
  WHERE b.normalizado IS NOT NULL AND b.normalizado <> ''
  GROUP BY b.operacion, b.moneda, b.normalizado, nb.barrio;
  GET DIAGNOSTICS n_barrios = ROW_COUNT;

  -- Candado: los colores del mapa salen de estas dos tablas. Vacías, el mapa se ve gris.
  IF n_celdas = 0 OR n_barrios = 0 THEN
    RAISE EXCEPTION 'refrescar_precio_m2: el recálculo dio % celdas y % barrios. No se pisan los precios anteriores.', n_celdas, n_barrios;
  END IF;

  RETURN QUERY SELECT n_celdas, n_barrios;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3) Precio por m² de cada manzana real
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refrescar_precio_m2_manzanas()
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
  n integer;
BEGIN
  DELETE FROM mapa_precio_m2_manzanas WHERE true;

  CREATE TEMP TABLE _crudas ON COMMIT DROP AS
  SELECT
    'red'::text AS fuente,
    CASE WHEN r.operation = 'rent' THEN 'Alquiler' ELSE 'Venta' END AS operacion,
    r.currency::text AS moneda,
    m.id             AS manzana,
    r.price          AS precio,
    r.area_m2        AS superficie,
    r.price / r.area_m2 AS m2
  FROM roomix_properties r
  JOIN mapa_manzanas m ON ST_Contains(m.geom, ST_SetSRID(ST_MakePoint(r.lng, r.lat), 4326))
  WHERE r.is_active AND r.area_m2 >= 15 AND r.price >= 1000 AND r.currency IS NOT NULL
  UNION ALL
  SELECT
    'propia',
    -- En la cartera "Alquiler" incluye tambien "Temporary rent".
    CASE WHEN p.status = 'Venta' THEN 'Venta' ELSE 'Alquiler' END,
    p.currency,
    m.id,
    p.price,
    p.total_area,
    p.price / p.total_area
  FROM properties p
  JOIN mapa_manzanas m ON ST_Contains(m.geom, ST_SetSRID(ST_MakePoint(p.lng, p.lat), 4326))
  WHERE p.is_active AND p.total_area >= 15 AND p.price >= 1000 AND p.currency IS NOT NULL;

  INSERT INTO mapa_precio_m2_manzanas (manzana_id, operacion, moneda, propiedades, mediana_m2)
  SELECT c.manzana, c.operacion, c.moneda, count(*)::integer,
         round(percentile_cont(0.5) WITHIN GROUP (ORDER BY c.m2)::numeric, 0)
  FROM _crudas c
  WHERE c.fuente = 'red'
     -- La propia entra salvo que la MISMA manzana ya tenga esa publicacion por la red.
     OR NOT EXISTS (
       SELECT 1 FROM _crudas r
       WHERE r.fuente = 'red'
         AND r.manzana = c.manzana
         AND r.precio = c.precio
         AND r.superficie = c.superficie
     )
  GROUP BY c.manzana, c.operacion, c.moneda;

  GET DIAGNOSTICS n = ROW_COUNT;

  -- Candado: es la capa que le da color a cada manzana. Vacía, el mapa pierde el detalle.
  IF n = 0 THEN
    RAISE EXCEPTION 'refrescar_precio_m2_manzanas: el recálculo dio 0 manzanas con precio. No se pisa lo anterior.';
  END IF;

  RETURN n;
END;
$function$;

COMMENT ON FUNCTION public.refrescar_precio_m2_manzanas() IS
  'Recalcula el precio por m2 de cada manzana cruzando la red y la cartera propia. '
  'Los DELETE llevan WHERE true a proposito: el rol authenticator tiene safeupdate y '
  'rechaza el DELETE pelado. Corta con error si el recalculo da 0 filas.';
