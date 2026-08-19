-- ============================================================================
-- Un cliente puede estar en dos procesos a la vez: comprarnos y vendernos.
--
-- Hasta acá el tablero armaba UNA tarjeta por cliente y la ubicaba en la etapa
-- del último evento, así que cargarle un Prelisting a un comprador le sacaba la
-- tarjeta de Prebuying. `proceso` es lo que permite partir esa tarjeta en dos.
--
-- NULLABLE a propósito: las filas históricas ambiguas (una prospección suelta,
-- un cierre sin contexto) no tienen forma honesta de resolverse por regla, y
-- obligar en base sería inventarles un lado. NULL = "sin definir", y el asesor
-- lo resuelve desde la app. Toda alta nueva sí lo trae: lo exige el formulario
-- y lo valida savePerformanceLog.
-- ============================================================================

ALTER TABLE public.performance_logs
  ADD COLUMN IF NOT EXISTS proceso text;

ALTER TABLE public.tracking_pipeline_moves
  ADD COLUMN IF NOT EXISTS proceso text;

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Escribe SÓLO la columna nueva: ningún `type` cambia, ningún monto se mueve,
-- ningún `status` se toca. Alcanza también a las filas 'eliminada', para que el
-- director que filtra por Eliminadas las siga viendo coherentes.

-- 1 y 2. Las etapas que por definición ya dicen de qué lado del negocio están.
UPDATE public.performance_logs
   SET proceso = 'venta'
 WHERE proceso IS NULL
   AND type IN ('prelisting', 'captacion');

UPDATE public.performance_logs
   SET proceso = 'compra'
 WHERE proceso IS NULL
   AND type = 'prebuying';

-- 3. Las ambiguas (prospeccion/reserva/cierre) heredan el lado de su cliente,
--    pero SÓLO si ese cliente quedó con un único lado tras los pasos 1 y 2.
--    Si tiene los dos, o no tiene ninguno, queda NULL y lo define una persona.
--
--    Ojo: acá el cliente se agrupa por uuid (wa_contact_id / lead_id), mientras
--    que el tablero lo agrupa por teléfono normalizado. Son criterios distintos,
--    y el de acá es más fino: a lo sumo resuelve de menos y deja algo en NULL,
--    nunca de más. Ese es el lado seguro para equivocarse.
WITH lado_unico AS (
  SELECT coalesce(wa_contact_id::text, lead_id::text) AS ck,
         min(proceso)                                 AS proceso
    FROM public.performance_logs
   WHERE proceso IS NOT NULL
     AND coalesce(wa_contact_id::text, lead_id::text) IS NOT NULL
   GROUP BY 1
  HAVING count(DISTINCT proceso) = 1
)
UPDATE public.performance_logs pl
   SET proceso = lado_unico.proceso
  FROM lado_unico
 WHERE pl.proceso IS NULL
   AND coalesce(pl.wa_contact_id::text, pl.lead_id::text) = lado_unico.ck;

-- 4. Los movimientos manuales del tablero heredan con el mismo criterio. Si no
--    se resuelven quedan en NULL y siguen aplicando a la tarjeta "Sin definir",
--    que es exactamente donde van a estar sus actividades.
WITH lado_unico AS (
  SELECT coalesce(wa_contact_id::text, lead_id::text) AS ck,
         min(proceso)                                 AS proceso
    FROM public.performance_logs
   WHERE proceso IS NOT NULL
     AND coalesce(wa_contact_id::text, lead_id::text) IS NOT NULL
   GROUP BY 1
  HAVING count(DISTINCT proceso) = 1
)
UPDATE public.tracking_pipeline_moves m
   SET proceso = lado_unico.proceso
  FROM lado_unico
 WHERE m.proceso IS NULL
   AND coalesce(m.wa_contact_id::text, m.lead_id::text) = lado_unico.ck;

-- ── Coherencia garantizada en base ──────────────────────────────────────────
-- Un "Prelisting de compra" no es un caso de uso raro: es un registro que se
-- contradice a sí mismo. Que no pueda existir ni entrando por SQL directo.
ALTER TABLE public.performance_logs
  DROP CONSTRAINT IF EXISTS performance_logs_proceso_coherente;

ALTER TABLE public.performance_logs
  ADD CONSTRAINT performance_logs_proceso_coherente CHECK (
    (proceso IS NULL OR proceso IN ('compra', 'venta'))
    AND (
      proceso IS NULL
      OR (type IN ('prelisting', 'captacion') AND proceso = 'venta')
      OR (type = 'prebuying'                  AND proceso = 'compra')
      OR type IN ('prospeccion', 'reserva', 'cierre')
    )
  );

ALTER TABLE public.tracking_pipeline_moves
  DROP CONSTRAINT IF EXISTS tracking_pipeline_moves_proceso_check;

ALTER TABLE public.tracking_pipeline_moves
  ADD CONSTRAINT tracking_pipeline_moves_proceso_check
  CHECK (proceso IS NULL OR proceso IN ('compra', 'venta'));

-- ── Índice ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS performance_logs_proceso_idx
  ON public.performance_logs (agency_id, proceso);

-- RLS: sin cambios. Ninguna política de estas dos tablas nombra columnas, así
-- que agregar una no las toca.
