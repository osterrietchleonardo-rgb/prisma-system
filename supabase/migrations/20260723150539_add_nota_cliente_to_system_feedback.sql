-- ─────────────────────────────────────────────────────────────
-- system_feedback suma `nota_cliente`.
--
-- Este archivo existía vacío (0 bytes) y sin versionar, mientras que la columna
-- SÍ estaba aplicada en producción. O sea: el cambio se hizo a mano y el archivo
-- que debía documentarlo quedó en blanco. Levantar la base desde cero no traía
-- la columna.
--
-- El contenido de abajo se escribió LEYENDO la definición real en producción el
-- 2026-08-26 (information_schema.columns): `nota_cliente text`, nullable, sin
-- default. No es una reconstrucción de memoria.
--
-- Es idempotente y no cambia nada donde la columna ya existe: en producción esta
-- migración no hace absolutamente nada. Sirve para que el repo refleje la
-- realidad y para que un entorno nuevo salga igual.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.system_feedback
  ADD COLUMN IF NOT EXISTS nota_cliente text;

COMMENT ON COLUMN public.system_feedback.nota_cliente
  IS 'Nota interna sobre el feedback, escrita del lado de Vakdor.';
