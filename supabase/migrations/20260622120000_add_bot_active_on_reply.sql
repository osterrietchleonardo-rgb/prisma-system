-- ============================================================================
-- Campañas: permitir que el director decida si los chats creados por una campaña
-- nacen con el bot IA prendido o apagado (ej: campañas de reclutamiento donde
-- el lead NO es un cliente y no se quiere que la IA le responda automáticamente).
--
-- Default true = comportamiento idéntico al actual (los chats de campaña ya se
-- creaban con bot_active = true). Solo afecta a chats NUEVOS creados por la campaña;
-- los chats ya existentes nunca se tocan.
-- ============================================================================

ALTER TABLE public.wa_campaigns
  ADD COLUMN IF NOT EXISTS bot_active_on_reply boolean NOT NULL DEFAULT true;
