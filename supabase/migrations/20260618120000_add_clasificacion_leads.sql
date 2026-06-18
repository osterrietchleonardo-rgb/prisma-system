-- Clasificación de origen del lead (Whatsapp-Consulta / Whatsapp-Manual / personalizada en import).
-- Columna nueva, nullable y sin default: los registros existentes quedan en NULL ("Sin clasificar").
-- Cambio aditivo y seguro: no afecta datos ni código existente.

ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS clasificacion text;

ALTER TABLE public.wa_contacts
  ADD COLUMN IF NOT EXISTS clasificacion text;

-- Índices para poder filtrar rápido por clasificación (tablas y campañas).
CREATE INDEX IF NOT EXISTS idx_wa_conversations_clasificacion
  ON public.wa_conversations (agency_id, clasificacion);

CREATE INDEX IF NOT EXISTS idx_wa_contacts_clasificacion
  ON public.wa_contacts (agency_id, clasificacion);
