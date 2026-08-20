-- ============================================================================
-- `proceso` pasa de dos valores a cuatro: absorbe al "Tipo de Lead" que ya
-- existía (sólo en Prospección) para vendedor/comprador/locador/locatario.
--
-- Por qué: un Locador no vende y un Locatario no compra, así que el esquema
-- compra/venta no podía representar alquileres sin mentirle al sistema. Y
-- "Tipo de Lead" sólo se preguntaba en Prospección, así que sin este cambio
-- las otras cinco etapas seguían sin ese dato — que es justo lo que impide
-- partir la tarjeta en dos, la función completa de este módulo.
--
-- Orden obligatorio: el CHECK viejo (`performance_logs_proceso_coherente`)
-- rechaza 'vendedor'/'comprador'/'locador'/'locatario' porque sólo admite
-- 'compra'/'venta'. Por eso las dos restricciones bajan ANTES de tocar un
-- solo valor, y suben de nuevo recién al final, ya validando contra la lista
-- de cada etapa.
-- ============================================================================

-- ── 1. Bajar los CHECK existentes ───────────────────────────────────────────
ALTER TABLE public.performance_logs
  DROP CONSTRAINT IF EXISTS performance_logs_proceso_coherente;

ALTER TABLE public.tracking_pipeline_moves
  DROP CONSTRAINT IF EXISTS tracking_pipeline_moves_proceso_check;

-- ── 2. Renombrar los valores ya cargados ────────────────────────────────────
-- 'venta' era siempre del lado de quien ofrece una propiedad → 'vendedor'.
-- 'compra' era siempre del lado de quien busca una propiedad → 'comprador'.
-- Ningún registro pre-existente pudo haber sido un alquiler: esos dos valores
-- no existían todavía, así que no hay nada que mapear a locador/locatario acá.
UPDATE public.performance_logs
   SET proceso = 'vendedor'
 WHERE proceso = 'venta';

UPDATE public.performance_logs
   SET proceso = 'comprador'
 WHERE proceso = 'compra';

UPDATE public.tracking_pipeline_moves
   SET proceso = 'vendedor'
 WHERE proceso = 'venta';

UPDATE public.tracking_pipeline_moves
   SET proceso = 'comprador'
 WHERE proceso = 'compra';

-- ── 3. Backfill desde metadata->>'tipo_lead' ────────────────────────────────
-- El "Tipo de Lead" de Prospección tenía el dato que el backfill anterior no
-- miró. Resuelve, entre otras, las 5 filas "Vendedor" que habían quedado en
-- SIN DEFINIR por esa razón.
UPDATE public.performance_logs
   SET proceso = 'vendedor'
 WHERE proceso IS NULL
   AND metadata->>'tipo_lead' = 'Vendedor';

UPDATE public.performance_logs
   SET proceso = 'comprador'
 WHERE proceso IS NULL
   AND metadata->>'tipo_lead' = 'Comprador';

UPDATE public.performance_logs
   SET proceso = 'locador'
 WHERE proceso IS NULL
   AND metadata->>'tipo_lead' = 'Locador';

UPDATE public.performance_logs
   SET proceso = 'locatario'
 WHERE proceso IS NULL
   AND metadata->>'tipo_lead' = 'Locatario';

-- ── 4. Herencia por cliente para lo que sigue ambiguo ───────────────────────
-- Mismo criterio conservador que la migración anterior: una fila de etapa
-- libre (prospeccion/reserva/cierre) que siga en NULL después de los pasos
-- 2 y 3 hereda el proceso de su cliente SÓLO si ese cliente quedó con un
-- único valor entre sus filas ya resueltas. Si tiene más de uno, o ninguno,
-- se deja en NULL y lo resuelve una persona.
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

-- Mismo criterio para los movimientos manuales del tablero.
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

-- ── 5. Volver a subir los CHECK, ya con los cuatro valores ──────────────────
-- Prelisting/Captación son de quien OFRECE una propiedad: vendedor o locador.
-- Prebuying es de quien BUSCA una propiedad: comprador o locatario.
-- Prospección/Reserva/Cierre admiten los cuatro: son de los dos lados.
ALTER TABLE public.performance_logs
  ADD CONSTRAINT performance_logs_proceso_coherente CHECK (
    proceso IS NULL
    OR (type IN ('prelisting', 'captacion') AND proceso IN ('vendedor', 'locador'))
    OR (type = 'prebuying'                  AND proceso IN ('comprador', 'locatario'))
    OR (type IN ('prospeccion', 'reserva', 'cierre')
        AND proceso IN ('vendedor', 'comprador', 'locador', 'locatario'))
  );

ALTER TABLE public.tracking_pipeline_moves
  ADD CONSTRAINT tracking_pipeline_moves_proceso_check
  CHECK (proceso IS NULL OR proceso IN ('vendedor', 'comprador', 'locador', 'locatario'));

-- El índice `performance_logs_proceso_idx` (agency_id, proceso) ya existe
-- desde la migración anterior y sigue sirviendo igual: no toca valores.
