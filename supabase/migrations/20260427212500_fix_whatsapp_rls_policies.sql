-- Migration: fix_whatsapp_rls_policies
-- Created at: 2026-04-27
-- Description: Modernize WhatsApp RLS policies to use EXISTS pattern for reliable agency-wide access for Directors.

-- Enable RLS on all relevant tables (just in case)
ALTER TABLE whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_contacts ENABLE ROW LEVEL SECURITY;

-- Cleanup existing policies
DROP POLICY IF EXISTS "director_only_whatsapp_instances" ON whatsapp_instances;
DROP POLICY IF EXISTS "advisor_access_wa_conversations" ON wa_conversations;
DROP POLICY IF EXISTS "director_all_wa_conversations" ON wa_conversations;
DROP POLICY IF EXISTS "wa_messages_access_policy" ON wa_messages;
DROP POLICY IF EXISTS "agencies_own_wa_contacts" ON wa_contacts;

-- ==========================================
-- WHATSAPP_INSTANCES
-- ==========================================

-- Everyone in the agency can SEE the instance (needed for the inbox to load)
CREATE POLICY "whatsapp_instances_agency_select" ON whatsapp_instances
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.agency_id = whatsapp_instances.agency_id
  )
);

-- Only directors can MANAGE the instance
CREATE POLICY "whatsapp_instances_director_all" ON whatsapp_instances
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.role = 'director'
    AND p.agency_id = whatsapp_instances.agency_id
  )
);

-- ==========================================
-- WA_CONVERSATIONS
-- ==========================================

-- Advisors can see/manage conversations assigned to them OR where they are in the same agency and are directors
CREATE POLICY "wa_conversations_access_policy" ON wa_conversations
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.agency_id = wa_conversations.agency_id
    AND (
      p.role = 'director' OR 
      wa_conversations.agent_id = auth.uid()
    )
  )
);

-- ==========================================
-- WA_MESSAGES
-- ==========================================

-- Access messages if you have access to the conversation
CREATE POLICY "wa_messages_access_policy" ON wa_messages
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.agency_id = wa_messages.agency_id
    AND (
      p.role = 'director' OR 
      EXISTS (
        SELECT 1 FROM wa_conversations c
        WHERE c.id = wa_messages.conversation_id
        AND c.agent_id = auth.uid()
      )
    )
  )
);

-- ==========================================
-- WA_CONTACTS
-- ==========================================

-- Access contacts in your agency
CREATE POLICY "wa_contacts_agency_access" ON wa_contacts
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.agency_id = wa_contacts.agency_id
  )
);
