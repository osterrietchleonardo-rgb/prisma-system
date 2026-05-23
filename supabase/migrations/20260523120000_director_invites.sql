CREATE TABLE IF NOT EXISTS public.director_invites (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    code text UNIQUE NOT NULL,
    is_used boolean DEFAULT false,
    used_at timestamptz,
    used_by uuid REFERENCES public.profiles(id),
    agency_id uuid REFERENCES public.agencies(id),
    created_at timestamptz DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.director_invites ENABLE ROW LEVEL SECURITY;

-- Solo Admin-vakdor (o administradores) deberían poder ver y crear. Como estamos en entorno MVP, podemos permitir select temporalmente al rol autenticado si es necesario.
-- Por ahora, lo más seguro es usar service_role (adminClient en la API) para leer y modificar esta tabla.
-- Añadiremos una política restrictiva por defecto para lectura pública si acaso el frontend quisiera leer, pero la lectura se hará desde el backend (Server Action).
CREATE POLICY "Deny all public access to director_invites" ON public.director_invites FOR ALL USING (false);
