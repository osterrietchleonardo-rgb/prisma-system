-- ─────────────────────────────────────────────────────────────
-- Versionado de las plantillas de documentos por asesor (Etapa C).
--
-- El problema que resuelve: hoy, para cambiar la versión de un contrato, el
-- director tiene que volver a subirlo asesor por asesor. Con esto, guarda el
-- molde una vez y el sistema regenera el documento de cada asesor conservando
-- sus datos personalizados.
--
-- Verificado contra producción el 2026-08-26, ANTES de escribir esta migración:
--   · advisor_doc_template_versions NO existe todavía.
--   · advisor_doc_templates NO tiene la columna version_actual.
--   · advisor_documents.version_id ya existe (uuid, nullable) pero SIN clave
--     foránea: no podía tenerla, la tabla de versiones no existía cuando se
--     creó en la Etapa B.
--   · advisor_documents tiene 1 fila y version_id no nulos: 0. Por eso agregar
--     la restricción no puede fallar por datos viejos -- está medido, no
--     supuesto.
--
-- Qué cambia: una tabla nueva vacía y una columna nullable. Nada existente se
-- modifica ni se borra. Es idempotente.
--
-- Cómo se deshace, si hiciera falta:
--   ALTER TABLE public.advisor_documents      DROP CONSTRAINT IF EXISTS advisor_documents_version_id_fkey;
--   ALTER TABLE public.advisor_doc_templates  DROP COLUMN IF EXISTS version_actual;
--   DROP TABLE IF EXISTS public.advisor_doc_template_versions;
-- ─────────────────────────────────────────────────────────────

-- ── 1. Cada versión de la plantilla ──────────────────────────
-- Las viejas NO se borran nunca: de acá sale el poder volver atrás.
CREATE TABLE IF NOT EXISTS public.advisor_doc_template_versions (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id   uuid NOT NULL REFERENCES public.advisor_doc_templates(id) ON DELETE CASCADE,
    agency_id     uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
    version       integer NOT NULL,
    docx_path     text NOT NULL,        -- el molde con los {{huecos}}
    campos_schema jsonb NOT NULL,       -- [{ nombre, label, orden }]
    origen        text NOT NULL DEFAULT 'detectada' CHECK (origen IN ('detectada','subida')),
    notas         text,
    created_by    uuid REFERENCES public.profiles(id),
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS advisor_doc_template_versions_unica
    ON public.advisor_doc_template_versions (template_id, version);
CREATE INDEX IF NOT EXISTS advisor_doc_template_versions_agency_idx
    ON public.advisor_doc_template_versions (agency_id);

-- ── 2. A qué versión apunta hoy cada plantilla ───────────────
-- El plan decía `integer` (el NÚMERO de versión). Va uuid, apuntando a la fila:
-- un número suelto puede quedar en 7 sin que exista ninguna versión 7, y nadie
-- se entera hasta que alguien intenta regenerar un contrato. Con la clave
-- foránea, apuntar a algo que no existe es imposible. Es el mismo criterio con
-- el que abajo se le pone la restricción que le faltaba a advisor_documents.
--
-- ON DELETE SET NULL, nunca CASCADE: si algún día se borrara una versión, la
-- plantilla queda SIN versión actual y el director lo ve. Borrar la plantilla
-- entera porque se borró una versión sería pérdida de datos.
ALTER TABLE public.advisor_doc_templates
  ADD COLUMN IF NOT EXISTS version_actual uuid;

ALTER TABLE public.advisor_doc_templates
  DROP CONSTRAINT IF EXISTS advisor_doc_templates_version_actual_fkey;
ALTER TABLE public.advisor_doc_templates
  ADD CONSTRAINT advisor_doc_templates_version_actual_fkey
  FOREIGN KEY (version_actual)
  REFERENCES public.advisor_doc_template_versions(id) ON DELETE SET NULL;

-- ── 3. La restricción que le faltaba al documento del asesor ─
-- advisor_documents.version_id venía siendo un uuid suelto que no apuntaba a
-- nada verificado. Ahora que la tabla de versiones existe, se lo ata.
-- ON DELETE SET NULL por lo mismo: el documento del asesor NO se borra porque
-- se haya borrado una plantilla; se queda sin versión y se ve.
ALTER TABLE public.advisor_documents
  DROP CONSTRAINT IF EXISTS advisor_documents_version_id_fkey;
ALTER TABLE public.advisor_documents
  ADD CONSTRAINT advisor_documents_version_id_fkey
  FOREIGN KEY (version_id)
  REFERENCES public.advisor_doc_template_versions(id) ON DELETE SET NULL;

-- ── 4. Quién puede ver y tocar esto ──────────────────────────
ALTER TABLE public.advisor_doc_template_versions ENABLE ROW LEVEL SECURITY;

-- Solo el director de SU agencia. El asesor nunca ve las versiones (spec §8.7):
-- ve su documento terminado, no el molde ni el historial.
--
-- El WITH CHECK va explícito, a diferencia de las políticas de la Etapa B.
-- Postgres lo deriva solo del USING, pero escribirlo evita que alguien cambie
-- el USING mañana y deje la escritura abierta sin darse cuenta.
DROP POLICY IF EXISTS "Directores gestionan versiones de plantilla" ON public.advisor_doc_template_versions;
CREATE POLICY "Directores gestionan versiones de plantilla"
  ON public.advisor_doc_template_versions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'director'
      AND p.agency_id = advisor_doc_template_versions.agency_id
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'director'
      AND p.agency_id = advisor_doc_template_versions.agency_id
  ));

COMMENT ON TABLE public.advisor_doc_template_versions
  IS 'Cada versión del molde de un tipo de documento. Las viejas no se borran: son el camino de vuelta.';
COMMENT ON COLUMN public.advisor_doc_templates.version_actual
  IS 'La versión vigente hoy. NULL = la plantilla todavía no tiene ninguna.';
