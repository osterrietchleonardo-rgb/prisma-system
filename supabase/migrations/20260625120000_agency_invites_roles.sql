-- ─────────────────────────────────────────────────────────────
-- Invitaciones por rol + visibilidad compartida entre directores
--
-- Cambios:
--  1) agency_invites suma `role` (director|asesor, default 'asesor')
--     y `invitee_name` (nombre del invitado, visible antes de usarse).
--  2) RLS: pasa de "solo el dueño (owner_id)" a "cualquier director
--     de la agencia" para ver y crear códigos. Así todos los directores
--     comparten la misma lista (usados y libres) y no se duplican invitaciones.
--
-- 100% retrocompatible:
--  - Códigos viejos quedan con role='asesor' (su comportamiento de siempre).
--  - El dueño sigue siendo director de su agencia, así que conserva el acceso.
--  - La política pública de validación por código se mantiene intacta.
-- ─────────────────────────────────────────────────────────────

-- 1) Columnas nuevas (aditivas)
ALTER TABLE public.agency_invites
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'asesor',
  ADD COLUMN IF NOT EXISTS invitee_name text;

-- Restricción de valores válidos para role (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.agency_invites'::regclass
      AND conname = 'agency_invites_role_check'
  ) THEN
    ALTER TABLE public.agency_invites
      ADD CONSTRAINT agency_invites_role_check
      CHECK (role IN ('director', 'asesor'));
  END IF;
END $$;

-- 2) RLS: de "solo dueño" a "cualquier director de la agencia"
DROP POLICY IF EXISTS "Directors can view invites for their agency"   ON public.agency_invites;
DROP POLICY IF EXISTS "Directors can create invites for their agency" ON public.agency_invites;

CREATE POLICY "Directores ven invites de su agencia"
  ON public.agency_invites FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'director'
        AND p.agency_id = public.agency_invites.agency_id
    )
  );

CREATE POLICY "Directores crean invites de su agencia"
  ON public.agency_invites FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'director'
        AND p.agency_id = public.agency_invites.agency_id
    )
  );

-- La política "Public can view unused invites by code for validation"
-- (is_used = false) se mantiene tal cual: la usa el registro para validar códigos.
