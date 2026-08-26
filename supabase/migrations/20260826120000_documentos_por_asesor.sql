-- ─────────────────────────────────────────────────────────────
-- Los documentos de cada asesor viven adentro de PRISMA.
--
-- Dos cosas distintas, dos tablas:
--  · advisor_documents      → las plantillas personalizadas (.docx), una por tipo.
--  · advisor_info_documents → archivos sueltos de información (.docx/.doc/.pdf).
--
-- advisor_doc_templates es el "tipo de documento" (ej: "Contrato de Asesor").
-- Nace mínima a propósito: la Etapa C le va a sumar el versionado encima
-- (version_actual + una tabla de versiones) sin tener que rehacerla.
--
-- Todo aditivo: no toca ninguna tabla ni política existente.
-- ─────────────────────────────────────────────────────────────

-- 1) El tipo de documento
CREATE TABLE IF NOT EXISTS public.advisor_doc_templates (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id   uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
    nombre      text NOT NULL,
    -- 'borrador' hasta que la Etapa C detecte su plantilla y la active.
    estado      text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'activa')),
    created_by  uuid REFERENCES public.profiles(id),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Dos tipos con el mismo nombre en la misma inmobiliaria no tienen sentido y
-- harían imposible saber cuál es cuál en el desplegable.
CREATE UNIQUE INDEX IF NOT EXISTS advisor_doc_templates_agency_nombre_idx
    ON public.advisor_doc_templates (agency_id, lower(nombre));

-- 2) El documento de cada asesor (sección "plantillas personalizadas")
CREATE TABLE IF NOT EXISTS public.advisor_documents (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id              uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
    advisor_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    template_id            uuid NOT NULL REFERENCES public.advisor_doc_templates(id) ON DELETE CASCADE,
    nombre_archivo         text NOT NULL,          -- como lo subió el director, para mostrar y descargar
    archivo_original_path  text NOT NULL,          -- ruta dentro del bucket
    size_bytes             bigint,
    -- Los cuatro de abajo son de la Etapa C. Nulables a propósito: en la B el
    -- documento se sube a mano y todavía no hay plantilla ni datos extraídos.
    version_id             uuid,
    form_data              jsonb,
    estado                 text CHECK (estado IS NULL OR estado IN ('ok', 'revisar', 'pendiente')),
    observacion            text,
    created_by             uuid REFERENCES public.profiles(id),
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now()
);

-- Un asesor tiene UN documento por tipo. Si se sube otro, reemplaza al anterior.
CREATE UNIQUE INDEX IF NOT EXISTS advisor_documents_advisor_template_idx
    ON public.advisor_documents (advisor_id, template_id);

CREATE INDEX IF NOT EXISTS advisor_documents_agency_idx  ON public.advisor_documents (agency_id);
CREATE INDEX IF NOT EXISTS advisor_documents_advisor_idx ON public.advisor_documents (advisor_id);

-- 3) Los archivos sueltos (sección "documentos de información")
CREATE TABLE IF NOT EXISTS public.advisor_info_documents (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id   uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
    advisor_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    nombre      text NOT NULL,
    file_path   text NOT NULL,
    mime        text,
    size_bytes  bigint,
    created_by  uuid REFERENCES public.profiles(id),
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS advisor_info_documents_advisor_idx
    ON public.advisor_info_documents (advisor_id);
CREATE INDEX IF NOT EXISTS advisor_info_documents_agency_idx
    ON public.advisor_info_documents (agency_id);

-- ─────────────────────────────────────────────────────────────
-- Permisos.
--
-- El director hace todo dentro de SU inmobiliaria. El asesor solo LEE lo suyo:
-- ninguna escritura, y ni siquiera puede ver la lista de tipos de documento.
-- Se resuelve acá y no escondiendo botones, porque un botón escondido sigue
-- siendo una fila que se puede pedir por la API.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.advisor_doc_templates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisor_documents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisor_info_documents ENABLE ROW LEVEL SECURITY;

-- Tipos de documento: solo el director de la agencia.
DROP POLICY IF EXISTS "Directores gestionan tipos de documento" ON public.advisor_doc_templates;
CREATE POLICY "Directores gestionan tipos de documento"
  ON public.advisor_doc_templates FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'director'
      AND p.agency_id = advisor_doc_templates.agency_id
  ));

-- Plantillas personalizadas: el director gestiona las de su agencia.
DROP POLICY IF EXISTS "Directores gestionan documentos de sus asesores" ON public.advisor_documents;
CREATE POLICY "Directores gestionan documentos de sus asesores"
  ON public.advisor_documents FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'director'
      AND p.agency_id = advisor_documents.agency_id
  ));

-- ...y el asesor LEE los suyos. Solo SELECT, y solo donde advisor_id sea él.
DROP POLICY IF EXISTS "El asesor ve sus propios documentos" ON public.advisor_documents;
CREATE POLICY "El asesor ve sus propios documentos"
  ON public.advisor_documents FOR SELECT
  USING (advisor_id = auth.uid());

-- Documentos de información: mismo criterio.
DROP POLICY IF EXISTS "Directores gestionan la info de sus asesores" ON public.advisor_info_documents;
CREATE POLICY "Directores gestionan la info de sus asesores"
  ON public.advisor_info_documents FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'director'
      AND p.agency_id = advisor_info_documents.agency_id
  ));

DROP POLICY IF EXISTS "El asesor ve su propia info" ON public.advisor_info_documents;
CREATE POLICY "El asesor ve su propia info"
  ON public.advisor_info_documents FOR SELECT
  USING (advisor_id = auth.uid());
