-- Refactor ipc_profiles to support specialized workflows v2 (Captar/Vender)
ALTER TABLE public.ipc_profiles 
ADD COLUMN IF NOT EXISTS tipo_ipc text DEFAULT 'captar',
ADD COLUMN IF NOT EXISTS propiedad_tokko_id text,
ADD COLUMN IF NOT EXISTS flow_data jsonb DEFAULT '{}'::jsonb;

-- Update existing records to 'captar' as default if they didn't have it
UPDATE public.ipc_profiles SET tipo_ipc = 'captar' WHERE tipo_ipc IS NULL;
