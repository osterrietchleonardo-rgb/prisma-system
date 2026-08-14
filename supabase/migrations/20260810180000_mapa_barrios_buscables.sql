-- Mapa · buscador de lugares: catalogo de barrios con nombre normalizado.
--
-- POR QUE UNA TABLA APARTE Y NO BUSCAR DIRECTO
-- Buscar el barrio contra roomix_properties obliga a recorrer las 74.413 filas activas.
-- Medido el 2026-08-10 con ILIKE 'palerm%': Parallel Seq Scan, 2.345 ms. Para algo que
-- responde mientras el usuario tipea eso es inservible. El catalogo tiene ~2.000 filas
-- (una por barrio), asi que la misma busqueda —incluso difusa— pasa a ser instantanea.
--
-- POR QUE SOLO LA RED DE COLABORACION
-- La cartera propia (properties) esta separada POR AGENCIA: mapa_cartera filtra por
-- p_agency_id. Un catalogo global que la incluyera dejaria ver a cada inmobiliaria en
-- que barrios —y con cuantas propiedades— trabajan las demas. La red de colaboracion es
-- compartida por definicion, asi que ahi no hay filtracion. Los barrios de la cartera
-- propia se buscan en el momento, filtrados por agencia: son 636 filas y no cuestan nada.
--
-- POR QUE `normalizado` COMO CLAVE
-- Las dos fuentes escriben distinto el mismo barrio: la cartera dice "Nuñez" y la red
-- dice "Núñez". Sin normalizar, buscar "Nuñez" devuelve la mitad. La clave es el nombre
-- sin acentos y en minusculas; `nombre` guarda la grafia mas usada, que es la que se
-- muestra.

CREATE EXTENSION IF NOT EXISTS unaccent;  -- "Núñez" -> "nunez"
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- tolerancia a errores de tipeo

CREATE TABLE IF NOT EXISTS mapa_barrios (
  normalizado    text PRIMARY KEY,
  nombre         text NOT NULL,
  cantidad       integer NOT NULL,
  -- Recuadro que abarca todas las propiedades del barrio: es adonde vuela el mapa.
  sur            double precision NOT NULL,
  oeste          double precision NOT NULL,
  norte          double precision NOT NULL,
  este           double precision NOT NULL,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

-- Indice de trigramas: sirve para el prefijo (LIKE 'palerm%') y para el parecido (%).
CREATE INDEX IF NOT EXISTS idx_mapa_barrios_trgm
  ON mapa_barrios USING gin (normalizado gin_trgm_ops);

-- Catalogo de la red compartida, sin datos de ninguna agencia: aun asi se cierra por RLS
-- y se lee solo con la clave de servicio, como el resto de las tablas del mapa.
ALTER TABLE mapa_barrios ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rearmado del catalogo. Se corre despues de cada sync de la red.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION refrescar_mapa_barrios()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  filas integer;
BEGIN
  -- DELETE y no TRUNCATE: TRUNCATE toma un lock exclusivo y dejaria al buscador sin
  -- responder mientras dura. Este catalogo es chico, el DELETE no se nota.
  DELETE FROM mapa_barrios;

  INSERT INTO mapa_barrios (normalizado, nombre, cantidad, sur, oeste, norte, este)
  WITH normalizados AS (
    SELECT
      lower(unaccent(btrim(r.neighborhood::text))) AS normalizado,
      btrim(r.neighborhood::text)                  AS nombre,
      r.lat,
      r.lng
    FROM roomix_properties r
    WHERE r.is_active
      AND r.neighborhood IS NOT NULL
      AND btrim(r.neighborhood::text) <> ''
      AND r.lat IS NOT NULL
      AND r.lng IS NOT NULL
  ),
  -- De todas las grafias del mismo barrio se muestra la mas usada.
  grafia_elegida AS (
    SELECT DISTINCT ON (normalizado) normalizado, nombre
    FROM (SELECT normalizado, nombre, count(*) AS veces FROM normalizados GROUP BY 1, 2) g
    ORDER BY normalizado, veces DESC, nombre
  )
  SELECT
    n.normalizado,
    g.nombre,
    count(*)::integer,
    min(n.lat),
    min(n.lng),
    max(n.lat),
    max(n.lng)
  FROM normalizados n
  JOIN grafia_elegida g USING (normalizado)
  GROUP BY n.normalizado, g.nombre;

  GET DIAGNOSTICS filas = ROW_COUNT;
  RETURN filas;
END;
$$;

COMMENT ON FUNCTION refrescar_mapa_barrios() IS
  'Rearma el catalogo de barrios del mapa desde roomix_properties. Correr tras cada sync.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Busqueda: prefijo primero, parecido despues (para los errores de tipeo).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION mapa_buscar_barrios(p_q text, p_limit integer DEFAULT 6)
RETURNS TABLE (
  nombre   text,
  cantidad integer,
  sur      double precision,
  oeste    double precision,
  norte    double precision,
  este     double precision,
  parecido real
)
LANGUAGE sql
STABLE
AS $$
  WITH consulta AS (
    SELECT lower(unaccent(btrim(coalesce(p_q, '')))) AS texto
  )
  SELECT
    b.nombre,
    b.cantidad,
    b.sur,
    b.oeste,
    b.norte,
    b.este,
    -- Lo que empieza igual gana siempre: quien escribe "palerm" busca Palermo, no un
    -- barrio parecido. El parecido queda para "cavallito" o "nuniez".
    (CASE WHEN b.normalizado LIKE c.texto || '%' THEN 1.0
          ELSE similarity(b.normalizado, c.texto) END)::real AS parecido
  FROM mapa_barrios b, consulta c
  WHERE c.texto <> ''
    AND (b.normalizado LIKE c.texto || '%' OR b.normalizado % c.texto)
  ORDER BY parecido DESC, b.cantidad DESC
  LIMIT greatest(coalesce(p_limit, 6), 1)
$$;

COMMENT ON FUNCTION mapa_buscar_barrios(text, integer) IS
  'Busca barrios sin importar acentos ni errores de tipeo. Devuelve el recuadro adonde volar.';

SELECT refrescar_mapa_barrios();
