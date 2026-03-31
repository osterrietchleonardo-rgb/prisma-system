-- Create enum type for state
DO $$ BEGIN
    CREATE TYPE tasacion_estado AS ENUM ('borrador', 'finalizada');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.tasaciones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  
  -- Payload objects
  sujeto JSONB NOT NULL DEFAULT '{}'::jsonb,
  comparables JSONB NOT NULL DEFAULT '[]'::jsonb,
  factores_configuracion JSONB NOT NULL DEFAULT '{}'::jsonb,
  resultado JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Metadata
  observaciones TEXT,
  cliente_nombre TEXT,
  estado tasacion_estado DEFAULT 'borrador' NOT NULL
);

-- Basic RLS policies
ALTER TABLE public.tasaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Asesores ven y modifican sus propias tasaciones" 
  ON public.tasaciones FOR ALL 
  USING (auth.uid() = user_id);
