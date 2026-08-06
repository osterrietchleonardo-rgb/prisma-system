-- Mapa del Buscador IA · el filtro por tipo devolvia "canceling statement due to
-- statement timeout". Dos causas encadenadas, las dos arregladas aca.
--
-- CAUSA 1 · EL DESPLEGABLE OFRECIA TIPOS QUE NO EXISTEN
-- Mostraba "Departamento, Casa, PH, Lote, Oficina, Local Comercial, Cochera, Galpon".
-- Ninguno de esos valores existe en roomix_properties, que solo guarda tres
-- (contados el 2026-08-06 sobre las 74.413 activas):
--     Apartment 51.343 · House 11.357 · Accommodation 11.193
-- La cartera propia tiene otra taxonomia distinta:
--     Departamento 278 · Casa 84 · Lote 49 · Condo 19 · Bussiness Premises 11 ·
--     Oficina 7 · Hotel 3 · Weekend House 3 · Garage 3 · Warehouse 1 ·
--     Commercial Building 1
-- Al no coincidir NADA, el LIMIT no se llenaba nunca y Postgres tenia que recorrer el
-- rectangulo entero antes de poder contestar "no hay":
--     57.921 filas descartadas por filtro, 28.186 bloques de heap (~225 MB) de disco.
-- Medido: 16.439 ms. El statement timeout lo cortaba antes de terminar.
-- El mapeo etiqueta -> valores reales vive en lib/mapa/tipos-propiedad.ts.
--
-- CAUSA 2 · EL MISMO DERRUMBE PASA CON UN VALOR CORRECTO
-- No alcanza con arreglar las etiquetas. Con "Apartment" (que si existe) mas un rango
-- de precio poco poblado, el LIMIT tampoco se llena y vuelve a leer todo el rectangulo:
--     Apartment + venta + USD + hasta US$30.000  ->  16.978 ms para devolver 69 filas.
-- Mientras el LIMIT no se llene, leer el rectangulo completo es la unica salida posible.
--
-- EL ARREGLO · METER LOS FILTROS DENTRO DEL INDICE
-- La tabla pesa 2,2 GB (160.950 filas, con descripciones y arrays de imagenes), asi que
-- lo caro no es decidir, es TOCAR la tabla. Un GiST compuesto con btree_gist permite
-- descartar por operacion/tipo/moneda/precio sin bajar al heap.
--
-- Medido el 2026-08-06 sobre el rectangulo de CABA (57.921 propiedades adentro),
-- tres corridas seguidas de cada caso — la primera con cache frio, las otras dos tibio:
--
--   caso                          ANTES        DESPUES (frio / tibio)
--   sin filtros                     169 ms       600 / 19 / 19 ms
--   tipo sin coincidencias       16.439 ms       405 / 13 / 11 ms
--   Apartment + venta + USD         159 ms       249 / 37 / 36 ms
--   Apartment + hasta US$30.000  16.978 ms        70 / 25 / 25 ms
--   Accommodation + venta            37 ms       617 /  7 /  7 ms
--
-- Los dos casos que timeouteaban bajaron de ~17 segundos a decimas de segundo. En
-- cache tibio —que es como se usa de verdad, moviendo el mapa— ninguno pasa de 37 ms.
-- El indice ocupa 11 MB.
--
-- La cartera propia no lleva indice equivalente: son 459 filas activas, la tabla entera
-- entra en memoria y cualquier plan la resuelve al instante.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_roomix_geo_filtros
  ON roomix_properties
  USING gist (point(lng, lat), operation, property_type, currency, price)
  WHERE is_active;

-- ───────────────────────────────────────────────────────────────────────────────
-- Las funciones pasan a recibir una LISTA de tipos en vez de uno solo: una etiqueta
-- de pantalla puede tapar varios valores de la base ("Departamento" son Departamento
-- y Condo en la cartera; "Comercial y otros" son seis valores distintos).
-- Verificado que  = ANY(array)  usa el indice igual que  =  (Index Cond, no Filter).
--
-- NULL  = sin filtro de tipo.
-- Lista vacia = esa fuente no distingue el tipo elegido; el que llama NI CONSULTA,
-- porque la base tendria que recorrer todo el rectangulo para devolver cero.
-- ───────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS mapa_cartera(uuid, double precision, double precision, double precision, double precision, text, text, numeric, numeric, text, integer, integer);
DROP FUNCTION IF EXISTS mapa_colaboracion(double precision, double precision, double precision, double precision, text, text, numeric, numeric, text, integer, integer);

CREATE OR REPLACE FUNCTION mapa_cartera(
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
  p_limit         integer DEFAULT 1000
)
RETURNS TABLE (
  ref               text,
  title             text,
  price             numeric,
  currency          text,
  property_type     text,
  status            text,
  bedrooms          integer,
  bathrooms         integer,
  total_area        numeric,
  address           text,
  city              text,
  foto              text,
  lat               double precision,
  lng               double precision,
  assigned_agent_id uuid,
  agent_name        text,
  agent_email       text,
  agencia_nombre    text,
  canonical_url     text
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    p.id::text,
    p.title,
    p.price,
    p.currency,
    p.property_type,
    p.status,
    p.bedrooms,
    p.bathrooms,
    p.total_area,
    p.address,
    p.city,
    p.images->>0,
    p.lat,
    p.lng,
    p.assigned_agent_id,
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
  LIMIT p_limit
$$;

CREATE OR REPLACE FUNCTION mapa_colaboracion(
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
  p_limit         integer DEFAULT 1000
)
RETURNS TABLE (
  ref               text,
  title             text,
  price             numeric,
  currency          text,
  property_type     text,
  status            text,
  bedrooms          integer,
  bathrooms         integer,
  total_area        numeric,
  address           text,
  city              text,
  foto              text,
  lat               double precision,
  lng               double precision,
  assigned_agent_id uuid,
  agent_name        text,
  agent_email       text,
  agencia_nombre    text,
  canonical_url     text
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    r.slug::text,
    r.title,
    r.price,
    r.currency::text,
    r.property_type::text,
    CASE WHEN r.operation = 'rent' THEN 'Alquiler' ELSE 'Venta' END,
    COALESCE(r.bedrooms, r.rooms),
    r.bathrooms,
    r.area_m2,
    COALESCE(r.address, r.neighborhood::text, ''),
    r.neighborhood::text,
    r.images[1],
    r.lat,
    r.lng,
    NULL::uuid,
    ''::text,
    ''::text,
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
  LIMIT p_limit
$$;
