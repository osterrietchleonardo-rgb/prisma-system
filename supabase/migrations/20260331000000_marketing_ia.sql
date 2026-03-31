-- Perfiles IPC
CREATE TABLE IF NOT EXISTS ipc_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre_perfil TEXT NOT NULL,
  rango_edad TEXT, 
  genero TEXT, 
  zona_geografica TEXT, 
  rol_sector TEXT,
  problema_principal TEXT, 
  mayor_frustracion TEXT,
  pierde_tiempo_dinero TEXT, 
  mayor_estres TEXT,
  mayor_miedo JSONB, 
  freno_para_avanzar TEXT, 
  objeciones TEXT,
  meta_12_meses TEXT, 
  negocio_ideal TEXT, 
  vida_transformada TEXT,
  motiva_decision JSONB, 
  valora_en_proveedor TEXT, 
  trigger_decision TEXT,
  redes_sociales JSONB, 
  tipo_contenido JSONB, 
  frecuencia_publica TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Borradores de copy
CREATE TABLE IF NOT EXISTS copy_drafts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ipc_id UUID REFERENCES ipc_profiles(id) ON DELETE SET NULL,
  copy_type TEXT NOT NULL CHECK (copy_type IN ('video', 'post')),
  angle TEXT NOT NULL,
  consciousness_level INTEGER NOT NULL CHECK (consciousness_level BETWEEN 0 AND 4),
  extra_context TEXT,
  content JSONB NOT NULL,
  -- Video: { hook, problema, agitacion, solucion, cta }
  -- Post:  { hook, desarrollo, cta }
  tokko_property JSONB,
  -- Snapshot completo de TokkoProperty
  version INTEGER DEFAULT 1,
  parent_draft_id UUID REFERENCES copy_drafts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Imágenes generadas
CREATE TABLE IF NOT EXISTS generated_images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  draft_id UUID REFERENCES copy_drafts(id) ON DELETE CASCADE,
  format TEXT NOT NULL CHECK (format IN ('reels', 'post', 'historia')),
  style TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  extra_prompt TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE ipc_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE copy_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_images ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to avoid errors on rerun
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Users manage own IPCs" ON ipc_profiles;
    DROP POLICY IF EXISTS "Users manage own copies" ON copy_drafts;
    DROP POLICY IF EXISTS "Users manage own images" ON generated_images;
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "Users manage own IPCs"    ON ipc_profiles     FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own copies"  ON copy_drafts      FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own images"  ON generated_images FOR ALL USING (auth.uid() = user_id);

-- Storage bucket initialization (Storage policies must be handled in the Supabase Dashboard for the "marketing-images" bucket)
