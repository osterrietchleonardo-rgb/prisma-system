-- ACM · Historial de búsquedas ("Mis ACM").
-- Cada vez que un asesor/director corre el ACM guardamos un SNAPSHOT completo: la propiedad sujeto,
-- la operación y los comparables devueltos (cartera + colaboración, con su % y checklist). Así el
-- historial se puede reabrir tal cual quedó, aunque después cambien las publicaciones.
-- Si desde esa búsqueda se generó la ficha pública, guardamos su token para linkearla.
--
-- Acceso: RLS activado SIN políticas (mismo molde que shared_acm_reports / marketing_ideas).
-- Las API routes leen y escriben con el admin client filtrando SIEMPRE por agency_id (y por user_id
-- cuando el rol no es director).

CREATE TABLE IF NOT EXISTS public.acm_searches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     uuid NOT NULL,
  user_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  operacion     text NOT NULL,
  sujeto        jsonb NOT NULL,                       -- Sujeto completo (para reabrir y editar)
  exclude_id    text,                                 -- id de la propiedad de cartera usada como sujeto
  resultados    jsonb NOT NULL DEFAULT '{}'::jsonb,   -- { cartera: AcmComparable[], roomix: AcmComparable[], con_semantica }
  total_cartera integer NOT NULL DEFAULT 0,
  total_roomix  integer NOT NULL DEFAULT 0,
  ficha_token   text,                                 -- token de shared_acm_reports si armaron la ficha
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS acm_searches_agency_created_idx ON public.acm_searches (agency_id, created_at DESC);
CREATE INDEX IF NOT EXISTS acm_searches_user_created_idx   ON public.acm_searches (user_id, created_at DESC);

ALTER TABLE public.acm_searches ENABLE ROW LEVEL SECURITY;
-- Sin políticas: nadie (anon/authenticated) accede directo. Solo service-role (server).
