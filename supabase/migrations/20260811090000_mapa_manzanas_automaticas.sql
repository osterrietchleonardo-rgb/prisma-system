-- Mapa · dos cambios pedidos el 2026-08-11.
--
-- 1. QUE APAREZCAN AUNQUE HAYA 1 O 2 PROPIEDADES
-- Antes se exigian 3 por manzana. El motivo era estadistico —con una propiedad la
-- "mediana" es esa propiedad, no el mercado— pero en la practica dejaba en blanco barrios
-- enteros del interior donde hay poco publicado, y ahi el asesor prefiere ver el unico
-- dato que hay antes que nada. Se muestran todas; cuantas propiedades la sostienen sigue
-- estando a la vista en el globito, y la pantalla las pinta mas transparentes.
--
-- 2. QUE LAS MANZANAS SE TRACEN SOLAS DONDE HAY PROPIEDADES
-- Antes las zonas se cargaban a mano, una por una. Ahora la base dice sola que le falta:
-- se buscan las propiedades que NO caen dentro de ninguna manzana, se agrupan en baldosas
-- y esa es la lista de trabajo. Si manana la red publica en un pueblo nuevo, esa baldosa
-- aparece en la lista y se traza en la corrida siguiente, sin que nadie pida nada.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Sin minimo de propiedades
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION refrescar_precio_m2_manzanas()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  n integer;
BEGIN
  DELETE FROM mapa_precio_m2_manzanas;

  INSERT INTO mapa_precio_m2_manzanas (manzana_id, operacion, moneda, propiedades, mediana_m2)
  SELECT
    m.id,
    CASE WHEN r.operation = 'rent' THEN 'Alquiler' ELSE 'Venta' END,
    r.currency::text,
    count(*)::integer,
    round(percentile_cont(0.5) WITHIN GROUP (ORDER BY r.price / r.area_m2)::numeric, 0)
  FROM roomix_properties r
  JOIN mapa_manzanas m
    ON ST_Contains(m.geom, ST_SetSRID(ST_MakePoint(r.lng, r.lat), 4326))
  WHERE r.is_active
    AND r.lat IS NOT NULL AND r.lng IS NOT NULL
    AND r.area_m2 >= 15
    AND r.price >= 1000
    AND r.currency IS NOT NULL
  GROUP BY m.id, 2, 3;
  -- Sin HAVING: alcanza con una propiedad. La cantidad viaja en `propiedades` y la
  -- pantalla la usa para mostrar el dato mas flojo con menos peso visual.

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- La cuadricula de respaldo sigue el mismo criterio, para que no digan cosas distintas.
CREATE OR REPLACE FUNCTION refrescar_precio_m2()
RETURNS TABLE (celdas integer, barrios integer)
LANGUAGE plpgsql
AS $$
DECLARE
  n_celdas  integer;
  n_barrios integer;
BEGIN
  DELETE FROM mapa_precio_m2_celdas;
  DELETE FROM mapa_precio_m2_barrios;

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

  INSERT INTO mapa_precio_m2_barrios
    (operacion, moneda, normalizado, nombre, propiedades, mediana_m2)
  SELECT b.operacion, b.moneda, b.normalizado,
         (SELECT g.barrio FROM _base g WHERE g.normalizado = b.normalizado
           GROUP BY g.barrio ORDER BY count(*) DESC, g.barrio LIMIT 1),
         count(*)::integer,
         round(percentile_cont(0.5) WITHIN GROUP (ORDER BY b.m2)::numeric, 0)
  FROM _base b
  WHERE b.normalizado IS NOT NULL AND b.normalizado <> ''
  GROUP BY b.operacion, b.moneda, b.normalizado;
  GET DIAGNOSTICS n_barrios = ROW_COUNT;

  RETURN QUERY SELECT n_celdas, n_barrios;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. La lista de trabajo: que baldosas le faltan al mapa
-- ─────────────────────────────────────────────────────────────────────────────

