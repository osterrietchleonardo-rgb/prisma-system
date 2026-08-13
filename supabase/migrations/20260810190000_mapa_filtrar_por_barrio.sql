-- Mapa · elegir un barrio tiene que FILTRAR, no solo acercar. Y acercar bien.
--
-- ─────────────────────────── PROBLEMA 1: el recuadro ───────────────────────────
-- El recuadro de cada barrio se guardaba con min()/max() de las coordenadas, asi que UNA
-- sola propiedad mal geolocalizada lo estiraba entero. Medido el 2026-08-10:
--
--   Belgrano  ->  11.939 x 1.079 km     Palermo  ->  3.745 x 11.866 km
--
-- Buscar "Belgrano" mandaba el mapa a un recuadro del tamano de medio continente, y por
-- eso aparecian propiedades de cualquier lado. Ahora el recuadro se arma con los
-- percentiles 1 y 99, que descartan los puntos sueltos sin comerse el barrio:
--
--   Belgrano  ->  3,6 x 2,9 km     Palermo  ->  4,4 x 3,9 km     Núñez -> 2,6 x 2,8 km
--
-- Con el percentil 5 quedaba 2,5 x 2,0 km: mas prolijo pero ya recorta manzanas reales.
--
-- ─────────────────────────── PROBLEMA 2: no filtraba ───────────────────────────
-- Acercarse al barrio no alcanza: en el borde entran las propiedades de los barrios
-- vecinos, y quien busco "Belgrano" quiere Belgrano. Las dos funciones del mapa reciben
-- ahora p_barrio (el nombre YA normalizado: minusculas y sin acentos, igual que
-- mapa_barrios.normalizado) y comparan contra el campo normalizado al vuelo.
--
-- Se comparan normalizados de los dos lados a proposito: la cartera escribe "Nuñez" y la
-- red "Núñez", y un igual crudo devolveria la mitad.
--
-- Hay que DROP y volver a crear porque cambia la firma: CREATE OR REPLACE no puede
-- agregar parametros.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Recuadros robustos en el catalogo
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION refrescar_mapa_barrios()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  filas integer;
BEGIN
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
  grafia_elegida AS (
    SELECT DISTINCT ON (normalizado) normalizado, nombre
    FROM (SELECT normalizado, nombre, count(*) AS veces FROM normalizados GROUP BY 1, 2) g
    ORDER BY normalizado, veces DESC, nombre
  )
  SELECT
    n.normalizado,
    g.nombre,
    count(*)::integer,
    percentile_cont(0.01) WITHIN GROUP (ORDER BY n.lat),
    percentile_cont(0.01) WITHIN GROUP (ORDER BY n.lng),
    percentile_cont(0.99) WITHIN GROUP (ORDER BY n.lat),
    percentile_cont(0.99) WITHIN GROUP (ORDER BY n.lng)
  FROM normalizados n
  JOIN grafia_elegida g USING (normalizado)
  GROUP BY n.normalizado, g.nombre;

  GET DIAGNOSTICS filas = ROW_COUNT;
  RETURN filas;
END;
$$;

-- El mismo recorte para los barrios de la cartera propia.
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
  )
  SELECT
    m.nombre,
    count(*)::integer,
    percentile_cont(0.01) WITHIN GROUP (ORDER BY m.lat),
    percentile_cont(0.01) WITHIN GROUP (ORDER BY m.lng),
    percentile_cont(0.99) WITHIN GROUP (ORDER BY m.lat),
    percentile_cont(0.99) WITHIN GROUP (ORDER BY m.lng),
    max(CASE WHEN m.normalizado LIKE c.texto || '%' THEN 1.0
             ELSE similarity(m.normalizado, c.texto) END)::real AS parecido
  FROM mios m, consulta c
  WHERE c.texto <> ''
    AND (m.normalizado LIKE c.texto || '%' OR m.normalizado % c.texto)
  GROUP BY m.nombre
  ORDER BY parecido DESC, count(*) DESC
  LIMIT greatest(coalesce(p_limit, 4), 1)
$$;

SELECT refrescar_mapa_barrios();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Filtro por barrio en las dos consultas del mapa
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS mapa_cartera(uuid, double precision, double precision, double precision, double precision, text, text[], numeric, numeric, text, integer, integer);

