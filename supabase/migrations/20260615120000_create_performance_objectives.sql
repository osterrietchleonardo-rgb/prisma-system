-- ============================================================================
-- Objetivos mensuales por asesor (Facturación y Captación)
-- - El director setea, por asesor y por mes del año, la meta de cada métrica.
-- - Los valores "alcanzados" NO se guardan aquí: se calculan de performance_logs.
-- - metric es texto con CHECK para poder sumar métricas a futuro sin migrar esquema.
-- - unique (agent_id, year, month, metric) → un objetivo por celda; upsert idempotente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.performance_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  agent_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  year      int  NOT NULL,
  month     int  NOT NULL CHECK (month BETWEEN 1 AND 12),
  metric    text NOT NULL CHECK (metric IN ('facturacion', 'captacion')),
  target_value numeric NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, year, month, metric)
);

CREATE INDEX IF NOT EXISTS performance_objectives_agency_year_idx
  ON public.performance_objectives (agency_id, year);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.performance_objectives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "performance_objectives_select" ON public.performance_objectives;
DROP POLICY IF EXISTS "performance_objectives_director_write" ON public.performance_objectives;

-- SELECT: cualquiera de la agencia ve los objetivos de su agencia
-- (el director ve todos; el asesor ve los de la agencia, igual que el Ranking).
CREATE POLICY "performance_objectives_select" ON public.performance_objectives
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.agency_id = performance_objectives.agency_id
  )
);

-- INSERT/UPDATE/DELETE: solo el director de la agencia.
CREATE POLICY "performance_objectives_director_write" ON public.performance_objectives
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.role = 'director'
    AND p.agency_id = performance_objectives.agency_id
  )
);
