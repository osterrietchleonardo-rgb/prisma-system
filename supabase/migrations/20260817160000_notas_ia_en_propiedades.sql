-- ─────────────────────────────────────────────────────────────
-- Notas internas por propiedad para el Asesor IA de WhatsApp.
--
-- Las escriben los asesores (solo en SUS propiedades asignadas) y
-- los directores (en cualquiera de su agencia). El agente de
-- WhatsApp las recibe como contexto y SOLO las usa si el cliente
-- pregunta por ese tema; nunca las menciona por su cuenta.
--
-- Columna nueva y AISLADA, igual que ai_description: el sync de
-- Tokko (lib/tokko-sync.ts) hace upsert enviando unicamente las
-- columnas que mapea desde Tokko, asi que NUNCA pisa esta columna.
--
-- Estructura del jsonb notas_ia: array de notas, la mas reciente
-- primero.
-- [
--   {
--     "id":           "uuid de la nota (lo genera la API)",
--     "texto":        "lo que escribio el asesor (max 800 chars)",
--     "autor_id":     "uuid del usuario",
--     "autor_nombre": "Nombre Apellido",
--     "autor_rol":    "asesor | director",
--     "creado_at":    "timestamp ISO",
--     "editado_at":   "timestamp ISO (solo si se edito)",
--     "editado_por":  "uuid del usuario que edito (solo si se edito)"
--   }
-- ]
-- Topes que controla la API: 800 caracteres por nota, 20 notas por
-- propiedad.
-- ─────────────────────────────────────────────────────────────

alter table public.properties
  add column if not exists notas_ia jsonb not null default '[]'::jsonb;

comment on column public.properties.notas_ia is
  'Notas internas que el equipo carga para el Asesor IA de WhatsApp. Array jsonb, mas reciente primero. El sync de Tokko no la toca.';
