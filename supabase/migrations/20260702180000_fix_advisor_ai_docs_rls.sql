-- Fix: Advisors could not see documents marked as visibility='director' + ai_enabled=true
-- The RLS policy "Advisors can view shared docs" only allowed visibility='asesor' OR role='director'
-- This blocked the entire "share private content via Tutor IA" feature for advisors.
-- Adding the third OR condition: (visibility='director' AND ai_enabled=true)

DROP POLICY IF EXISTS "Advisors can view shared docs" ON agency_documents;
CREATE POLICY "Advisors can view shared docs" ON agency_documents FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.agency_id = agency_documents.agency_id
      AND (
        agency_documents.visibility = 'asesor'
        OR profiles.role = 'director'
        OR (agency_documents.visibility = 'director' AND agency_documents.ai_enabled = true)
      )
  )
);
