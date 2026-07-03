-- Fichas públicas del ACM (Análisis Comparativo de Mercado): el asesor/director selecciona comparables
-- de la lista del ACM y genera un link público de lujo con los comparables elegidos (uno por hoja, con
-- todas sus fotos y características), un banner de pulso de mercado por zona, una comparación calculada
-- de $/m², la marca de la agencia (logo + aviso legal) y su tarjeta de contacto para compartir al cliente.
-- Guardamos un SNAPSHOT (foto de los datos al momento de crear) para que el link sobreviva aunque la
-- publicación original cambie o se dé de baja. Mismo molde que shared_properties.
--
-- Lectura pública: SOLO vía service-role (admin client) desde el server component de /ficha-acm/[token].
-- Por eso activamos RLS sin políticas para anon/auth: queda bloqueada para el cliente y el server la lee
-- con la service key (que ignora RLS). La inserción también es server-side (API con sesión).

CREATE TABLE IF NOT EXISTS public.shared_acm_reports (
  token       text PRIMARY KEY,
  snapshot    jsonb NOT NULL,          -- { subject, operacion, comparables[], comparison, agent, agency, brand, created_at }
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  agency_id   uuid,
  view_count  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shared_acm_reports_created_by_idx ON public.shared_acm_reports (created_by);
CREATE INDEX IF NOT EXISTS shared_acm_reports_agency_id_idx  ON public.shared_acm_reports (agency_id);

ALTER TABLE public.shared_acm_reports ENABLE ROW LEVEL SECURITY;
-- Sin políticas: nadie (anon/authenticated) accede directo. Solo service-role (server) lee/escribe.

-- Contador de vistas atómico (lo llama el server al abrir la ficha; SECURITY DEFINER para no exigir políticas).
CREATE OR REPLACE FUNCTION public.increment_shared_acm_view(p_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.shared_acm_reports SET view_count = view_count + 1 WHERE token = p_token;
$$;
