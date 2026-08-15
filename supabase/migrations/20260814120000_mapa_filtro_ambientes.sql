-- Mapa · filtrar por CANTIDAD de ambientes, y que "ambientes" sean ambientes de verdad.
--
-- ─────────────────── PROBLEMA 1: el filtro decia una cosa y hacia otra ───────────────────
-- La casilla de pantalla decia "Amb. min." pero en la CARTERA filtraba `properties.bedrooms`,
-- que son DORMITORIOS. No es un detalle de nombres: en el 84% de la cartera los dos numeros
-- son distintos (verificado el 2026-08-14: 377 de 451 propiedades activas), porque el
-- ambiente de mas es el living. Pedir "3 ambientes o mas" traia cosas de 3 dormitorios, o
-- sea de 4 ambientes: todo corrido un lugar.
--
-- Los ambientes de la cartera NO viven en una columna: `properties` solo tiene `bedrooms`.
-- Estan en `tokko_data->>'room_amount'`, que trae las 451 activas y todas numericas. Igual
-- se lee con un guarda de formato: una propiedad cargada a mano (sin `tokko_data`) tiene que
-- quedar sin ambientes, no romper la consulta. Sin ambientes no matchea ningun boton, que es
-- lo correcto: no se puede afirmar que una propiedad tiene 3 ambientes si nadie lo cargo.
--
-- En la red de colaboracion el dato si esta en su propia columna: `rooms` son ambientes y
-- `bedrooms` dormitorios (155.133 de 178.071 avisos ubicados traen `rooms`).
--
-- ─────────────────── PROBLEMA 2: "minimo" no alcanza ───────────────────
-- Un asesor no busca "3 o mas": busca 2 y 3 para un cliente, o 4 para otro. El parametro
-- pasa de un `p_ambientes_min integer` a un `p_ambientes integer[]` con los numeros
-- elegidos. El 5 significa "5 o mas": arriba de eso la muestra se vuelve tan chica que un
-- boton por numero no le sirve a nadie.
--
--   p_ambientes = NULL       -> sin filtro (todas)
--   p_ambientes = '{2,3}'    -> exactamente 2 o exactamente 3
--   p_ambientes = '{5}'      -> 5 o mas
--   p_ambientes = '{2,5}'    -> 2, o 5 o mas
--
-- ─────────────────── Ademas: la lista devuelve los dos numeros ───────────────────
-- Se agrega la columna `ambientes` a las dos funciones. `bedrooms` se queda como esta —son
-- dormitorios— porque la ficha compartida con el chat los muestra como "Dorm.". Lo que
-- estaba mal era la lista del mapa, que pintaba `bedrooms` con la etiqueta "amb.".
--
-- De paso se saca el `COALESCE(r.bedrooms, r.rooms)` de la colaboracion: cuando el aviso no
-- traia dormitorios, ponia los ambientes en su lugar y la ficha mostraba "3 Dorm." para un
-- 3 ambientes. Ahora cada numero es el suyo.
--
-- ─────────────────── Por que sobrevive p_ambientes_min ───────────────────
-- Hay que DROP y volver a crear: cambian la firma y el RETURNS TABLE, y CREATE OR REPLACE
-- no puede con ninguna de las dos cosas. Pero produccion sigue corriendo el codigo VIEJO
-- hasta que salga el deploy, y ese codigo manda `p_ambientes_min`: si el parametro
-- desaparece, PostgREST no encuentra la funcion y el mapa se queda sin propiedades para
-- todos hasta que Vercel termine de publicar.
--
-- Por eso el parametro viejo se queda un rato mas, como puente. Ahora ademas mide contra la
-- columna CORRECTA, asi que el "Amb. min." que hoy ve la gente pasa a filtrar ambientes de
-- verdad sin esperar al deploy. Se saca en la migracion siguiente, una vez publicado.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. El indice, que aca NO es una optimizacion: sin el, el filtro no funciona
-- ─────────────────────────────────────────────────────────────────────────────
--
-- El primer intento tiraba `canceling statement due to statement timeout` (8,6 s) en
-- cuanto se apretaba un boton de ambientes. El plan explica por que: `idx_roomix_geo_filtros`
-- no tenia `rooms`, asi que la base armaba el bitmap con las 25.223 del rectangulo y
-- despues descartaba a mano 3.902 filas por cada 1.000 que servian, tocando 3.985 bloques
-- de disco. Con `rooms` adentro del indice el filtro entra en el `Index Cond` y el bitmap
-- ya sale chico. Medido sobre el mismo rectangulo (Chacarita a La Boca, ambientes = 3):
--
--   sin rooms en el indice   4.033 ms   bitmap de 25.223 filas, 3.985 bloques
--   con rooms en el indice      72 ms   bitmap de  5.526 filas,   951 bloques
--
-- El indice nuevo es el viejo MAS `rooms`, asi que lo reemplaza: el planner lo elige
-- tambien para las consultas que no filtran ambientes (verificado con EXPLAIN). Por eso se
-- borra el anterior en vez de dejar los dos, que costarian el doble en cada sync nocturno.
-- 24 MB pasan a 29 MB.
--
-- El CREATE vive en su propio archivo — 20260814115000_mapa_indice_ambientes.sql — porque
-- va CONCURRENTLY y eso no puede correr junto a otras sentencias: el cliente las envuelve
-- en una transaccion. El DROP si puede ir aca, es instantaneo y no reconstruye nada.
DROP INDEX IF EXISTS idx_roomix_geo_filtros;

