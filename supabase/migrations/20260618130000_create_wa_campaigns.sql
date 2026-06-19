-- ============================================================================
-- Campañas masivas de WhatsApp con goteo diario (drip) respetando el límite de Meta.
-- - wa_campaigns: definición persistente de la campaña (plantilla, segmento, límite).
-- - wa_campaign_recipients: un registro por destinatario, con estado de envío.
--   Esto da idempotencia (no se reenvía a 'sent') y permite contar el envío diario.
-- El cron procesa las campañas 'active' y manda hasta el límite diario por día.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.wa_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  name text NOT NULL,
  template_name text NOT NULL,
  template_language text NOT NULL DEFAULT 'es_AR',
  variable_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  audience_clasificacion text,          -- segmento por clasificación (NULL = todos los contactos)
  daily_limit int,                      -- NULL = usar el tier de Meta de la instancia
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wa_campaigns_agency_status_idx
  ON public.wa_campaigns (agency_id, status);

CREATE TABLE IF NOT EXISTS public.wa_campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.wa_campaigns(id) ON DELETE CASCADE,
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.wa_contacts(id) ON DELETE SET NULL,
  phone text NOT NULL,
  name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'error', 'skipped')),
  sent_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, phone)
);

CREATE INDEX IF NOT EXISTS wa_campaign_recipients_campaign_status_idx
  ON public.wa_campaign_recipients (campaign_id, status);
CREATE INDEX IF NOT EXISTS wa_campaign_recipients_campaign_sentat_idx
  ON public.wa_campaign_recipients (campaign_id, sent_at);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.wa_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_campaign_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_campaigns_select" ON public.wa_campaigns;
DROP POLICY IF EXISTS "wa_campaigns_director_write" ON public.wa_campaigns;
DROP POLICY IF EXISTS "wa_campaign_recipients_select" ON public.wa_campaign_recipients;
DROP POLICY IF EXISTS "wa_campaign_recipients_director_write" ON public.wa_campaign_recipients;

-- SELECT: cualquiera de la agencia ve las campañas de su agencia.
CREATE POLICY "wa_campaigns_select" ON public.wa_campaigns
FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.agency_id = wa_campaigns.agency_id)
);

-- INSERT/UPDATE/DELETE: solo el director de la agencia.
CREATE POLICY "wa_campaigns_director_write" ON public.wa_campaigns
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'director' AND p.agency_id = wa_campaigns.agency_id)
);

CREATE POLICY "wa_campaign_recipients_select" ON public.wa_campaign_recipients
FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.agency_id = wa_campaign_recipients.agency_id)
);

CREATE POLICY "wa_campaign_recipients_director_write" ON public.wa_campaign_recipients
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'director' AND p.agency_id = wa_campaign_recipients.agency_id)
);
