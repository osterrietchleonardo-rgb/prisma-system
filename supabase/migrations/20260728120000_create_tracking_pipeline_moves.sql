-- ============================================================================
-- Movimientos manuales de la vista Pipeline de Tracking Performance.
-- - Cada fila es "alguien arrastró la tarjeta del cliente X a la etapa Y".
-- - Tabla APPEND-ONLY: no se actualiza ni se borra, es la trazabilidad.
-- - NO reemplaza a performance_logs: acá no hay actividad comercial, por eso
--   mover una tarjeta hacia atrás no altera ninguna métrica del Dashboard.
-- - client_key = celular normalizado E.164 sin "+" (lib/whatsapp/phone.ts), o
--   "lead:<uuid>" / "wa:<uuid>" cuando el teléfono no se puede normalizar.
-- - La etapa actual de una tarjeta = el evento más reciente entre sus
--   performance_logs y sus filas acá (se compara por created_at).
-- Mismo patrón/RLS que public.performance_logs.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tracking_pipeline_moves (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  agent_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_key    text NOT NULL,
  lead_id       uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  wa_contact_id uuid REFERENCES public.wa_contacts(id) ON DELETE SET NULL,
  from_stage    text CHECK (from_stage IN ('prospeccion','prelisting','prebuying','captacion','reserva','cierre')),
  to_stage      text NOT NULL CHECK (to_stage IN ('prospeccion','prelisting','prebuying','captacion','reserva','cierre')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- El tablero siempre lee "los movimientos de mi agencia, el más nuevo primero".
CREATE INDEX IF NOT EXISTS tracking_pipeline_moves_agency_created_idx
  ON public.tracking_pipeline_moves (agency_id, created_at DESC);

CREATE INDEX IF NOT EXISTS tracking_pipeline_moves_client_idx
  ON public.tracking_pipeline_moves (agency_id, client_key);

-- ── RLS (mismo criterio que performance_logs) ───────────────────────────────
ALTER TABLE public.tracking_pipeline_moves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tracking_pipeline_moves_select" ON public.tracking_pipeline_moves;
DROP POLICY IF EXISTS "tracking_pipeline_moves_insert" ON public.tracking_pipeline_moves;

-- SELECT: el director ve toda su agencia; el asesor, solo lo suyo.
CREATE POLICY "tracking_pipeline_moves_select" ON public.tracking_pipeline_moves
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.agency_id = tracking_pipeline_moves.agency_id
      AND (p.role = 'director' OR tracking_pipeline_moves.agent_id = auth.uid())
  )
);

-- INSERT: solo en nombre propio y dentro de la propia agencia.
CREATE POLICY "tracking_pipeline_moves_insert" ON public.tracking_pipeline_moves
FOR INSERT
TO authenticated
WITH CHECK (
  agent_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.agency_id = tracking_pipeline_moves.agency_id
  )
);
