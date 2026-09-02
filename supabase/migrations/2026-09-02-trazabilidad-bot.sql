-- ═══════════════════════════════════════════════════════════════════════════════
-- TRAZABILIDAD — el prendido/apagado del bot como hecho de la bitácora (pedido 2/9)
--
-- bot_active vive en wa_conversations y lo tocan varios: el handoff de n8n lo apaga,
-- el panel lo prende o apaga a mano. Un trigger en la columna los ve a TODOS.
-- Solo el cambio real (OLD distinto de NEW): los mil updates de last_message_at no pasan.
--
-- Aditiva. Rollback:
--   drop trigger if exists trg_log_bot_lead_eventos on public.wa_conversations;
--   drop function if exists public.log_bot_en_lead_eventos();
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.log_bot_en_lead_eventos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.lead_eventos (agency_id, conversation_id, tipo, actor, descripcion, datos)
  VALUES (
    NEW.agency_id,
    NEW.id,
    CASE WHEN NEW.bot_active THEN 'bot_prendido' ELSE 'bot_apagado' END,
    'sistema',
    CASE WHEN NEW.bot_active
      THEN 'El bot volvió a atender este chat'
      ELSE 'El bot se apagó para este chat (lo sigue una persona)'
    END,
    jsonb_build_object('antes', OLD.bot_active, 'ahora', NEW.bot_active)
  );
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- La bitácora jamás puede voltear la operación real sobre la conversación.
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_bot_lead_eventos ON public.wa_conversations;
CREATE TRIGGER trg_log_bot_lead_eventos
  AFTER UPDATE OF bot_active ON public.wa_conversations
  FOR EACH ROW
  WHEN (OLD.bot_active IS DISTINCT FROM NEW.bot_active)
  EXECUTE FUNCTION public.log_bot_en_lead_eventos();
