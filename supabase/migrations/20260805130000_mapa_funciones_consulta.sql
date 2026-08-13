-- Mapa del Buscador IA · funciones de consulta por rectangulo visible.
--
-- POR QUE FUNCIONES Y NO EL CLIENTE DE SUPABASE
-- El indice espacial solo se usa con el operador  point(lng,lat) <@ box(...)  , que
-- PostgREST no sabe expresar. Con BETWEEN el planificador hace Seq Scan y la consulta
-- pasa de 10 ms a mas de 1.000 ms. Es el mismo patron que ya usan el ACM
-- (acm_match_roomix) y el chat (match_roomix_ia).
--
-- POR QUE NO ORDENAN
-- Medido el 2026-08-05 en Palermo (11.930 propiedades dentro del rectangulo):
-- con  ORDER BY price  la base tiene que traer las 11.930 y recien ahi quedarse con
-- 1.000: 1.497 ms. Sin ordenar, el LIMIT corta apenas junta las mil: 10 ms. Y esto se
-- paga en CADA movimiento del mapa. El orden por precio del panel se hace en el
-- navegador, sobre las <=1.000 ya traidas.
-- Verificado que el orden fisico NO esta sesgado geograficamente: las primeras 1.000
-- cubren el mismo rectangulo (mismos min/max de lat y lng) y 19 de las 22 celdas que
-- ocupan las 11.930. No deja media pantalla vacia.
--
-- POR QUE DEVUELVEN POCAS COLUMNAS
-- Medido sobre las mismas 1.000 filas: con descripcion y todas las imagenes, 1.653 ms;
-- con una sola foto de portada y sin descripcion, 10 ms. 165 veces mas rapido, y ademas
-- evita mandar megabytes de texto al navegador en cada movimiento.
-- La ficha completa (todas las fotos + descripcion) se pide aparte al clickear el punto,
-- que es exactamente cuando el usuario la necesita.
--
-- Las dos funciones devuelven las mismas columnas, para que el mapeo en TypeScript sea uno solo.

DROP FUNCTION IF EXISTS mapa_cartera(uuid, double precision, double precision, double precision, double precision, text, text, numeric, numeric, text, integer, integer);
DROP FUNCTION IF EXISTS mapa_colaboracion(double precision, double precision, double precision, double precision, text, text, numeric, numeric, text, integer, integer);

-- ─────────────────────────── cartera de la agencia ───────────────────────────
CREATE OR REPLACE FUNCTION mapa_cartera(
  p_agency_id     uuid,
  p_sur           double precision,
  p_oeste         double precision,
  p_norte         double precision,
  p_este          double precision,
  p_operacion     text    DEFAULT NULL,
  p_tipo          text    DEFAULT NULL,
  p_precio_min    numeric DEFAULT NULL,
  p_precio_max    numeric DEFAULT NULL,
  p_moneda        text    DEFAULT NULL,
  p_ambientes_min integer DEFAULT NULL,
  p_limit         integer DEFAULT 1000
)
RETURNS TABLE (
  ref               text,   -- identificador estable: uuid de la cartera o slug de colaboracion
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
  foto              text,   -- solo la portada; el resto llega con la ficha
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
    AND (p_tipo          IS NULL OR p.property_type = p_tipo)
    AND (p_moneda        IS NULL OR p.currency      = p_moneda)
    AND (p_precio_min    IS NULL OR p.price >= p_precio_min)
    AND (p_precio_max    IS NULL OR p.price <= p_precio_max)
    AND (p_ambientes_min IS NULL OR COALESCE(p.bedrooms, 0) >= p_ambientes_min)
  LIMIT p_limit
$$;

-- ─────────────────────────── red de colaboracion ───────────────────────────
CREATE OR REPLACE FUNCTION mapa_colaboracion(
  p_sur           double precision,
  p_oeste         double precision,
  p_norte         double precision,
  p_este          double precision,
  p_operacion     text    DEFAULT NULL,
  p_tipo          text    DEFAULT NULL,
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
    AND (p_tipo          IS NULL OR r.property_type = p_tipo)
    AND (p_moneda        IS NULL OR r.currency      = p_moneda)
    AND (p_precio_min    IS NULL OR r.price >= p_precio_min)
    AND (p_precio_max    IS NULL OR r.price <= p_precio_max)
    AND (p_ambientes_min IS NULL OR COALESCE(r.rooms, r.bedrooms, 0) >= p_ambientes_min)
  LIMIT p_limit
$$;
