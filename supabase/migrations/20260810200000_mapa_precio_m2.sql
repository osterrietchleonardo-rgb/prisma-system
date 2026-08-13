-- Mapa · Fase 2: precio por m2 pintado sobre el mapa y ranking de barrios.
--
-- POR QUE PRECALCULADO Y NO AL VUELO
-- Calcular la mediana de $/m2 por cuadricula mientras el usuario mueve el mapa es
-- inviable. Medido el 2026-08-10 sobre roomix_properties (74.413 activas):
--
--   un barrio (Belgrano)  ->   4.617 ms
--   CABA entera           ->  18.548 ms   <- pasa el limite de 16 s y se cancela sola
--
-- Precalculado, la consulta pasa a leer una tabla de miles de filas en vez de decenas de
-- miles, con indice espacial.
--
-- QUE ES UNA "MANZANA"
-- No existe como dato: ni la cartera ni la red traen la manzana, y no hay un padron de
-- manzanas cargado. Se aproxima con una cuadricula de 0,001 grados de latitud (~111 m)
-- por 0,0012 de longitud (~110 m a esta altura del planeta), que es el tamano tipico de
-- una manzana portena. No calza con las manzanas reales —una celda puede partir una
-- manzana o juntar media de la de al lado— pero a la vista da la misma lectura: donde el
-- metro vale mas y donde vale menos.
--
-- Medido sobre CABA con 56.207 propiedades utiles:
--   9.197 celdas, 4.819 con 3 o mas propiedades, que cubren el 89,7% de las propiedades.
--
-- POR QUE MEDIANA Y NO PROMEDIO
-- El promedio se lo lleva un penthouse: una sola propiedad cara corre el color de toda
-- la manzana. La mediana aguanta los extremos, que es justo lo que sobra en estos datos.
--
-- POR QUE UN MINIMO DE 3
-- Con una o dos propiedades el numero no dice nada del barrio, dice de esa propiedad.
-- Pintar eso seria inventar un dato de mercado.
--
-- LIMITE CONOCIDO
-- Se precalcula por operacion y moneda, NO por tipo ni por rango de precio. Los colores
-- muestran todo el mercado de esa operacion y moneda; no siguen los filtros de tipo ni
-- de precio de la pantalla. Hacerlo por tipo multiplicaria la tabla por cada combinacion
-- y el numero por celda se quedaria sin propiedades suficientes para tener sentido.

-- Superficie minima para creer el m2: por debajo de 15 m2 casi siempre es un dato mal
-- cargado (una cochera anotada como 1, un lote con la superficie del edificio).
-- El piso de precio es el mismo de precioCreible() en el codigo: ver lib/mapa/lugares.ts.

CREATE TABLE IF NOT EXISTS mapa_precio_m2_celdas (
  operacion    text NOT NULL,
  moneda       text NOT NULL,
  fy           integer NOT NULL,   -- floor(lat / 0.001)
  fx           integer NOT NULL,   -- floor(lng / 0.0012)
  propiedades  integer NOT NULL,
  mediana_m2   numeric NOT NULL,
  centro_lat   double precision NOT NULL,
  centro_lng   double precision NOT NULL,
  PRIMARY KEY (operacion, moneda, fy, fx)
);

CREATE TABLE IF NOT EXISTS mapa_precio_m2_barrios (
  operacion    text NOT NULL,
  moneda       text NOT NULL,
  normalizado  text NOT NULL,
  nombre       text NOT NULL,
  propiedades  integer NOT NULL,
  mediana_m2   numeric NOT NULL,
  PRIMARY KEY (operacion, moneda, normalizado)
);

ALTER TABLE mapa_precio_m2_celdas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE mapa_precio_m2_barrios ENABLE ROW LEVEL SECURITY;

-- El mismo patron que el indice de las propiedades: btree_gist deja mezclar el punto con
-- las columnas sueltas, asi que operacion y moneda filtran DENTRO del indice espacial en
-- vez de descartarse despues.
CREATE INDEX IF NOT EXISTS idx_precio_m2_celdas_geo
  ON mapa_precio_m2_celdas
  USING gist (point(centro_lng, centro_lat), operacion, moneda);

