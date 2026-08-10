-- ============================================================================
-- Marketing (admin-vakdor): Tabla para almacenar el análisis del experto IA
-- (Gemini 3.5 Flash) sobre las métricas de conversión de la web y redes.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.marketing_ai_analysis (
  periodo      text PRIMARY KEY,                 -- '7d', '30d', '90d'
  contenido    jsonb NOT NULL,                   -- { analisis_actual, analisis_mejora, proximo_paso, ranking_analisis }
  modelo       text NOT NULL DEFAULT 'gemini-3.5-flash',
  generated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.marketing_ai_analysis ENABLE ROW LEVEL SECURITY;
-- Acceso exclusivo service-role (sin policies públicas)
