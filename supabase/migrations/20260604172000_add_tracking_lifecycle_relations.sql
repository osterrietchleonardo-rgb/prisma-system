ALTER TABLE public.performance_logs
ADD COLUMN property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
ADD COLUMN lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
ADD COLUMN wa_contact_id uuid REFERENCES public.wa_contacts(id) ON DELETE SET NULL;

CREATE INDEX idx_performance_logs_property_id ON public.performance_logs(property_id);
CREATE INDEX idx_performance_logs_lead_id ON public.performance_logs(lead_id);
CREATE INDEX idx_performance_logs_wa_contact_id ON public.performance_logs(wa_contact_id);
