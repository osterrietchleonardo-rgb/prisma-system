-- Al inscribir una campaña, además de crear los destinatarios, marca a cada contacto
-- del segmento como 'en_cola' en wa_contacts.campaign_statuses[plantilla], para que en la
-- solapa "Contactos" se distingan los que entran en la campaña (EN COLA) de los vacíos.
-- No pisa estados finales ('enviado'/'sent'/'error') de un envío previo de esa plantilla.

CREATE OR REPLACE FUNCTION public.enroll_campaign_recipients(p_campaign_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency uuid;
  v_clasif text;
  v_template text;
  v_count int;
BEGIN
  SELECT agency_id, audience_clasificacion, template_name
    INTO v_agency, v_clasif, v_template
  FROM public.wa_campaigns WHERE id = p_campaign_id;

  IF v_agency IS NULL THEN
    RETURN 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'director' AND p.agency_id = v_agency
  ) THEN
    RAISE EXCEPTION 'no autorizado';
  END IF;

  INSERT INTO public.wa_campaign_recipients (campaign_id, agency_id, contact_id, phone, name, status)
  SELECT p_campaign_id, c.agency_id, c.id, c.phone, c.name, 'pending'
  FROM public.wa_contacts c
  WHERE c.agency_id = v_agency
    AND c.phone IS NOT NULL AND c.phone <> ''
    AND (v_clasif IS NULL OR c.clasificacion = v_clasif)
  ON CONFLICT (campaign_id, phone) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Marcar EN COLA en la agenda (visible en la solapa Contactos), sin pisar finales.
  UPDATE public.wa_contacts c
  SET campaign_statuses = coalesce(c.campaign_statuses, '{}'::jsonb)
        || jsonb_build_object(v_template, jsonb_build_object('status', 'en_cola'))
  WHERE c.agency_id = v_agency
    AND c.phone IS NOT NULL AND c.phone <> ''
    AND (v_clasif IS NULL OR c.clasificacion = v_clasif)
    AND coalesce(c.campaign_statuses -> v_template ->> 'status', '') NOT IN ('enviado', 'sent', 'error');

  RETURN v_count;
END;
$$;
