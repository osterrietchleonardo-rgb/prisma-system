-- ============================================================================
-- Estado real de entrega de los mensajes SALIENTES de WhatsApp.
--
-- Problema que resuelve: hasta ahora Prisma mostraba un mensaje como "enviado"
-- apenas guardaba la fila, sin saber si Meta lo entregó de verdad. Con el número
-- en calidad ROJA, Meta acepta el mensaje (devuelve wamid) pero lo DESCARTA en
-- silencio, y el asesor no se entera de que el lead nunca lo recibió.
--
-- Estos campos guardan el estado que Meta reporta por webhook (vía Evolution
-- MESSAGES_UPDATE o el webhook directo de Meta), para poder mostrar en el chat:
--   ✓ enviado · ✓✓ entregado · 👁 leído · ✗ NO ENTREGÓ (con el motivo).
-- ============================================================================

-- pending  : guardado, todavía sin confirmación de Meta (estado inicial)
-- sent     : Meta lo aceptó y salió del servidor
-- delivered: llegó al teléfono del destinatario
-- read     : el destinatario lo abrió
-- failed   : Meta NO lo entregó (acá va el motivo en status_error)
ALTER TABLE public.wa_messages
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS status_error text,
  ADD COLUMN IF NOT EXISTS status_at timestamptz;

-- Los webhooks buscan el mensaje por su wamid para actualizarle el estado.
-- Sin índice, cada actualización de estado escanearía toda la tabla.
CREATE INDEX IF NOT EXISTS wa_messages_wamid_idx
  ON public.wa_messages (wamid)
  WHERE wamid IS NOT NULL;
