-- Mapa · saca el parametro puente `p_ambientes_min` de las dos funciones.
--
-- Por que existia: cuando el filtro paso de "ambientes minimos" a "elegir los
-- ambientes exactos" (20260814120000), la migracion se aplica a mano ANTES de que
-- Vercel despliegue el codigo nuevo. En esa ventana el build viejo seguia mandando
-- `p_ambientes_min`, y PostgREST resuelve la funcion por los nombres de los
-- argumentos: sin ese parametro, cada llamada del build viejo hubiera fallado y el
-- mapa se veria vacio hasta que terminara el deploy. El puente tapaba esa ventana.
--
-- Por que se puede sacar ahora: la ventana se cerro. Produccion corre el commit
-- 820c642 (deploy dpl_HVFY3pX8, estado READY) y ningun archivo del repo menciona
-- `ambientes_min`. Ademas las dos funciones se llaman SIEMPRE desde el servidor
-- (`lib/mapa/consulta.ts` usa el cliente admin desde `/api/mapa/propiedades`), asi
-- que una pestaña vieja abierta en el navegador tampoco puede llamarlas con la
-- firma antigua: pasa por el endpoint, que es el build desplegado.
--
-- Se DROPEA y se vuelve a crear en vez de CREATE OR REPLACE porque cambia la lista
-- de parametros, y eso Postgres no lo permite reemplazando. El DROP va sin CASCADE
-- a proposito: si algo dependiera de estas funciones, que falle fuerte y se vea.
-- Todo el archivo corre en UNA transaccion, asi que no hay instante en que las
-- funciones no existan.
--
-- El cuerpo de las dos es IDENTICO al que estaba vivo en produccion; lo unico que
-- desaparece es el parametro y sus dos guardas `(p_ambientes_min IS NULL OR ...)`,
-- que con el parametro en NULL siempre daban verdadero.

DROP FUNCTION IF EXISTS public.mapa_cartera(
  uuid, double precision, double precision, double precision, double precision,
  text, text[], numeric, numeric, text, integer[], integer, text, integer
);

DROP FUNCTION IF EXISTS public.mapa_colaboracion(
  double precision, double precision, double precision, double precision,
  text, text[], numeric, numeric, text, integer[], integer, text, integer
);

-- ── Cartera de la agencia (tabla `properties`) ──
CREATE FUNCTION public.mapa_cartera(
  p_agency_id uuid,
  p_sur double precision,
  p_oeste double precision,
  p_norte double precision,
  p_este double precision,
  p_operacion text DEFAULT NULL,
  p_tipos text[] DEFAULT NULL,
  p_precio_min numeric DEFAULT NULL,
  p_precio_max numeric DEFAULT NULL,
  p_moneda text DEFAULT NULL,
  p_ambientes integer[] DEFAULT NULL,
  p_limit integer DEFAULT 1000,
  p_barrio text DEFAULT NULL
)
RETURNS TABLE(
  ref text, title text, price numeric, currency text, property_type text,
  status text, bedrooms integer, bathrooms integer, total_area numeric,
  address text, city text, foto text, lat double precision, lng double precision,
  assigned_agent_id uuid, agent_name text, agent_email text, agencia_nombre text,
  canonical_url text, ambientes integer
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
    AND (p_barrio IS NULL OR barrio_normalizado(b.city) = p_barrio)
  LIMIT p_limit
$function$;

-- ── Red de colaboracion (tabla `roomix_properties`) ──
CREATE FUNCTION public.mapa_colaboracion(
  p_sur double precision,
  p_oeste double precision,
  p_norte double precision,
  p_este double precision,
  p_operacion text DEFAULT NULL,
  p_tipos text[] DEFAULT NULL,
  p_precio_min numeric DEFAULT NULL,
  p_precio_max numeric DEFAULT NULL,
  p_moneda text DEFAULT NULL,
  p_ambientes integer[] DEFAULT NULL,
  p_limit integer DEFAULT 1000,
  p_barrio text DEFAULT NULL
)
RETURNS TABLE(
  ref text, title text, price numeric, currency text, property_type text,
  status text, bedrooms integer, bathrooms integer, total_area numeric,
  address text, city text, foto text, lat double precision, lng double precision,
  assigned_agent_id uuid, agent_name text, agent_email text, agencia_nombre text,
  canonical_url text, ambientes integer
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
    LIMIT p_limit;
  END IF;
END;
$function$;

-- Los permisos NO sobreviven al DROP. Se reponen exactamente los que tenian antes
-- (`=X/postgres | anon | authenticated | service_role`); sin esto el mapa se queda
-- sin permiso de ejecutar y devuelve error en vez de propiedades.
GRANT EXECUTE ON FUNCTION public.mapa_cartera(
  uuid, double precision, double precision, double precision, double precision,
  text, text[], numeric, numeric, text, integer[], integer, text
) TO PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.mapa_colaboracion(
  double precision, double precision, double precision, double precision,
  text, text[], numeric, numeric, text, integer[], integer, text
) TO PUBLIC, anon, authenticated, service_role;
