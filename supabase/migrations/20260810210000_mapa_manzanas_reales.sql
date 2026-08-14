-- Mapa · manzanas REALES, derivadas del grafo de calles de OpenStreetMap.
--
-- POR QUE NO ALCANZABA LA CUADRICULA
-- La version anterior pintaba cuadrados de ~110 m. Se ve parecido de lejos, pero comete
-- el error que invalida el dato: corta manzanas al medio y junta las dos veredas de una
-- avenida en la misma celda. La calle es un limite de mercado real —la vereda de enfrente
-- de Cabildo es otro precio— y un cuadrado no lo sabe. Es la misma objecion que se le
-- hace a los hexagonos de H3, y aplicaba igual a la cuadricula.
--
-- COMO SE ARMA LA MANZANA
-- La manzana es, geometricamente, el poligono que encierran las calles. Se bajan las
-- calles de OSM (Overpass), se las cruza entre si (ST_Node) y se cierran los poligonos
-- (ST_Polygonize). No hace falta catastro ni padron.
--
-- Verificado sobre Belgrano el 2026-08-10 (1.345 calles de OSM):
--   826 poligonos, 782 con tamano de manzana, MEDIANA 12.943 m2.
--   Una manzana portena estandar es 110 x 110 = 12.100 m2.
--
-- POR QUE ESTE CAMINO Y NO EL CATASTRO OFICIAL
-- El SMP (Circunscripcion-Seccion-Manzana-Parcela) existe en CABA via USIG y en provincia
-- via ARBA, pero son tres implementaciones distintas y ninguna sirve fuera de Argentina.
-- La manzana geometrica se arma igual en Belgrano, en Lomas y en Miraflores. El SMP queda
-- como campo opcional para el dia que haya que cruzar con partida inmobiliaria.
--
-- QUE PASA DONDE TODAVIA NO HAY MANZANAS CARGADAS
-- Nada se rompe: mapa_precio_m2_celdas (la cuadricula) sigue viva y es lo que se muestra
-- donde no hay manzanas. Se van cargando por zona.

CREATE TABLE IF NOT EXISTS mapa_manzanas (
  id          bigserial PRIMARY KEY,
  geom        geometry(Polygon, 4326) NOT NULL,
  area_m2     double precision NOT NULL,
  -- De que tanda de carga vino, para poder recargar una zona sin tocar las demas.
  zona        text NOT NULL,
  creada_en   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mapa_manzanas_geom ON mapa_manzanas USING gist (geom);
CREATE INDEX IF NOT EXISTS idx_mapa_manzanas_zona ON mapa_manzanas (zona);
ALTER TABLE mapa_manzanas ENABLE ROW LEVEL SECURITY;

-- El precio por m2 agregado POR MANZANA, con la misma forma que la tabla de celdas.
CREATE TABLE IF NOT EXISTS mapa_precio_m2_manzanas (
  manzana_id  bigint NOT NULL REFERENCES mapa_manzanas(id) ON DELETE CASCADE,
  operacion   text NOT NULL,
  moneda      text NOT NULL,
  propiedades integer NOT NULL,
  mediana_m2  numeric NOT NULL,
  PRIMARY KEY (manzana_id, operacion, moneda)
);
ALTER TABLE mapa_precio_m2_manzanas ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- Cerrar las manzanas de una tanda de calles recien cargadas.
--
-- Se trabaja por zona con un margen: las calles se bajan con un borde de mas y despues se
-- descartan las manzanas cuyo centro cae fuera del recuadro pedido. Sin ese margen, las
-- manzanas del borde quedan abiertas (les falta la calle del otro lado) y ST_Polygonize
-- las funde en un poligono gigante.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION armar_manzanas(
  p_zona   text,
  p_sur    double precision,
  p_oeste  double precision,
  p_norte  double precision,
  p_este   double precision
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  n integer;
BEGIN
  DELETE FROM mapa_manzanas WHERE zona = p_zona;

  INSERT INTO mapa_manzanas (geom, area_m2, zona)
  SELECT geom, area_m2, p_zona
  FROM (
    SELECT
      p.geom,
      ST_Area(p.geom::geography) AS area_m2
    FROM (
      SELECT (ST_Dump(ST_Polygonize(r.geom))).geom AS geom
      FROM (SELECT ST_Node(ST_Collect(c.geom)) AS geom FROM _calles_cargadas c) r
    ) p
    WHERE ST_Within(ST_Centroid(p.geom), ST_MakeEnvelope(p_oeste, p_sur, p_este, p_norte, 4326))
  ) q
  -- 300 m2 saca las esquirlas que dejan dos calles que casi se tocan (canteros, rampas).
  -- 200.000 m2 saca los poligonos que no son manzanas: parques grandes, playas de
  -- maniobras, y el contorno exterior de la zona cuando queda cerrado.
  WHERE area_m2 BETWEEN 300 AND 200000;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Precio por m2 de cada manzana. Cada propiedad cae en la manzana que la contiene.
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
  GROUP BY m.id, 2, 3
  -- El mismo minimo que la cuadricula: con una o dos propiedades el numero habla de esa
  -- propiedad, no de la manzana.
  HAVING count(*) >= 3;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Lectura: las manzanas del rectangulo visible, ya con su color listo para pintar.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION mapa_precio_m2_por_manzana(
  p_sur       double precision,
  p_oeste     double precision,
  p_norte     double precision,
  p_este      double precision,
  p_operacion text DEFAULT 'Venta',
  p_moneda    text DEFAULT 'USD',
  p_limit     integer DEFAULT 1500
)
RETURNS TABLE (
  id bigint,
  contorno jsonb,
  mediana_m2 numeric,
  propiedades integer
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    m.id,
    -- Se manda el contorno como lista de pares [lat, lng], que es lo que come Leaflet sin
    -- traducciones intermedias.
    (SELECT jsonb_agg(jsonb_build_array(ST_Y(p.geom), ST_X(p.geom)) ORDER BY p.n)
       FROM ST_DumpPoints(ST_ExteriorRing(m.geom)) WITH ORDINALITY AS p(path, geom, n)) AS contorno,
    pm.mediana_m2,
    pm.propiedades
  FROM mapa_manzanas m
  JOIN mapa_precio_m2_manzanas pm
    ON pm.manzana_id = m.id AND pm.operacion = p_operacion AND pm.moneda = p_moneda
  WHERE m.geom && ST_MakeEnvelope(p_oeste, p_sur, p_este, p_norte, 4326)
  ORDER BY pm.propiedades DESC
  LIMIT p_limit
$$;
