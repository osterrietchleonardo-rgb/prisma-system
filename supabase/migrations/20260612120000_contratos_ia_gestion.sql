-- ============================================================================
-- Contratos IA: gestión de plantillas y contratos generados
-- - Código único por plantilla y por contrato generado
-- - URL del archivo original subido a Storage
-- - Estado de gestión (original/modificado/eliminado) + motivo para trazabilidad
-- - Bucket de Storage "contratos" (originales subidos y PDFs generados)
-- Las tablas se crearon directamente en Supabase, por eso usamos ADD COLUMN IF NOT EXISTS.
-- ============================================================================

-- ── contract_templates ─────────────────────────────────────────────────────
ALTER TABLE public.contract_templates
  ADD COLUMN IF NOT EXISTS codigo_unico text,
  ADD COLUMN IF NOT EXISTS archivo_original_url text;

-- Código único por agencia (permite NULL para las plantillas del sistema ya existentes)
CREATE UNIQUE INDEX IF NOT EXISTS contract_templates_codigo_unico_idx
  ON public.contract_templates (agency_id, codigo_unico)
  WHERE codigo_unico IS NOT NULL;

-- ── contratos ──────────────────────────────────────────────────────────────
ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS codigo_unico text,
  ADD COLUMN IF NOT EXISTS estado_gestion text NOT NULL DEFAULT 'original',
  ADD COLUMN IF NOT EXISTS motivo_gestion text;

-- NO es único: varios contratos generados comparten el código de su plantilla.
CREATE INDEX IF NOT EXISTS contratos_codigo_unico_idx
  ON public.contratos (agency_id, codigo_unico)
  WHERE codigo_unico IS NOT NULL;

-- Validación de valores permitidos para estado_gestion
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contratos_estado_gestion_check'
  ) THEN
    ALTER TABLE public.contratos
      ADD CONSTRAINT contratos_estado_gestion_check
      CHECK (estado_gestion IN ('original', 'modificado', 'eliminado'));
  END IF;
END $$;

-- ── Storage bucket "contratos" ─────────────────────────────────────────────
-- Público para permitir ver/descargar el PDF generado mediante getPublicUrl.
-- Las escrituras se hacen siempre con service_role (createAdminClient) desde la API.
INSERT INTO storage.buckets (id, name, public)
VALUES ('contratos', 'contratos', true)
ON CONFLICT (id) DO UPDATE SET public = true;
