-- Add formato_preferido column to ipc_profiles table
ALTER TABLE public.ipc_profiles ADD COLUMN formato_preferido text DEFAULT 'ambos';
