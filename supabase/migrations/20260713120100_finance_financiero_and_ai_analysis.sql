-- ============================================================================
-- Finanzas (admin-vakdor): dos cambios aditivos.
--   1) Nueva categoría de gasto 'financiero' → para el renglón "Gastos
--      financieros" del Estado de Resultado clásico.
--   2) Tabla finance_ai_analysis: guarda el ÚLTIMO análisis del experto IA
--      (Gemini) por mes, para no re-llamar a la IA en cada visita.
-- Acceso a finance_ai_analysis: SOLO service-role (RLS ON, sin policies),
-- igual que finance_api_costs / finance_expenses / finance_fx.
-- ============================================================================

-- ── 1) Agregar 'financiero' al CHECK de categoria (nombre real verificado) ────
ALTER TABLE public.finance_expenses DROP CONSTRAINT IF EXISTS finance_expenses_categoria_check;
ALTER TABLE public.finance_expenses ADD CONSTRAINT finance_expenses_categoria_check
  CHECK (categoria IN ('suscripcion', 'infraestructura', 'proxy', 'marketing', 'sueldos', 'impuestos', 'financiero', 'otro'));

-- ── 2) Último análisis IA por mes ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.finance_ai_analysis (
  mes          text PRIMARY KEY,                 -- 'YYYY-MM'
  contenido    jsonb NOT NULL,                   -- { diagnostico, mejoras[], optimizacion_costos[], proximos_pasos[], riesgos[] }
  modelo       text NOT NULL DEFAULT 'gemini-3.5-flash',
  generated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.finance_ai_analysis ENABLE ROW LEVEL SECURITY;
-- (Sin policies a propósito: solo el service-role la toca.)
