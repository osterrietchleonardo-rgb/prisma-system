-- ─────────────────────────────────────────────────────────────
-- Documentos para clientes: el director arma una plantilla una vez (cuerpo en el editor,
-- header y footer como imágenes, un bloque con los datos del asesor) y cada asesor la
-- comparte con sus clientes como link público con PDF, con SUS datos.
--
-- Dos tablas nuevas. Nada existente se modifica. Idempotente.
--
-- Cómo se deshace:
--   DROP FUNCTION IF EXISTS public.increment_shared_documento_view(text);
--   DROP TABLE IF EXISTS public.shared_documentos;
--   DROP TABLE IF EXISTS public.documentos_plantillas;
-- ─────────────────────────────────────────────────────────────

-- ── 1. La plantilla ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.documentos_plantillas (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id      uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
    nombre         text NOT NULL,
    cuerpo         jsonb NOT NULL DEFAULT '{"type":"doc","content":[]}'::jsonb,
    header_path    text,
    footer_path    text,
    bloque_asesor  jsonb NOT NULL DEFAULT '{"texto":{"type":"doc","content":[]},"posicion":"ninguno"}'::jsonb,
    version        integer NOT NULL DEFAULT 1,
    activa         boolean NOT NULL DEFAULT false,
    created_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS documentos_plantillas_agency_idx
    ON public.documentos_plantillas (agency_id);

ALTER TABLE public.documentos_plantillas ENABLE ROW LEVEL SECURITY;

-- El director de la agencia hace todo con las suyas.
DROP POLICY IF EXISTS "Directores gestionan sus plantillas de documentos" ON public.documentos_plantillas;
CREATE POLICY "Directores gestionan sus plantillas de documentos"
  ON public.documentos_plantillas FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'director'
      AND p.agency_id = documentos_plantillas.agency_id
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'director'
      AND p.agency_id = documentos_plantillas.agency_id
  ));

-- El asesor de la agencia solo lee las activas: son las que puede compartir.
DROP POLICY IF EXISTS "Asesores leen las plantillas activas de su agencia" ON public.documentos_plantillas;
CREATE POLICY "Asesores leen las plantillas activas de su agencia"
  ON public.documentos_plantillas FOR SELECT
  USING (activa = true AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.agency_id = documentos_plantillas.agency_id
  ));

-- ── 2. El documento compartido (copia congelada) ─────────────
-- Mismo molde que shared_selections: token + snapshot, RLS encendida SIN políticas, solo la
-- lee el servidor con service-role.
CREATE TABLE IF NOT EXISTS public.shared_documentos (
    token        text PRIMARY KEY,
    snapshot     jsonb NOT NULL,   -- { plantilla, agent, agency, brand, created_at }
    plantilla_id uuid REFERENCES public.documentos_plantillas(id) ON DELETE SET NULL,
    created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    agency_id    uuid,
    view_count   integer NOT NULL DEFAULT 0,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shared_documentos_created_by_idx  ON public.shared_documentos (created_by);
CREATE INDEX IF NOT EXISTS shared_documentos_agency_id_idx   ON public.shared_documentos (agency_id);
CREATE INDEX IF NOT EXISTS shared_documentos_plantilla_idx   ON public.shared_documentos (plantilla_id);

ALTER TABLE public.shared_documentos ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.increment_shared_documento_view(p_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.shared_documentos SET view_count = view_count + 1 WHERE token = p_token;
$$;

COMMENT ON TABLE public.documentos_plantillas
  IS 'Plantillas de documentos para clientes: cuerpo Tiptap, header/footer como imágenes, bloque del asesor con variables.';
COMMENT ON TABLE public.shared_documentos
  IS 'Un documento ya compartido. Copia congelada: no cambia aunque cambie la plantilla, el asesor o la marca.';