-- La cartera propia no necesita indice: son 451 propiedades activas y el filtro de agencia
-- ya deja la busqueda en un pañuelo.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Cartera propia
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS mapa_cartera(uuid, double precision, double precision, double precision, double precision, text, text[], numeric, numeric, text, integer, integer, text);

CREATE FUNCTION mapa_cartera(
  p_agency_id  uuid,
  p_sur        double precision,
  p_oeste      double precision,
  p_norte      double precision,
  p_este       double precision,
  p_operacion  text      DEFAULT NULL,
  p_tipos      text[]    DEFAULT NULL,
  p_precio_min numeric   DEFAULT NULL,
  p_precio_max numeric   DEFAULT NULL,
  p_moneda     text      DEFAULT NULL,
  p_ambientes  integer[] DEFAULT NULL,
  p_limit      integer   DEFAULT 1000,
  p_barrio     text      DEFAULT NULL,
  -- Puente para el codigo viejo mientras sale el deploy. Ver la cabecera.
  p_ambientes_min integer DEFAULT NULL
)
RETURNS TABLE (
  ref text, title text, price numeric, currency text, property_type text, status text,
  bedrooms integer, bathrooms integer, total_area numeric, address text, city text,
  foto text, lat double precision, lng double precision, assigned_agent_id uuid,
  agent_name text, agent_email text, agencia_nombre text, canonical_url text,
  ambientes integer
)
LANGUAGE sql
STABLE
AS $function$
  WITH base AS (
    SELECT
      p.*,
      -- Los ambientes de Tokko. El guarda de formato no es paranoia: `tokko_data` es jsonb
      -- libre y un cast directo sobre un texto raro tira la consulta entera, no la fila.
      CASE
        WHEN p.tokko_data->>'room_amount' ~ '^[0-9]+(\.[0-9]+)?$'
        THEN floor((p.tokko_data->>'room_amount')::numeric)::integer
      END AS amb
    FROM properties p
    WHERE p.is_active
      AND p.agency_id = p_agency_id
      AND p.lat IS NOT NULL AND p.lng IS NOT NULL
      AND point(p.lng, p.lat) <@ box(point(p_oeste, p_sur), point(p_este, p_norte))
  )
  SELECT
    b.id::text, b.title, b.price, b.currency, b.property_type, b.status,
    b.bedrooms, b.bathrooms, b.total_area, b.address, b.city,
    b.images->>0, b.lat, b.lng, b.assigned_agent_id,
    COALESCE(pr.full_name, b.assigned_agent->>'name',  'Sin asignar'),
    COALESCE(pr.email,     b.assigned_agent->>'email', ''),
    NULL::text,
    NULL::text,
    b.amb
  FROM base b
  LEFT JOIN profiles pr ON pr.id = b.assigned_agent_id
  WHERE
    -- "Alquiler" tiene que incluir tambien "Temporary rent", que existe en la cartera.
    (p_operacion IS NULL
     OR (p_operacion = 'Venta'    AND b.status =  'Venta')
     OR (p_operacion = 'Alquiler' AND b.status <> 'Venta'))
    AND (p_tipos      IS NULL OR b.property_type = ANY(p_tipos))
    AND (p_moneda     IS NULL OR b.currency      = p_moneda)
    AND (p_precio_min IS NULL OR b.price >= p_precio_min)
    AND (p_precio_max IS NULL OR b.price <= p_precio_max)
    -- Sin ambientes cargados no matchea ningun boton: NULL = ANY(...) da NULL, no true.
    AND (p_ambientes IS NULL
         OR b.amb = ANY(p_ambientes)
         OR (5 = ANY(p_ambientes) AND b.amb >= 5))
    AND (p_ambientes_min IS NULL OR b.amb >= p_ambientes_min)
    -- En la cartera el barrio vive en `city` (dice "Belgrano", no "Buenos Aires").
    AND (p_barrio IS NULL OR lower(unaccent(btrim(coalesce(b.city, '')))) = p_barrio)
  LIMIT p_limit
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Red de colaboracion
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS mapa_colaboracion(double precision, double precision, double precision, double precision, text, text[], numeric, numeric, text, integer, integer, text);

