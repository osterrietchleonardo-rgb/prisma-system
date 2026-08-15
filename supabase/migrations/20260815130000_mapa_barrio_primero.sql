-- Mapa · filtrar por barrio Y por ambientes a la vez hacia timeout.
--
-- ─────────────────────────────── EL SINTOMA ───────────────────────────────
-- Con "1 ambiente" puesto y el barrio Belgrano elegido, /api/mapa/propiedades devolvia
-- 500 con `canceling statement due to statement timeout`. Cada filtro por separado
-- andaba; juntos, no.
--
-- ─────────────────────────────── LA CAUSA ───────────────────────────────
-- Dos cosas que se suman.
--
-- 1. El filtro de barrio NUNCA pudo usar su indice. `idx_roomix_barrio_normalizado` esta
--    construido sobre `barrio_normalizado(neighborhood)`, que por dentro llama a
--    `unaccent('public.unaccent'::regdictionary, ...)` —con el diccionario explicito, para
--    ser inmutable e indexable—. Las funciones del mapa escribian a mano
--    `lower(unaccent(btrim(coalesce(...))))` con el `unaccent` de UN argumento: es OTRA
--    expresion, asi que Postgres no puede reconocerla y el barrio se evaluaba fila por
--    fila como filtro.
--
-- 2. Las filas de `roomix_properties` son ENORMES (~10 KB: fotos, descripcion, embedding).
--    El costo no esta en pensar, esta en traer paginas de disco. Con el barrio como filtro,
--    la base traia del disco las 3.585 filas del rectangulo para quedarse con 808.
--
-- Medido sobre Belgrano en venta con 1 ambiente, cache frio contra tibio:
--
--   filtro de barrio por fila     2.511 ms frio   ·  36 ms tibio   ·  3.247 bloques
--   barrio resuelto primero         333 ms frio                    ·    824 filas
--
-- Los 36 ms tibios explican por que esto no se veia: en cuanto alguien pasa por la zona,
-- las paginas quedan en memoria y todo vuela. El 500 aparece justo cuando el asesor entra
-- a un barrio que nadie miro hace rato, que es exactamente cuando mas se lo necesita.
--
-- ─────────────────────────────── EL ARREGLO ───────────────────────────────
-- Cuando viene un barrio, se resuelve el BARRIO PRIMERO con su indice y recien despues se
-- recorta por el rectangulo. Asi del disco salen 824 filas en vez de 3.585. Es el mismo
-- camino que ya toma `acm_match_roomix` desde la migracion 20260813120100.
--
-- No se toca el camino sin barrio: ese ya andaba bien con el indice geografico.
--
-- POR QUE UNA VARIABLE PARA EL "5 O MAS"
-- La condicion de ambientes es `rooms = ANY(p_ambientes) OR (hay un 5 AND rooms >= 5)`.
-- Escrito como `5 = ANY(p_ambientes)` la base no puede resolverlo al planificar y toda la
-- condicion deja de ser indexable. Metido en una variable booleana, el plan de cada llamada
-- lo ve como constante: si no hay 5 la rama desaparece, y si lo hay quedan dos condiciones
-- indexables unidas por OR. Se descarto expandir el array a {5,6,7,…}: hay avisos de hasta
-- 527 ambientes y cualquier tope elegido a dedo se comeria en silencio los de arriba.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. El indice que el barrio nunca tuvo
-- ─────────────────────────────────────────────────────────────────────────────
-- El CREATE vive en su propio archivo — 20260815125000_mapa_indice_barrio_operacion_ambientes.sql —
-- porque va CONCURRENTLY y eso no puede correr junto a otras sentencias. El DROP del
-- anterior (el mismo sin operacion ni ambientes, que ademas nunca se pudo usar) si va aca.
DROP INDEX IF EXISTS idx_roomix_barrio_normalizado;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. La consulta de la red, con el barrio primero
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION mapa_colaboracion(
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
  p_ambientes_min integer DEFAULT NULL
)
RETURNS TABLE (
  ref text, title text, price numeric, currency text, property_type text, status text,
  bedrooms integer, bathrooms integer, total_area numeric, address text, city text,
  foto text, lat double precision, lng double precision, assigned_agent_id uuid,
  agent_name text, agent_email text, agencia_nombre text, canonical_url text,
  ambientes integer
)
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  -- Las dos salen del parametro UNA vez, para que el plan las vea como constantes.
  v_hay_cinco boolean := p_ambientes IS NOT NULL AND 5 = ANY(p_ambientes);
  v_hay_barrio boolean := p_barrio IS NOT NULL AND btrim(p_barrio) <> '';
