-- Add extended fields for Tokko Leads
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS tokko_agent_phone TEXT,
ADD COLUMN IF NOT EXISTS tokko_property_operation TEXT,
ADD COLUMN IF NOT EXISTS tokko_property_location TEXT,
ADD COLUMN IF NOT EXISTS tokko_lead_status TEXT;

-- Update comments
COMMENT ON COLUMN public.leads.tokko_agent_phone IS 'Cell phone of the assigned agent in Tokko Broker';
COMMENT ON COLUMN public.leads.tokko_property_operation IS 'Operation type (e.g., Alquiler, Venta) from Tokko';
COMMENT ON COLUMN public.leads.tokko_property_location IS 'Full location string from Tokko';
COMMENT ON COLUMN public.leads.tokko_lead_status IS 'Official status from Tokko (e.g., Cerrado)';
