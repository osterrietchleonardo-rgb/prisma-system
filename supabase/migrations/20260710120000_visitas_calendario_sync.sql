-- Fase 1: Sincronización calendario (scheduled_visits) -> wa_conversations
-- El calendario es la ÚNICA fuente de verdad de visit_status / visit_scheduled_at / visit_address.

-- 1) Ampliar los estados válidos de la visita.
--    Antes: agendada | cancelada | reprogramada. Se agregan: confirmada | realizada | no_asistio.
ALTER TABLE public.scheduled_visits
  DROP CONSTRAINT IF EXISTS scheduled_visits_estado_visita_check;
ALTER TABLE public.scheduled_visits
  ADD CONSTRAINT scheduled_visits_estado_visita_check
  CHECK (estado_visita = ANY (ARRAY[
    'agendada'::text, 'reprogramada'::text, 'confirmada'::text,
    'realizada'::text, 'no_asistio'::text, 'cancelada'::text
  ]));

-- 2) Nueva columna: dirección de la visita para el recordatorio ({{3}} de la plantilla)
ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS visit_address text;

COMMENT ON COLUMN public.wa_conversations.visit_address IS
  'Dirección/ubicación de la visita agendada, sincronizada desde scheduled_visits por trigger. NULL si no hay visita activa.';

-- 3) Función de sincronización
CREATE OR REPLACE FUNCTION public.sync_visit_to_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row        public.scheduled_visits;
  v_phone      text;
  v_status     text;
  v_scheduled  timestamptz;
  v_address    text;
BEGIN
  -- Fila efectiva según la operación
  IF (TG_OP = 'DELETE') THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;

  v_phone := regexp_replace(COALESCE(v_row.lead_id, ''), '\D', '', 'g');
  IF v_phone = '' OR v_row.agency_id IS NULL THEN
    RETURN NULL; -- nada que sincronizar
  END IF;

  -- Timestamp de la visita en zona AR
  v_scheduled := (v_row.fecha_visita + v_row.hora_visita) AT TIME ZONE 'America/Argentina/Buenos_Aires';

  -- Dirección: título de propiedad, fallback a zona
  v_address := NULLIF(btrim(COALESCE(v_row.propiedad_titulo, v_row.zona_propiedad, '')), '');

  -- Estado efectivo: DELETE se trata como cancelada; se normaliza a minúsculas
  IF (TG_OP = 'DELETE') THEN
    v_status := 'cancelada';
  ELSE
    v_status := lower(coalesce(v_row.estado_visita, ''));
  END IF;

  IF v_status IN ('agendada', 'reprogramada') THEN
    -- Visita activa esperando confirmación: (re)arma recordatorios
    UPDATE public.wa_conversations wc SET
      visit_status = 'scheduled',
      visit_scheduled_at = v_scheduled,
      visit_address = v_address,
      requires_follow_up = false,
      visit_reminder_24h_sent = false,
      visit_reminder_3h_sent = false,
      visit_reminder_1h_sent = false
    WHERE wc.agency_id = v_row.agency_id
      AND regexp_replace(wc.contact_phone, '\D', '', 'g') = v_phone;

  ELSIF v_status = 'confirmada' THEN
    -- El cliente confirmó: dejan de perseguirse recordatorios
    UPDATE public.wa_conversations wc SET
      visit_status = 'confirmed',
      visit_scheduled_at = v_scheduled,
      visit_address = v_address,
      requires_follow_up = false
    WHERE wc.agency_id = v_row.agency_id
      AND regexp_replace(wc.contact_phone, '\D', '', 'g') = v_phone;

  ELSIF v_status = 'realizada' THEN
    UPDATE public.wa_conversations wc SET
      visit_status = 'completed',
      requires_follow_up = false
    WHERE wc.agency_id = v_row.agency_id
      AND regexp_replace(wc.contact_phone, '\D', '', 'g') = v_phone;

  ELSIF v_status = 'no_asistio' THEN
    -- El cliente confirmó pero no fue: se reactivan los seguimientos por inactividad
    UPDATE public.wa_conversations wc SET
      visit_status = 'no_show',
      requires_follow_up = true,
      next_follow_up_at = now(),
      visit_reminder_24h_sent = false,
      visit_reminder_3h_sent = false,
      visit_reminder_1h_sent = false
    WHERE wc.agency_id = v_row.agency_id
      AND regexp_replace(wc.contact_phone, '\D', '', 'g') = v_phone;

  ELSIF v_status IN ('cancelada', 'cancelado') THEN
    UPDATE public.wa_conversations wc SET
      visit_status = 'cancelled',
      visit_scheduled_at = null,
      visit_address = null,
      requires_follow_up = true,
      next_follow_up_at = now(),
      visit_reminder_24h_sent = false,
      visit_reminder_3h_sent = false,
      visit_reminder_1h_sent = false
    WHERE wc.agency_id = v_row.agency_id
      AND regexp_replace(wc.contact_phone, '\D', '', 'g') = v_phone;

  ELSE
    -- Estado desconocido: no tocar nada (seguro ante valores inesperados)
    RETURN NULL;
  END IF;

  RETURN NULL; -- AFTER trigger, el valor de retorno se ignora
END;
$$;

-- 4) Trigger
DROP TRIGGER IF EXISTS trg_sync_visit_to_conversation ON public.scheduled_visits;
CREATE TRIGGER trg_sync_visit_to_conversation
  AFTER INSERT OR UPDATE OR DELETE ON public.scheduled_visits
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_visit_to_conversation();
