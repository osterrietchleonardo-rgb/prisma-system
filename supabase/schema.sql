-- EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ROLES ENUM
-- We'll use a text column with constraints for simplicity in some cases, 
-- but RLS will check for 'director' or 'asesor'.

-- INMOBILIARIAS (Agencies)
CREATE TABLE IF NOT EXISTS public.agencies (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    name text NOT NULL,
    logo_url text,
    tokko_api_key text,
    address text,
    phone text,
    email text,
    invite_code text UNIQUE,
    owner_id uuid, -- FK to profiles, deferred
    last_sync_at timestamptz,
    created_at timestamptz DEFAULT now()
);

-- USUARIOS Y ROLES (Profiles)
CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role text CHECK (role IN ('director', 'asesor')),
    full_name text,
    email text,
    phone text,
    avatar_url text,
    agency_id uuid REFERENCES public.agencies(id),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Add missing FK constraint to agencies
ALTER TABLE public.agencies ADD CONSTRAINT fk_agency_owner FOREIGN KEY (owner_id) REFERENCES public.profiles(id);

-- PROPIEDADES (sync Tokko)
CREATE TABLE IF NOT EXISTS public.properties (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    tokko_id text UNIQUE,
    agency_id uuid REFERENCES public.agencies(id) ON DELETE CASCADE,
    assigned_agent_id uuid REFERENCES public.profiles(id),
    title text,
    description text,
    price decimal,
    currency text,
    property_type text,
    status text,
    address text,
    city text,
    bedrooms int,
    bathrooms int,
    total_area decimal,
    covered_area decimal,
    images jsonb DEFAULT '[]',
    tokko_data jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- LEADS
CREATE TABLE IF NOT EXISTS public.leads (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    agency_id uuid REFERENCES public.agencies(id) ON DELETE CASCADE,
    assigned_agent_id uuid REFERENCES public.profiles(id),
    full_name text,
    email text,
    phone text,
    source text,
    status text DEFAULT 'nuevo',
    pipeline_stage text DEFAULT 'contacto',
    notes text,
    tokko_contact_id text,
    first_response_time interval,
    chat_analysis jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- INTERACCIONES / ACTIVIDADES
CREATE TABLE IF NOT EXISTS public.lead_activities (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
    agent_id uuid REFERENCES public.profiles(id),
    activity_type text,
    description text,
    created_at timestamptz DEFAULT now()
);

-- VISITAS
CREATE TABLE IF NOT EXISTS public.visits (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
    property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE,
    agent_id uuid REFERENCES public.profiles(id),
    scheduled_at timestamptz,
    status text DEFAULT 'pendiente',
    notes text,
    created_at timestamptz DEFAULT now()
);

-- TASACIONES
CREATE TABLE IF NOT EXISTS public.valuations (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    agency_id uuid REFERENCES public.agencies(id) ON DELETE CASCADE,
    agent_id uuid REFERENCES public.profiles(id),
    address text,
    property_type text,
    total_area decimal,
    covered_area decimal,
    bedrooms int,
    bathrooms int,
    age_years int,
    condition text,
    location_score int,
    amenities jsonb DEFAULT '[]',
    comparable_properties jsonb DEFAULT '[]',
    estimated_value decimal,
    estimated_rent decimal,
    methodology text,
    ai_analysis text,
    created_at timestamptz DEFAULT now()
);

-- DOCUMENTOS DE LA INMOBILIARIA
CREATE TABLE IF NOT EXISTS public.agency_documents (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    agency_id uuid REFERENCES public.agencies(id) ON DELETE CASCADE,
    uploaded_by uuid REFERENCES public.profiles(id),
    title text,
    type text,
    file_url text,
    video_url text,
    transcription text,
    content_text text,
    created_at timestamptz DEFAULT now()
);

-- CIERRES / VENTAS
CREATE TABLE IF NOT EXISTS public.closings (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    lead_id uuid REFERENCES public.leads(id),
    property_id uuid REFERENCES public.properties(id),
    agent_id uuid REFERENCES public.profiles(id),
    agency_id uuid REFERENCES public.agencies(id) ON DELETE CASCADE,
    closing_price decimal,
    commission decimal,
    closed_at timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now()
);

-- ROW LEVEL SECURITY (RLS)
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.valuations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.closings ENABLE ROW LEVEL SECURITY;

-- POLICIES

-- profiles
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Directors can view all profiles in their agency" ON public.profiles FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'director' AND p.agency_id = public.profiles.agency_id));

-- agencies
CREATE POLICY "Users can view their own agency" ON public.agencies FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.agency_id = public.agencies.id));

-- properties
CREATE POLICY "Users can view properties of their agency" ON public.properties FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.agency_id = public.properties.agency_id));
CREATE POLICY "Directors can manage properties" ON public.properties FOR ALL 
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'director' AND p.agency_id = public.properties.agency_id));

-- leads
CREATE POLICY "Directors can view all leads in their agency" ON public.leads FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'director' AND p.agency_id = public.leads.agency_id));
CREATE POLICY "Asesores can view their assigned leads" ON public.leads FOR SELECT 
USING (assigned_agent_id = auth.uid());
CREATE POLICY "Agents can manage leads" ON public.leads FOR ALL 
USING (assigned_agent_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'director' AND p.agency_id = public.leads.agency_id));

-- lead_activities, visits, valuations, closings (similar pattern)
CREATE POLICY "Agency-wide view for directors" ON public.lead_activities FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'director' AND (SELECT agency_id FROM public.leads l WHERE l.id = public.lead_activities.lead_id) = p.agency_id));

-- For simplicity, apply direct agency_id checks where possible or join checks.
-- We'll refine these as needed.
