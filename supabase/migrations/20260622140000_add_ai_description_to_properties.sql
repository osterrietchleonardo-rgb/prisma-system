-- ─────────────────────────────────────────────────────────────
-- Descripción mejorada con IA para propiedades.
-- Se guarda en una columna nueva y aislada: el sync de Tokko
-- (lib/tokko-sync.ts) NUNCA toca ai_description, así que la
-- descripción original (column "description") puede seguir
-- pisándose desde Tokko sin perder la versión generada por IA.
--
-- Estructura del jsonb ai_description:
-- {
--   "v1":          "texto generado base",
--   "v2":          "texto refinado con sugerencia",
--   "suggestion":  "sugerencia que el usuario dio para la v2",
--   "model":       "gemini-3.5-flash",
--   "v1_by":       "uuid del usuario", "v1_at": "timestamp",
--   "v2_by":       "uuid del usuario", "v2_at": "timestamp"
-- }
-- Tope estricto: solo v1 y v2 por propiedad (se controla en la API).
-- ─────────────────────────────────────────────────────────────

alter table public.properties
  add column if not exists ai_description jsonb default '{}'::jsonb;
