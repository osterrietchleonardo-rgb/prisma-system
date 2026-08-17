-- Mapa · buscar un barrio tiene que LLEVARTE al barrio.
--
-- ─────────────────────────────── EL SINTOMA ───────────────────────────────
-- Buscar "Belgrano" no acercaba a Belgrano: el mapa se abria sobre 181 x 207 km, de
-- Rosario a la provincia de Buenos Aires. El filtro por barrio si aplicaba, asi que en
-- pantalla quedaban las propiedades correctas desparramadas en un mapa del tamaño de
-- media Argentina, y el usuario leia "el buscador no anda".
--
-- ─────────────────────────────── LA CAUSA ───────────────────────────────
-- El catalogo agrupa por NOMBRE normalizado, y en Argentina el mismo nombre de barrio
-- existe en muchas ciudades. Contadas el 2026-08-15, las 6.723 propiedades activas cuyo
-- barrio se llama "Belgrano":
--
--   Capital Federal  6.612      Rio Negro (Bariloche)  19
--   Santa Fe (Rosario)  64      Cordoba (Carlos Paz)    9      Mendoza  2
--
-- El recuadro se armaba con los percentiles 1 y 99 (migracion 20260810190000), que sacan
-- los puntos sueltos mal geolocalizados pero NO un pueblo entero a 300 km: los de afuera
-- son el 2,9%, o sea que el percentil 99 cae adentro de Rosario. La proteccion estaba
-- calibrada para ruido, no para homonimos.
--
-- No era el caso raro de un barrio: 446 de los 2.647 del catalogo tenian el recuadro
-- reventado (17%) y 268 pasaban los 100 km de lado. "Centro" —5.372 propiedades, el
-- nombre mas repetido del pais— medía 1.089 x 1.388 km.
--
-- ─────────────────────────────── EL ARREGLO ───────────────────────────────
-- Antes de medir se elige DE QUE Belgrano estamos hablando: se cuentan las propiedades
-- por celda de ~5 km, se toma la celda mas poblada (el nucleo) y se descarta todo lo que
-- este a mas de 0,1 grados —unos 10 km— de ahi. Recien sobre eso se aplican los
-- percentiles de siempre, que siguen haciendo su trabajo con el ruido de adentro.
--
-- Se elige la celda mas poblada y NO la mediana: la mediana de dos ciudades con la misma
-- cantidad de avisos cae en el campo entre las dos, y ahi el recuadro no encierra nada.
-- La moda siempre cae sobre propiedades de verdad.
--
-- Medido con los datos reales:
--
--   Belgrano          181 x 207 km  ->  2,7 x 3,3 km   (queda en CABA)
--   Centro          1.089 x 1.388 km ->  3,2 x 4,7 km   (queda en Rosario, el mas grande)
--   Costa Esmeralda 4.492 x 1.527 km ->  3,0 x 3,9 km   (queda en Pinamar)
--   Crisol          6.927 x 5.120 km ->  5,1 x 1,0 km   (queda en Cordoba)
--   Palermo                          ->  3,9 x 4,2 km
--
-- ─────────────────────── Y SE DICE DE QUE CIUDAD ES ───────────────────────
-- Elegir el nucleo no borra la ambiguedad, la resuelve en silencio: quien busca "Centro"
-- aterriza en Rosario sin enterarse. Por eso el catalogo guarda ademas `donde` —la
-- provincia o ciudad donde esta ese nucleo— y la sugerencia lo muestra al lado del
-- numero: "6.615 propiedades · Capital Federal".
--
-- `cantidad` pasa a contar SOLO el nucleo. Prometia 6.625 y el mapa mostraba 6.615: el
-- numero de la sugerencia tiene que ser el que se va a ver al aterrizar.

ALTER TABLE mapa_barrios ADD COLUMN IF NOT EXISTS donde text;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. El catalogo de la red
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION refrescar_mapa_barrios()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  filas integer;
BEGIN
  DELETE FROM mapa_barrios;

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
  RETURN filas;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. La sugerencia devuelve tambien de que ciudad es
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS mapa_buscar_barrios(text, integer);

CREATE FUNCTION mapa_buscar_barrios(p_q text, p_limit integer DEFAULT 6)
RETURNS TABLE (
  nombre   text,
  cantidad integer,
  sur      double precision,
  oeste    double precision,
  norte    double precision,
  este     double precision,
  parecido real,
  donde    text
)
LANGUAGE sql
STABLE
AS $function$
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
          ELSE similarity(b.normalizado, c.texto) END)::real AS parecido,
    b.donde
  FROM mapa_barrios b, consulta c
  WHERE c.texto <> ''
    AND (b.normalizado LIKE c.texto || '%' OR b.normalizado % c.texto)
  ORDER BY parecido DESC, b.cantidad DESC
  LIMIT greatest(coalesce(p_limit, 6), 1)
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Los barrios de la cartera propia, con el mismo criterio
-- ─────────────────────────────────────────────────────────────────────────────
-- Aca el riesgo es menor —una inmobiliaria suele trabajar una sola zona— pero el defecto
-- es identico: alcanza UNA propiedad cargada en otra provincia para estirar el recuadro.
CREATE OR REPLACE FUNCTION mapa_buscar_barrios_cartera(
  p_agency_id uuid,
  p_q         text,
  p_limit     integer DEFAULT 4
)
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
  ),
  mios AS (
    SELECT
      lower(unaccent(btrim(p.city))) AS normalizado,
      btrim(p.city)                  AS nombre,
      p.lat,
      p.lng
    FROM properties p
    WHERE p.is_active
      AND p.agency_id = p_agency_id
      AND p.city IS NOT NULL
      AND btrim(p.city) <> ''
      AND p.lat IS NOT NULL
      AND p.lng IS NOT NULL
  ),
  celdas AS (
    SELECT normalizado,
           round(lat / 0.05) * 0.05 AS clat,
           round(lng / 0.05) * 0.05 AS clng,
           count(*) AS n
    FROM mios
    GROUP BY 1, 2, 3
  ),
  nucleo AS (
    SELECT DISTINCT ON (normalizado) normalizado, clat, clng
    FROM celdas
    ORDER BY normalizado, n DESC, clat, clng
  ),
  del_nucleo AS (
    SELECT m.*
    FROM mios m
    JOIN nucleo c USING (normalizado)
    WHERE abs(m.lat - c.clat) <= 0.1
      AND abs(m.lng - c.clng) <= 0.1
  )
  SELECT
    d.nombre,
    count(*)::integer,
    percentile_cont(0.01) WITHIN GROUP (ORDER BY d.lat),
    percentile_cont(0.01) WITHIN GROUP (ORDER BY d.lng),
    percentile_cont(0.99) WITHIN GROUP (ORDER BY d.lat),
    percentile_cont(0.99) WITHIN GROUP (ORDER BY d.lng),
    max(CASE WHEN d.normalizado LIKE c.texto || '%' THEN 1.0
             ELSE similarity(d.normalizado, c.texto) END)::real AS parecido
  FROM del_nucleo d, consulta c
  WHERE c.texto <> ''
    AND (d.normalizado LIKE c.texto || '%' OR d.normalizado % c.texto)
  GROUP BY d.nombre
  ORDER BY parecido DESC, count(*) DESC
  LIMIT greatest(coalesce(p_limit, 4), 1)
$$;

SELECT refrescar_mapa_barrios();
