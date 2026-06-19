-- Inscribe (en un solo INSERT...SELECT) los contactos del segmento de una campaña
-- como destinatarios 'pending'. Eficiente para bases grandes (15k+).
-- security definer + chequeo de que el llamador es director de la agencia de la campaña.

CREATE OR REPLACE FUNCTION public.enroll_campaign_recipients(p_campaign_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency uuid;
  v_clasif text;
  v_count int;
BEGIN
  SELECT agency_id, audience_clasificacion INTO v_agency, v_clasif
  FROM public.wa_campaigns WHERE id = p_campaign_id;

  IF v_agency IS NULL THEN
    RETURN 0;
  END IF;

  -- Solo el director de la agencia de la campaña puede inscribir.
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
  RETURN v_count;
END;
$$;
