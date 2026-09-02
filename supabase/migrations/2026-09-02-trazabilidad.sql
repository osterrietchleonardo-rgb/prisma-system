-- ═══════════════════════════════════════════════════════════════════════════════
-- TRAZABILIDAD DEL EQUIPO — el evento de visita que faltaba en la bitácora
-- (pedido de Kevin 2/9/2026: ver cada acción del asesor sobre cada cliente)
--
-- scheduled_visits es la fuente de verdad de las visitas (migración 20260710120000).
-- Este trigger APARTE deja constancia en lead_eventos de cada movimiento del calendario:
-- agendada, reprogramada, confirmada, realizada, no asistió, cancelada.
--
-- Aditiva. Rollback:
--   drop trigger if exists trg_log_visita_lead_eventos on public.scheduled_visits;
--   drop function if exists public.log_visita_en_lead_eventos();
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.log_visita_en_lead_eventos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row     public.scheduled_visits;
  v_phone   text;
  v_estado  text;
  v_tipo    text;
  v_desc    text;
  v_conv_id uuid;
  v_lugar   text;
  v_cuando  text;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    v_row := OLD;
    v_estado := 'borrada';
  ELSE
    v_row := NEW;
    v_estado := lower(coalesce(v_row.estado_visita, ''));
    -- En un UPDATE solo interesa el cambio de estado (no un retoque de hora o título)
    IF (TG_OP = 'UPDATE') AND lower(coalesce(OLD.estado_visita, '')) = v_estado THEN
      RETURN NULL;
    END IF;
  END IF;

  v_phone := regexp_replace(COALESCE(v_row.lead_id, ''), '\D', '', 'g');
  IF v_phone = '' OR v_row.agency_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- La bitácora vive por conversación: sin conversación no hay dónde anotar.
  SELECT wc.id INTO v_conv_id
  FROM public.wa_conversations wc
  WHERE wc.agency_id = v_row.agency_id
    AND regexp_replace(wc.contact_phone, '\D', '', 'g') = v_phone
  ORDER BY wc.last_message_at DESC NULLS LAST
  LIMIT 1;
  IF v_conv_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_lugar  := NULLIF(btrim(COALESCE(v_row.propiedad_titulo, v_row.zona_propiedad, '')), '');
  v_cuando := to_char(v_row.fecha_visita, 'DD/MM') || ' ' || to_char(v_row.hora_visita, 'HH24:MI');

  v_tipo := CASE v_estado
    WHEN 'agendada'     THEN 'visita_agendada'
    WHEN 'reprogramada' THEN 'visita_reprogramada'
    WHEN 'confirmada'   THEN 'visita_confirmada'
    WHEN 'realizada'    THEN 'visita_realizada'
    WHEN 'no_asistio'   THEN 'visita_no_asistio'
    WHEN 'cancelada'    THEN 'visita_cancelada'
    WHEN 'borrada'      THEN 'visita_cancelada'
    ELSE NULL
  END;
  IF v_tipo IS NULL THEN
    RETURN NULL; -- estado desconocido: no inventar eventos
  END IF;

  v_desc := CASE v_tipo
    WHEN 'visita_agendada'     THEN 'Visita agendada para el ' || v_cuando
    WHEN 'visita_reprogramada' THEN 'Visita reprogramada para el ' || v_cuando
    WHEN 'visita_confirmada'   THEN 'El cliente confirmó la visita del ' || v_cuando
    WHEN 'visita_realizada'    THEN 'Visita realizada (' || v_cuando || ')'
    WHEN 'visita_no_asistio'   THEN 'El cliente no asistió a la visita del ' || v_cuando
    ELSE 'Visita cancelada (' || v_cuando || ')'
  END || COALESCE(' — ' || v_lugar, '');

  INSERT INTO public.lead_eventos (agency_id, conversation_id, tipo, actor, descripcion, datos)
  VALUES (
    v_row.agency_id, v_conv_id, v_tipo, 'calendario', v_desc,
    jsonb_build_object(
      'visita_id',   v_row.id,
      'estado',      v_estado,
      'agent_id',    v_row.agent_id,
      'fecha',       v_row.fecha_visita,
      'hora',        v_row.hora_visita,
      'lugar',       v_lugar
    )
  );

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- La bitácora jamás puede voltear la operación real del calendario.
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_visita_lead_eventos ON public.scheduled_visits;
CREATE TRIGGER trg_log_visita_lead_eventos
  AFTER INSERT OR UPDATE OR DELETE ON public.scheduled_visits
  FOR EACH ROW
  EXECUTE FUNCTION public.log_visita_en_lead_eventos();
