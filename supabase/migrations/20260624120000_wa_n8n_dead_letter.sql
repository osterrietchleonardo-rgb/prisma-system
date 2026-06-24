-- ============================================================================
-- Red de contención para el disparo a n8n (anti "lead perdido").
--
-- Problema que resuelve: el webhook entrante (Meta/Evolution) guarda el mensaje
-- del lead y luego dispara n8n con un fetch "tirá y olvidate". Si ese fetch
-- fallaba (n8n caído/reiniciando, timeout, blip de red), el error se tragaba en
-- un .catch y el lead quedaba sin respuesta y sin rastro (caso real: Ivana Marti,
-- 23/06/2026). n8n nunca registraba ejecución.
--
-- Esta tabla guarda el disparo que falló DESPUÉS de agotar los reintentos, para
-- poder reprocesarlo (endpoint /api/n8n/retry-pending) y NUNCA perder un lead.
--
-- Acceso: solo service role (los webhooks y el reprocesador usan SERVICE_ROLE_KEY,
-- que bypassa RLS). RLS habilitado sin policies = nadie más lee/escribe. Si más
-- adelante se quiere mostrar en el admin, se agrega una policy de SELECT por agencia.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.wa_n8n_dead_letter (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid,
  agency_id       uuid,
  message_id      uuid,
  contact_phone   text,
  source          text,                              -- 'meta' | 'evolution' | 'manual'
  payload         jsonb NOT NULL,                    -- payload exacto que iba a n8n (para reproceso)
  attempts        integer NOT NULL DEFAULT 0,        -- intentos ya realizados antes de rendirse
  last_error      text,                              -- último error registrado
  status          text NOT NULL DEFAULT 'pending',   -- 'pending' | 'reprocessed' | 'failed'
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  reprocessed_at  timestamptz
);

-- Índice para drenar rápido la cola de pendientes (orden cronológico)
CREATE INDEX IF NOT EXISTS idx_wa_n8n_dead_letter_pending
  ON public.wa_n8n_dead_letter (status, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_wa_n8n_dead_letter_conv
  ON public.wa_n8n_dead_letter (conversation_id);

ALTER TABLE public.wa_n8n_dead_letter ENABLE ROW LEVEL SECURITY;
