-- Migration: Secure RLS policies for activities, visits, and valuations + Fix chat histories isolation
-- Created: 2026-05-12

-- 1. Policy for Valuations
-- Pattern: filter by agency_id and check role/agent_id
CREATE POLICY "valuations_isolation_policy" ON public.valuations
FOR ALL TO authenticated
USING (
  agency_id = get_my_agency_id() 
  AND (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'director'
    OR agent_id = auth.uid()
  )
)
WITH CHECK (
  agency_id = get_my_agency_id()
  AND agent_id = auth.uid()
);

-- 2. Policy for Lead Activities
-- Pattern: Join with leads table to verify agency_id
CREATE POLICY "lead_activities_isolation_policy" ON public.lead_activities
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM leads l
    WHERE l.id = lead_activities.lead_id 
    AND l.agency_id = get_my_agency_id()
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) = 'director'
      OR l.assigned_agent_id = auth.uid()
      OR lead_activities.agent_id = auth.uid()
    )
  )
)
WITH CHECK (agent_id = auth.uid());

-- 3. Policy for Visits
-- Pattern: Join with leads table to verify agency_id
CREATE POLICY "visits_isolation_policy" ON public.visits
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM leads l
    WHERE l.id = visits.lead_id 
    AND l.agency_id = get_my_agency_id()
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) = 'director'
      OR l.assigned_agent_id = auth.uid()
      OR visits.agent_id = auth.uid()
    )
  )
)
WITH CHECK (agent_id = auth.uid());

-- 4. Fix n8n_chat_histories
-- Remove insecure 'Enable all' policy
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.n8n_chat_histories;

-- Add granular isolation policy
CREATE POLICY "n8n_chat_histories_isolation_policy" ON public.n8n_chat_histories
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM wa_conversations c
    WHERE c.id::text = n8n_chat_histories.session_id
    AND c.agency_id = get_my_agency_id()
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) = 'director'
      OR c.agent_id = auth.uid()
    )
  )
);
