-- ============================================================================
-- Pesos mensuales (%) de objetivos, por agencia / año / métrica.
-- - El director define, una vez por año y por métrica, un % para cada mes.
-- - Se usan para repartir un TOTAL ANUAL por asesor: objetivo_mes = total × %.
-- - Los % NO son por asesor: son comunes a toda la agencia (fila superior).
-- - Regla de negocio (validada en app + server): los 12 % de una métrica/año
--   deben sumar 100. Igualmente NO se fuerza en la BD (se permite guardar
--   parciales mientras se cargan; la validación dura vive en la server action).
-- - unique (agency_id, year, metric, month) → un % por celda; upsert idempotente.
-- Mismo patrón/RLS que public.performance_objectives.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.performance_objective_weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  year      int  NOT NULL,
  metric    text NOT NULL CHECK (metric IN ('facturacion', 'captacion')),
  month     int  NOT NULL CHECK (month BETWEEN 1 AND 12),
  weight_pct numeric NOT NULL DEFAULT 0 CHECK (weight_pct >= 0 AND weight_pct <= 100),
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, year, metric, month)
);

CREATE INDEX IF NOT EXISTS performance_objective_weights_agency_year_idx
  ON public.performance_objective_weights (agency_id, year);

-- ── RLS (clon de performance_objectives) ────────────────────────────────────
ALTER TABLE public.performance_objective_weights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "performance_objective_weights_select" ON public.performance_objective_weights;
DROP POLICY IF EXISTS "performance_objective_weights_director_write" ON public.performance_objective_weights;

-- SELECT: cualquiera de la agencia ve los % de su agencia.
CREATE POLICY "performance_objective_weights_select" ON public.performance_objective_weights
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.agency_id = performance_objective_weights.agency_id
  )
);

-- INSERT/UPDATE/DELETE: solo el director de la agencia.
CREATE POLICY "performance_objective_weights_director_write" ON public.performance_objective_weights
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.role = 'director'
    AND p.agency_id = performance_objective_weights.agency_id
  )
);
