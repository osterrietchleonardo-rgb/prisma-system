-- Fichas compartibles del Buscador IA: el asesor/director genera un link público de lujo de una
-- propiedad (de su cartera, de la agencia o de la red Roomix) con su tarjeta de contacto y la marca
-- de su agencia. Guardamos un SNAPSHOT (foto de los datos al momento de compartir) para que el link
-- sobreviva aunque la publicación original cambie o se dé de baja.
--
-- Lectura pública: SOLO vía service-role (admin client) desde el server component de /ficha/[token].
-- Por eso activamos RLS sin políticas para anon/auth: queda bloqueada para el cliente y el server
-- la lee con la service key (que ignora RLS). La inserción también es server-side (API con sesión).

CREATE TABLE IF NOT EXISTS public.shared_properties (
  token          text PRIMARY KEY,
  property_source text NOT NULL,          -- 'own' | 'agency' | 'roomix'
  property_id    text NOT NULL,           -- uuid (properties) o slug (roomix)
  snapshot       jsonb NOT NULL,          -- { property, agent, agency, brand }
  created_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  agency_id      uuid,
  view_count     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shared_properties_created_by_idx ON public.shared_properties (created_by);
CREATE INDEX IF NOT EXISTS shared_properties_agency_id_idx  ON public.shared_properties (agency_id);

ALTER TABLE public.shared_properties ENABLE ROW LEVEL SECURITY;
-- Sin políticas: nadie (anon/authenticated) accede directo. Solo service-role (server) lee/escribe.

-- Contador de vistas atómico (lo llama el server al abrir la ficha; SECURITY DEFINER para no exigir políticas).
CREATE OR REPLACE FUNCTION public.increment_shared_view(p_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.shared_properties SET view_count = view_count + 1 WHERE token = p_token;
$$;