CREATE FUNCTION mapa_colaboracion(
  p_sur        double precision,
  p_oeste      double precision,
  p_norte      double precision,
  p_este       double precision,
  p_operacion  text      DEFAULT NULL,
  p_tipos      text[]    DEFAULT NULL,
  p_precio_min numeric   DEFAULT NULL,
  p_precio_max numeric   DEFAULT NULL,
  p_moneda     text      DEFAULT NULL,
  p_ambientes  integer[] DEFAULT NULL,
  p_limit      integer   DEFAULT 1000,
  p_barrio     text      DEFAULT NULL,
  -- Puente para el codigo viejo mientras sale el deploy. Ver la cabecera.
  p_ambientes_min integer DEFAULT NULL
)
RETURNS TABLE (
  ref text, title text, price numeric, currency text, property_type text, status text,
  bedrooms integer, bathrooms integer, total_area numeric, address text, city text,
  foto text, lat double precision, lng double precision, assigned_agent_id uuid,
  agent_name text, agent_email text, agencia_nombre text, canonical_url text,
  ambientes integer
)
LANGUAGE sql
STABLE
AS $function$
  SELECT
    r.slug::text, r.title, r.price, r.currency::text, r.property_type::text,
    CASE WHEN r.operation = 'rent' THEN 'Alquiler' ELSE 'Venta' END,
    r.bedrooms, r.bathrooms, r.area_m2,
    COALESCE(r.address, r.neighborhood::text, ''),
    r.neighborhood::text,
    r.images[1], r.lat, r.lng,
    NULL::uuid, ''::text, ''::text,
    COALESCE(r.roomix_agency_name::text, 'Inmobiliaria colaboradora'),
    r.canonical_url,
    r.rooms
  FROM roomix_properties r
  WHERE r.is_active
    AND r.lat IS NOT NULL AND r.lng IS NOT NULL
    AND point(r.lng, r.lat) <@ box(point(p_oeste, p_sur), point(p_este, p_norte))
    AND (p_operacion IS NULL
         OR (p_operacion = 'Venta'    AND r.operation = 'sale')
         OR (p_operacion = 'Alquiler' AND r.operation = 'rent'))
    AND (p_tipos      IS NULL OR r.property_type::text = ANY(p_tipos))
    AND (p_moneda     IS NULL OR r.currency      = p_moneda)
    AND (p_precio_min IS NULL OR r.price >= p_precio_min)
    AND (p_precio_max IS NULL OR r.price <= p_precio_max)
    AND (p_ambientes IS NULL
         OR r.rooms = ANY(p_ambientes)
         OR (5 = ANY(p_ambientes) AND r.rooms >= 5))
    AND (p_ambientes_min IS NULL OR r.rooms >= p_ambientes_min)
    AND (p_barrio IS NULL OR lower(unaccent(btrim(coalesce(r.neighborhood::text, '')))) = p_barrio)
  LIMIT p_limit
$function$;