CREATE FUNCTION mapa_cartera(
  p_agency_id     uuid,
  p_sur           double precision,
  p_oeste         double precision,
  p_norte         double precision,
  p_este          double precision,
  p_operacion     text    DEFAULT NULL,
  p_tipos         text[]  DEFAULT NULL,
  p_precio_min    numeric DEFAULT NULL,
  p_precio_max    numeric DEFAULT NULL,
  p_moneda        text    DEFAULT NULL,
  p_ambientes_min integer DEFAULT NULL,
  p_limit         integer DEFAULT 1000,
  p_barrio        text    DEFAULT NULL
)
RETURNS TABLE (
  ref text, title text, price numeric, currency text, property_type text, status text,
  bedrooms integer, bathrooms integer, total_area numeric, address text, city text,
  foto text, lat double precision, lng double precision, assigned_agent_id uuid,
  agent_name text, agent_email text, agencia_nombre text, canonical_url text
)
LANGUAGE sql
STABLE
AS $function$
  SELECT
    p.id::text, p.title, p.price, p.currency, p.property_type, p.status,
    p.bedrooms, p.bathrooms, p.total_area, p.address, p.city,
    p.images->>0, p.lat, p.lng, p.assigned_agent_id,
    COALESCE(pr.full_name, p.assigned_agent->>'name',  'Sin asignar'),
    COALESCE(pr.email,     p.assigned_agent->>'email', ''),
    NULL::text,
    NULL::text
  FROM properties p
  LEFT JOIN profiles pr ON pr.id = p.assigned_agent_id
  WHERE p.is_active
    AND p.agency_id = p_agency_id
    AND p.lat IS NOT NULL AND p.lng IS NOT NULL
    AND point(p.lng, p.lat) <@ box(point(p_oeste, p_sur), point(p_este, p_norte))
    -- "Alquiler" tiene que incluir tambien "Temporary rent", que existe en la cartera.
    AND (p_operacion IS NULL
         OR (p_operacion = 'Venta'    AND p.status =  'Venta')
         OR (p_operacion = 'Alquiler' AND p.status <> 'Venta'))
    AND (p_tipos         IS NULL OR p.property_type = ANY(p_tipos))
    AND (p_moneda        IS NULL OR p.currency      = p_moneda)
    AND (p_precio_min    IS NULL OR p.price >= p_precio_min)
    AND (p_precio_max    IS NULL OR p.price <= p_precio_max)
    AND (p_ambientes_min IS NULL OR COALESCE(p.bedrooms, 0) >= p_ambientes_min)
    -- En la cartera el barrio vive en `city` (dice "Belgrano", no "Buenos Aires").
    AND (p_barrio IS NULL OR lower(unaccent(btrim(coalesce(p.city, '')))) = p_barrio)
  LIMIT p_limit
$function$;

DROP FUNCTION IF EXISTS mapa_colaboracion(double precision, double precision, double precision, double precision, text, text[], numeric, numeric, text, integer, integer);

CREATE FUNCTION mapa_colaboracion(
  p_sur           double precision,
  p_oeste         double precision,
  p_norte         double precision,
  p_este          double precision,
  p_operacion     text    DEFAULT NULL,
  p_tipos         text[]  DEFAULT NULL,
  p_precio_min    numeric DEFAULT NULL,
  p_precio_max    numeric DEFAULT NULL,
  p_moneda        text    DEFAULT NULL,
  p_ambientes_min integer DEFAULT NULL,
  p_limit         integer DEFAULT 1000,
  p_barrio        text    DEFAULT NULL
)
RETURNS TABLE (
  ref text, title text, price numeric, currency text, property_type text, status text,
  bedrooms integer, bathrooms integer, total_area numeric, address text, city text,
  foto text, lat double precision, lng double precision, assigned_agent_id uuid,
  agent_name text, agent_email text, agencia_nombre text, canonical_url text
)
LANGUAGE sql
STABLE
AS $function$
  SELECT
    r.slug::text, r.title, r.price, r.currency::text, r.property_type::text,
    CASE WHEN r.operation = 'rent' THEN 'Alquiler' ELSE 'Venta' END,
    COALESCE(r.bedrooms, r.rooms), r.bathrooms, r.area_m2,
    COALESCE(r.address, r.neighborhood::text, ''),
    r.neighborhood::text,
    r.images[1], r.lat, r.lng,
    NULL::uuid, ''::text, ''::text,
    COALESCE(r.roomix_agency_name::text, 'Inmobiliaria colaboradora'),
    r.canonical_url
  FROM roomix_properties r
  WHERE r.is_active
    AND r.lat IS NOT NULL AND r.lng IS NOT NULL
    AND point(r.lng, r.lat) <@ box(point(p_oeste, p_sur), point(p_este, p_norte))
    AND (p_operacion IS NULL
         OR (p_operacion = 'Venta'    AND r.operation = 'sale')
         OR (p_operacion = 'Alquiler' AND r.operation = 'rent'))
    AND (p_tipos         IS NULL OR r.property_type::text = ANY(p_tipos))
    AND (p_moneda        IS NULL OR r.currency      = p_moneda)
    AND (p_precio_min    IS NULL OR r.price >= p_precio_min)
    AND (p_precio_max    IS NULL OR r.price <= p_precio_max)
    AND (p_ambientes_min IS NULL OR COALESCE(r.rooms, r.bedrooms, 0) >= p_ambientes_min)
    AND (p_barrio IS NULL OR lower(unaccent(btrim(coalesce(r.neighborhood::text, '')))) = p_barrio)
  LIMIT p_limit
$function$;
