-- ─────────────────────────────────────────────────────────────
-- El código de invitación pasa a llevar el celular y el email del invitado.
--
-- Por qué: hoy nadie valida que quien usa un código sea la persona invitada.
-- El registro ni siquiera lee invitee_name y le pone al perfil el nombre que
-- tipeó quien se registró. Con el email en el código, el código deja de ser
-- transferible: solo sirve para esa dirección.
--
-- 100% aditivo:
--  - Las dos columnas son nullables. Los códigos ya emitidos quedan en NULL y
--    siguen funcionando exactamente como antes (sin email no hay qué validar).
--  - No se toca ninguna política de RLS.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.agency_invites
  ADD COLUMN IF NOT EXISTS invitee_phone text,
  ADD COLUMN IF NOT EXISTS invitee_email text;

COMMENT ON COLUMN public.agency_invites.invitee_phone
  IS 'Celular del invitado en E.164 sin "+" (ej. 5491123456789). Pasa a profiles.phone al registrarse.';
COMMENT ON COLUMN public.agency_invites.invitee_email
  IS 'Email del invitado, en minúsculas. Es la llave: solo puede usar el código quien se registre con esta dirección.';

-- Búsqueda por email al chequear duplicados antes de generar un código.
CREATE INDEX IF NOT EXISTS agency_invites_invitee_email_idx
  ON public.agency_invites (invitee_email);

-- ─────────────────────────────────────────────────────────────
-- equipo_acciones: sumar 'edicion_datos'.
--
-- Cuando el director corrige el nombre o el celular de un asesor, queda la
-- constancia igual que con pausar y desvincular.
--
-- OJO: se recrea el CHECK con la lista COMPLETA que corre hoy en producción
-- (verificada por Management API el 2026-08-24), no con la del archivo viejo
-- del repo, que quedó sin 'eliminacion_definitiva'.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.equipo_acciones
  DROP CONSTRAINT IF EXISTS equipo_acciones_tipo_accion_check;

ALTER TABLE public.equipo_acciones
  ADD CONSTRAINT equipo_acciones_tipo_accion_check
  CHECK (tipo_accion IN (
    'pausa',
    'reanudacion',
    'desvinculacion',
    'eliminacion_definitiva',
    'edicion_datos'
  ));