-- Sin esto, una baldosa rural donde OSM no tiene calles se pediria todas las noches para
-- siempre. Se anota cada intento y a la tercera se deja de insistir.
CREATE TABLE IF NOT EXISTS mapa_baldosas_intentos (
  zona      text PRIMARY KEY,
  intentos  integer NOT NULL DEFAULT 0,
  manzanas  integer NOT NULL DEFAULT 0,
  ultimo    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE mapa_baldosas_intentos ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION mapa_baldosas_pendientes(p_limit integer DEFAULT 20)
RETURNS TABLE (
  zona        text,
  sur         double precision,
  oeste       double precision,
  norte       double precision,
  este        double precision,
  propiedades integer
)
LANGUAGE sql
STABLE
AS $$
  WITH sueltas AS (
    SELECT
      floor(r.lat / 0.04)::int AS fy,
      floor(r.lng / 0.04)::int AS fx,
      count(*) AS n
    FROM roomix_properties r
    WHERE r.is_active
      AND r.lat IS NOT NULL AND r.lng IS NOT NULL
      AND r.area_m2 >= 15
      AND r.price >= 1000
      -- La propiedad no cae dentro de ninguna manzana ya trazada.
      AND NOT EXISTS (
        SELECT 1 FROM mapa_manzanas m
        WHERE m.geom && ST_SetSRID(ST_MakePoint(r.lng, r.lat), 4326)
          AND ST_Contains(m.geom, ST_SetSRID(ST_MakePoint(r.lng, r.lat), 4326))
      )
    GROUP BY 1, 2
  )
  SELECT
    'auto-' || s.fy || '-' || s.fx,
    s.fy * 0.04,
    s.fx * 0.04,
    (s.fy + 1) * 0.04,
    (s.fx + 1) * 0.04,
    s.n::integer
  FROM sueltas s
  LEFT JOIN mapa_baldosas_intentos i ON i.zona = 'auto-' || s.fy || '-' || s.fx
  WHERE coalesce(i.intentos, 0) < 3
  -- Primero donde hay mas propiedades esperando: es donde mas se nota.
  ORDER BY s.n DESC
  LIMIT p_limit
$$;

COMMENT ON FUNCTION mapa_baldosas_pendientes(integer) IS
  'Baldosas con propiedades que todavia no caen dentro de ninguna manzana trazada.';

SELECT refrescar_precio_m2_manzanas();

-- ─────────────────────────────────────────────────────────────────────────────
-- Correccion del mismo dia: la cola no se vaciaba.
--
-- La lista se arma con las propiedades que no caen dentro de ninguna manzana, y SIEMPRE
-- quedan algunas: una propiedad geocodificada sobre el eje de la calle cae en la calle,
-- no en la manzana. Con el filtro anterior, una baldosa ya trabajada volvia a la lista por
-- esos pocos casos y se pediria de nuevo todas las noches para siempre. Verificado: se
-- trazaron 2 baldosas (2.314 manzanas) y el total de pendientes siguio en 2.071.
--
-- Ahora una baldosa sale de la lista en cuanto produjo manzanas. Las que no produjeron
-- ninguna —zonas rurales sin trama en OSM— se reintentan hasta 3 veces por si OSM mejora.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION mapa_baldosas_pendientes(p_limit integer DEFAULT 20)
RETURNS TABLE (
  zona        text,
  sur         double precision,
  oeste       double precision,
  norte       double precision,
  este        double precision,
  propiedades integer
)
LANGUAGE sql
STABLE
AS $$
  WITH sueltas AS (
    SELECT
      floor(r.lat / 0.04)::int AS fy,
      floor(r.lng / 0.04)::int AS fx,
      count(*) AS n
    FROM roomix_properties r
    WHERE r.is_active
      AND r.lat IS NOT NULL AND r.lng IS NOT NULL
      AND r.area_m2 >= 15
      AND r.price >= 1000
      AND NOT EXISTS (
        SELECT 1 FROM mapa_manzanas m
        WHERE m.geom && ST_SetSRID(ST_MakePoint(r.lng, r.lat), 4326)
          AND ST_Contains(m.geom, ST_SetSRID(ST_MakePoint(r.lng, r.lat), 4326))
      )
    GROUP BY 1, 2
  )
  SELECT
    'auto-' || s.fy || '-' || s.fx,
    s.fy * 0.04, s.fx * 0.04, (s.fy + 1) * 0.04, (s.fx + 1) * 0.04,
    s.n::integer
  FROM sueltas s
  LEFT JOIN mapa_baldosas_intentos i ON i.zona = 'auto-' || s.fy || '-' || s.fx
  WHERE coalesce(i.manzanas, 0) = 0   -- ya trazada = fuera de la cola
    AND coalesce(i.intentos, 0) < 3   -- sin trama urbana = se insiste 3 veces y basta
    -- Tampoco se vuelven a pedir las baldosas cubiertas por una carga manual por zona
    -- (caba, zona-norte, la-plata...): ahi las manzanas existen aunque el nombre no sea
    -- 'auto-'. Si quedan propiedades sueltas es porque caen sobre la calle, no porque
    -- falte trazar.
    AND NOT EXISTS (
      SELECT 1 FROM mapa_manzanas m
      WHERE m.geom && ST_MakeEnvelope(s.fx * 0.04, s.fy * 0.04, (s.fx + 1) * 0.04, (s.fy + 1) * 0.04, 4326)
    )
  ORDER BY s.n DESC
  LIMIT p_limit
$$;
