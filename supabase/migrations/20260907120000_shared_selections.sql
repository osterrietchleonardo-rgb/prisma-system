-- Selección de propiedades: el asesor/director marca varias en el Buscador IA o en el mapa
-- y genera UN link público con la marca de su agencia, su tarjeta de contacto y una nota
-- opcional por propiedad más una nota final opcional del grupo. Guardamos un SNAPSHOT (foto
-- de los datos al momento de crear) para que el link sobreviva aunque la publicación
-- original cambie o se dé de baja. Mismo molde que shared_properties y shared_acm_reports.
--
-- Lectura pública: SOLO vía service-role (admin client) desde el server component de
-- /seleccion/[token]. Por eso activamos RLS sin políticas para anon/auth: queda bloqueada
-- para el cliente y el server la lee con la service key (que ignora RLS). La inserción
-- también es server-side (API con sesión).

CREATE TABLE IF NOT EXISTS public.shared_selections (
  token       text PRIMARY KEY,
  snapshot    jsonb NOT NULL,          -- { properties[], nota_final, agent, agency, brand, created_at }
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  agency_id   uuid,
  view_count  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shared_selections_created_by_idx ON public.shared_selections (created_by);
CREATE INDEX IF NOT EXISTS shared_selections_agency_id_idx  ON public.shared_selections (agency_id);

ALTER TABLE public.shared_selections ENABLE ROW LEVEL SECURITY;
-- Sin políticas: nadie (anon/authenticated) accede directo. Solo service-role (server).

-- Contador de vistas atómico (lo llama el server al abrir la ficha; SECURITY DEFINER para
-- no exigir políticas).
CREATE OR REPLACE FUNCTION public.increment_shared_selection_view(p_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.shared_selections SET view_count = view_count + 1 WHERE token = p_token;
$$;