-- ─────────────────────────────────────────────────────────────────────────────
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

  -- Una sola pasada por la tabla grande: de ahi salen las dos agregaciones.
  CREATE TEMP TABLE _base ON COMMIT DROP AS
  SELECT
    CASE WHEN r.operation = 'rent' THEN 'Alquiler' ELSE 'Venta' END AS operacion,
    r.currency::text                                     AS moneda,
    lower(unaccent(btrim(r.neighborhood::text)))         AS normalizado,
    btrim(r.neighborhood::text)                          AS barrio,
    floor(r.lat / 0.001)::int                            AS fy,
    floor(r.lng / 0.0012)::int                           AS fx,
    r.price / r.area_m2                                  AS m2
  FROM roomix_properties r
  WHERE r.is_active
    AND r.lat IS NOT NULL AND r.lng IS NOT NULL
    AND r.area_m2 >= 15
    AND r.price >= 1000
    AND r.currency IS NOT NULL;

  INSERT INTO mapa_precio_m2_celdas
    (operacion, moneda, fy, fx, propiedades, mediana_m2, centro_lat, centro_lng)
  SELECT
    operacion, moneda, fy, fx,
    count(*)::integer,
    round(percentile_cont(0.5) WITHIN GROUP (ORDER BY m2)::numeric, 0),
    (fy + 0.5) * 0.001,
    (fx + 0.5) * 0.0012
  FROM _base
  GROUP BY operacion, moneda, fy, fx
  HAVING count(*) >= 3;
  GET DIAGNOSTICS n_celdas = ROW_COUNT;

  INSERT INTO mapa_precio_m2_barrios
    (operacion, moneda, normalizado, nombre, propiedades, mediana_m2)
  SELECT
    b.operacion, b.moneda, b.normalizado,
    -- La grafia mas usada, igual que en mapa_barrios.
    (SELECT g.barrio FROM _base g
      WHERE g.normalizado = b.normalizado
      GROUP BY g.barrio ORDER BY count(*) DESC, g.barrio LIMIT 1),
    count(*)::integer,
    round(percentile_cont(0.5) WITHIN GROUP (ORDER BY b.m2)::numeric, 0)
  FROM _base b
  WHERE b.normalizado IS NOT NULL AND b.normalizado <> ''
  GROUP BY b.operacion, b.moneda, b.normalizado
  HAVING count(*) >= 3;
  GET DIAGNOSTICS n_barrios = ROW_COUNT;

  RETURN QUERY SELECT n_celdas, n_barrios;
END;
$$;

COMMENT ON FUNCTION refrescar_precio_m2() IS
  'Rearma el mapa de calor de $/m2 y el ranking de barrios. Correr tras cada sync.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Lectura: las celdas del rectangulo visible.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION mapa_precio_m2(
  p_sur       double precision,
  p_oeste     double precision,
  p_norte     double precision,
  p_este      double precision,
  p_operacion text DEFAULT 'Venta',
  p_moneda    text DEFAULT 'USD',
  p_limit     integer DEFAULT 3000
)
RETURNS TABLE (
  sur double precision, oeste double precision, norte double precision, este double precision,
  mediana_m2 numeric, propiedades integer
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    c.fy * 0.001,
    c.fx * 0.0012,
    (c.fy + 1) * 0.001,
    (c.fx + 1) * 0.0012,
    c.mediana_m2,
    c.propiedades
  FROM mapa_precio_m2_celdas c
  WHERE c.operacion = p_operacion
    AND c.moneda = p_moneda
    AND point(c.centro_lng, c.centro_lat) <@ box(point(p_oeste, p_sur), point(p_este, p_norte))
  -- Si hay mas celdas que el tope, se quedan las que mas propiedades tienen: son las que
  -- mejor representan la zona.
  ORDER BY c.propiedades DESC
  LIMIT p_limit
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Lectura: el ranking de barrios, de mas caro a mas barato.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION mapa_ranking_barrios(
  p_sur       double precision,
  p_oeste     double precision,
  p_norte     double precision,
  p_este      double precision,
  p_operacion text DEFAULT 'Venta',
  p_moneda    text DEFAULT 'USD',
  p_limit     integer DEFAULT 40
)
RETURNS TABLE (nombre text, mediana_m2 numeric, propiedades integer)
LANGUAGE sql
STABLE
AS $$
  -- Solo los barrios que se ven en pantalla: un ranking del pais entero no le sirve a
  -- quien esta mirando Belgrano. Se cruza con mapa_barrios, que es quien sabe donde
  -- queda cada uno.
  SELECT p.nombre, p.mediana_m2, p.propiedades
  FROM mapa_precio_m2_barrios p
  JOIN mapa_barrios b ON b.normalizado = p.normalizado
  WHERE p.operacion = p_operacion
    AND p.moneda = p_moneda
    -- Se cuenta adentro si los recuadros se pisan, no si el barrio entra entero.
    AND b.oeste <= p_este AND b.este >= p_oeste
    AND b.sur   <= p_norte AND b.norte >= p_sur
  ORDER BY p.mediana_m2 DESC
  LIMIT p_limit
$$;

SELECT * FROM refrescar_precio_m2();