BEGIN
  IF v_hay_barrio THEN
    RETURN QUERY
    -- MATERIALIZED no es decorativo: sin el, Postgres aplana el CTE, vuelve a elegir el
    -- indice geografico y estamos donde empezamos.
    WITH cand AS MATERIALIZED (
      SELECT r.*
      FROM roomix_properties r
      WHERE r.is_active
        AND barrio_normalizado(r.neighborhood::text) = p_barrio
        AND (p_operacion IS NULL
             OR (p_operacion = 'Venta'    AND r.operation = 'sale')
             OR (p_operacion = 'Alquiler' AND r.operation = 'rent'))
        AND (p_ambientes IS NULL
             OR r.rooms = ANY(p_ambientes)
             OR (v_hay_cinco AND r.rooms >= 5))
        AND (p_ambientes_min IS NULL OR r.rooms >= p_ambientes_min)
    )
    SELECT
      c.slug::text, c.title, c.price, c.currency::text, c.property_type::text,
      CASE WHEN c.operation = 'rent' THEN 'Alquiler' ELSE 'Venta' END,
      c.bedrooms, c.bathrooms, c.area_m2,
      COALESCE(c.address, c.neighborhood::text, ''),
      c.neighborhood::text,
      c.images[1], c.lat, c.lng,
      NULL::uuid, ''::text, ''::text,
      COALESCE(c.roomix_agency_name::text, 'Inmobiliaria colaboradora'),
      c.canonical_url,
      c.rooms
    FROM cand c
    WHERE c.lat IS NOT NULL AND c.lng IS NOT NULL
      AND point(c.lng, c.lat) <@ box(point(p_oeste, p_sur), point(p_este, p_norte))
      AND (p_tipos      IS NULL OR c.property_type::text = ANY(p_tipos))
      AND (p_moneda     IS NULL OR c.currency = p_moneda)
      AND (p_precio_min IS NULL OR c.price >= p_precio_min)
      AND (p_precio_max IS NULL OR c.price <= p_precio_max)
    LIMIT p_limit;

  ELSE
    RETURN QUERY
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
      AND (p_moneda     IS NULL OR r.currency = p_moneda)
      AND (p_precio_min IS NULL OR r.price >= p_precio_min)
      AND (p_precio_max IS NULL OR r.price <= p_precio_max)
      AND (p_ambientes IS NULL
           OR r.rooms = ANY(p_ambientes)
           OR (v_hay_cinco AND r.rooms >= 5))
      AND (p_ambientes_min IS NULL OR r.rooms >= p_ambientes_min)
    LIMIT p_limit;
  END IF;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. La cartera propia usa la misma expresion, para que el barrio signifique lo mismo
-- ─────────────────────────────────────────────────────────────────────────────
-- Aca no hay problema de velocidad —451 propiedades activas y ya filtradas por agencia—
-- pero las dos fuentes tienen que normalizar el barrio IGUAL, o "Núñez" coincide en una y
-- no en la otra. Se cambia solo esa linea.
CREATE OR REPLACE FUNCTION mapa_cartera(
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
    (p_operacion IS NULL
     OR (p_operacion = 'Venta'    AND b.status =  'Venta')
     OR (p_operacion = 'Alquiler' AND b.status <> 'Venta'))
    AND (p_tipos      IS NULL OR b.property_type = ANY(p_tipos))
    AND (p_moneda     IS NULL OR b.currency      = p_moneda)
    AND (p_precio_min IS NULL OR b.price >= p_precio_min)
    AND (p_precio_max IS NULL OR b.price <= p_precio_max)
    AND (p_ambientes IS NULL
         OR b.amb = ANY(p_ambientes)
         OR (5 = ANY(p_ambientes) AND b.amb >= 5))
    AND (p_ambientes_min IS NULL OR b.amb >= p_ambientes_min)
    AND (p_barrio IS NULL OR barrio_normalizado(b.city) = p_barrio)
  LIMIT p_limit
$function$;
