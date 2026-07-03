-- Migration: wa_contacts_por_asesor
-- Created at: 2026-07-03
-- Description:
--   La solapa "Contactos" mostraba TODOS los contactos de la agencia a
--   cualquier asesor (la RLS solo filtraba por agency_id). Ahora cada
--   contacto tiene dueño (agent_id) y la visibilidad se separa por asesor:
--     - Director: ve todos los contactos de su agencia.
--     - Asesor: ve solo los contactos donde agent_id = auth.uid().
--   Espeja la lógica ya existente de wa_conversations.

-- ==========================================
-- 1. Columna de dueño
-- ==========================================
ALTER TABLE wa_contacts
  ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wa_contacts_agent ON wa_contacts(agent_id);

-- ==========================================
-- 2. Backfill de los existentes
--    Si hay una conversación de la misma agencia con ese teléfono y un
--    agente asignado, ese asesor queda de dueño del contacto.
--    Los que no matchean quedan con agent_id = NULL => solo director.
-- ==========================================
UPDATE wa_contacts c
SET agent_id = v.agent_id
FROM wa_conversations v
WHERE v.agency_id = c.agency_id
  AND v.contact_phone = c.phone
  AND v.agent_id IS NOT NULL
  AND c.agent_id IS NULL;

-- ==========================================
-- 3. RLS: separar por asesor (espeja wa_conversations)
-- ==========================================
DROP POLICY IF EXISTS "wa_contacts_agency_access" ON wa_contacts;

CREATE POLICY "wa_contacts_access_policy" ON wa_contacts
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.agency_id = wa_contacts.agency_id
    AND (
      p.role = 'director' OR
      wa_contacts.agent_id = auth.uid()
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.agency_id = wa_contacts.agency_id
    AND (
      p.role = 'director' OR
      wa_contacts.agent_id = auth.uid()
    )
  )
);
