-- ─────────────────────────────────────────────────────────────
-- La columna donde va el documento GENERADO de cada asesor.
--
-- El problema que resuelve, y por qué es lo primero de la Task 7a: hoy
-- `advisor_documents` tiene una sola ruta de archivo, `archivo_original_path`,
-- y esa ruta es **el .docx que subió el director**. Contra ese archivo compara
-- toda la red de seguridad de la Etapa C (`verificarDocumentoEntero`, spec
-- §7.3): es la única fuente de verdad que tiene el sistema para saber si la
-- plantilla está bien armada.
--
-- Cuando la Task 7b aplique una versión nueva y regenere el documento de cada
-- asesor, ese documento generado NO puede escribirse encima de
-- `archivo_original_path`. Si se pisara, la próxima comprobación compararía la
-- plantilla contra un archivo que salió de la plantilla misma: daría verde
-- siempre, contra cualquier error. El spec §8.4 ya lo tenía previsto y lista
-- las dos columnas por separado ("`archivo_original_path` — el .docx que subió
-- el director" y "`docx_path` — el generado"); la migración de la Etapa B
-- (20260826120000_documentos_por_asesor.sql) creó solo la primera.
--
-- Verificado contra producción el 2026-08-31, ANTES de escribir esta
-- migración, por la Management API sobre `information_schema.columns`:
--   · public.advisor_documents tiene 14 columnas y `docx_path` NO es una de
--     ellas. Sí están `archivo_original_path` (text NOT NULL) y `version_id`.
--   · La tabla tiene 6 filas. Agregar una columna NULLABLE no puede fallar por
--     datos viejos, y no reescribe la tabla (Postgres ≥ 11).
--   · `advisor_documents_estado_check` acepta NULL, 'ok', 'revisar' y
--     'pendiente' — o sea que el `pendiente` del spec §7.4.2 ya entra sin
--     tocar nada acá.
--
-- Qué cambia: UNA columna nullable. Nada existente se modifica, se mueve ni se
-- borra. Es idempotente.
--
-- Qué NO cambia, a propósito: no se le pone NOT NULL ni un default. Un
-- documento cuyo `docx_path` es NULL es un documento que todavía nunca se
-- regeneró desde la plantilla, y eso es exactamente lo que hoy son los 6 que
-- hay. Un default vacío lo haría indistinguible de uno generado.
--
-- Cómo se deshace, si hiciera falta:
--   ALTER TABLE public.advisor_documents DROP COLUMN IF EXISTS docx_path;
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.advisor_documents
  ADD COLUMN IF NOT EXISTS docx_path text;

COMMENT ON COLUMN public.advisor_documents.docx_path
  IS 'El .docx GENERADO a partir de la plantilla. NULL = todavía no se generó. Nunca pisa a archivo_original_path, que es el archivo que subió el director y contra el que compara la verificación.';
