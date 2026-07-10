-- Trazabilidad de acciones del director sobre asesores de su equipo:
-- pausa / reanudación / desvinculación. Una fila por acción.
-- La escritura va SIEMPRE desde el servidor (server actions con service_role),
-- por eso RLS queda deny-all para el cliente, igual que director_invites.
CREATE TABLE IF NOT EXISTS public.equipo_acciones (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    agency_id uuid REFERENCES public.agencies(id),
    asesor_id uuid REFERENCES public.profiles(id),      -- a quién
    ejecutado_por uuid REFERENCES public.profiles(id),  -- quién (el director)
    tipo_accion text NOT NULL CHECK (tipo_accion IN ('pausa', 'reanudacion', 'desvinculacion')),
    motivo text,
    created_at timestamptz DEFAULT now()
);

-- Búsqueda de la última acción de un asesor (para mostrar el motivo de la pausa).
CREATE INDEX IF NOT EXISTS equipo_acciones_asesor_idx
    ON public.equipo_acciones (asesor_id, created_at DESC);

ALTER TABLE public.equipo_acciones ENABLE ROW LEVEL SECURITY;

-- Nadie accede desde el cliente; toda lectura/escritura pasa por el backend.
CREATE POLICY "Deny all public access to equipo_acciones"
    ON public.equipo_acciones FOR ALL USING (false);
