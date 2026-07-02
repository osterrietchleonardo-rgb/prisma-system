-- ============================================================================
-- Seguridad: prender RLS en las tablas admin que estaban EXPUESTAS.
--
-- El advisor de Supabase marcó 5 tablas con RLS apagado → leíbles/editables por
-- cualquiera con la anon key. Se verificó en el código que TODOS los accesos usan
-- createAdminClient()/getAdminDb() (service-role), que BYPASSA RLS:
--   · admin_vakdor_users        → login/route.ts (service-role)
--   · admin_vakdor_activity_log → logger.ts (service-role)
--   · log_creditos_admin        → rutas admin de créditos (service-role)
--   · pagos_agencia             → rutas admin de pagos + dashboard (service-role)
--   · emails_bloqueados         → asesores.ts + rutas admin (service-role)
--
-- Prender RLS SIN policies deja: backend (service-role) OK; anon/authenticated
-- denegados. Es exactamente "solo yo (por el backend) puedo".
-- ============================================================================

ALTER TABLE public.admin_vakdor_users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_vakdor_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.log_creditos_admin        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos_agencia             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emails_bloqueados         ENABLE ROW LEVEL SECURITY;
