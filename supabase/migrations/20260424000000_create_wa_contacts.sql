-- Create wa_contacts table for WhatsApp Campaigns
CREATE TABLE wa_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  phone text NOT NULL,
  name text,
  metadata jsonb DEFAULT '{}'::jsonb,
  tags text[],
  last_campaign_status text,
  last_campaign_template text,
  last_campaign_sent_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(agency_id, phone)
);

CREATE INDEX idx_wa_contacts_agency ON wa_contacts(agency_id);

CREATE OR REPLACE FUNCTION update_wa_contacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER wa_contacts_updated_at
  BEFORE UPDATE ON wa_contacts
  FOR EACH ROW EXECUTE FUNCTION update_wa_contacts_updated_at();

ALTER TABLE wa_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agencies_own_wa_contacts" ON wa_contacts
  FOR ALL USING (agency_id IN (
    SELECT agency_id FROM profiles WHERE id = auth.uid()
  ));
