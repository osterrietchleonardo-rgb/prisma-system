-- Migration: Motor de Seguimientos Automáticos y Visitas
-- Agrega columnas analíticas y temporales sin romper el `status` principal de UI

-- 1. Actualizar tabla whatsapp_instances
ALTER TABLE "public"."whatsapp_instances"
  ADD COLUMN "templates_status" text DEFAULT 'pending',
  ADD COLUMN "flows_active" boolean DEFAULT false;

-- 2. Actualizar tabla wa_conversations
ALTER TABLE "public"."wa_conversations"
  -- Estado en el embudo (open, snoozed, closed_lost, closed_won)
  ADD COLUMN "funnel_status" text DEFAULT 'open',
  
  -- Motor Inactividad
  ADD COLUMN "requires_follow_up" boolean DEFAULT true,
  ADD COLUMN "next_follow_up_at" timestamptz,
  ADD COLUMN "opt_out" boolean DEFAULT false,
  ADD COLUMN "follow_ups_sent" integer DEFAULT 0,
  ADD COLUMN "follow_ups_history" jsonb DEFAULT '[]'::jsonb,
  
  -- Analítica
  ADD COLUMN "recovery_stage" text DEFAULT 'direct',
  ADD COLUMN "dropoff_reason" text,
  
  -- Motor Citas / Visitas
  ADD COLUMN "visit_status" text DEFAULT 'none',
  ADD COLUMN "visit_scheduled_at" timestamptz,
  ADD COLUMN "visit_reminder_24h_sent" boolean DEFAULT false,
  ADD COLUMN "visit_reminder_3h_sent" boolean DEFAULT false,
  ADD COLUMN "visit_reminder_1h_sent" boolean DEFAULT false;

-- Forzar permisos si es necesario (ya deberían heredar, pero por las dudas)
-- No modificamos el RLS ya que todas estas columnas caen dentro del acceso actual a wa_conversations y whatsapp_instances.
