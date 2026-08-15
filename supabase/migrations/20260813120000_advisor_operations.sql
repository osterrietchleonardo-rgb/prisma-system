-- Forma de trabajar del asesor (formulario de oferta irresistible, fórmula de Hormozi).
-- Una fila por usuario. Alimenta los prompts de Marketing IA.
CREATE TABLE IF NOT EXISTS public.advisor_operations (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  perfil                   JSONB NOT NULL DEFAULT '{}'::jsonb,
  captacion                JSONB NOT NULL DEFAULT '{}'::jsonb,
  venta                    JSONB NOT NULL DEFAULT '{}'::jsonb,
  oferta_captacion         TEXT,
  oferta_venta             TEXT,
  oferta_captacion_editada BOOLEAN NOT NULL DEFAULT false,
  oferta_venta_editada     BOOLEAN NOT NULL DEFAULT false,
  ofertas_generadas_at     TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.advisor_operations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own operation" ON public.advisor_operations;
CREATE POLICY "Users manage own operation" ON public.advisor_operations
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
