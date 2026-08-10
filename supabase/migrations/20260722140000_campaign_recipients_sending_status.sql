-- ============================================================================
-- Estado 'sending' para wa_campaign_recipients.
--
-- Por qué: el motor de goteo mandaba la plantilla a Meta y RECIÉN DESPUÉS marcaba
-- el destinatario como 'sent'. Si la corrida se moría en el medio (la función se
-- corta a los 300s) o el marcado fallaba, el lead quedaba 'pending' con la plantilla
-- ya entregada, y la corrida siguiente se la volvía a mandar.
-- Con 'sending' el destinatario se RESERVA antes de mandar: si la corrida se corta,
-- la fila queda en 'sending' y nadie la vuelve a tomar (mejor no enviar que enviar dos veces).
-- ============================================================================

ALTER TABLE public.wa_campaign_recipients
  DROP CONSTRAINT IF EXISTS wa_campaign_recipients_status_check;

ALTER TABLE public.wa_campaign_recipients
  ADD CONSTRAINT wa_campaign_recipients_status_check
  CHECK (status IN ('pending', 'sending', 'sent', 'error', 'skipped'));

-- Cuándo se reservó la fila. Sirve para ver a simple vista las que quedaron
-- colgadas en 'sending' (corrida cortada) sin confundirlas con envíos buenos.
ALTER TABLE public.wa_campaign_recipients
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
