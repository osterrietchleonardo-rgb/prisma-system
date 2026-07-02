-- ============================================================================
-- FINANZAS / CONTABILIDAD (admin-vakdor)
-- Módulo de trazabilidad económica: costos reales de APIs de IA + gastos
-- operativos + tipo de cambio. Los INGRESOS se reusan de public.pagos_agencia.
--
-- Acceso: SOLO service-role (getAdminDb / createAdminClient). Por eso las 3
-- tablas nacen con RLS habilitado y SIN policies → deniegan a anon/authenticated
-- y el service-role las bypassa. Es la forma segura para datos financieros
-- (a diferencia de pagos_agencia / admin_vakdor_* que hoy tienen RLS apagado).
-- ============================================================================

-- ── 1) Costos reales de APIs de IA (jalados de las cost APIs, 1 fila por día) ──
-- Grano: (fecha, proveedor, proyecto, modelo, fuente). Columnas de texto NOT NULL
-- con default '' para que el UNIQUE funcione (en Postgres los NULL son distintos
-- entre sí y romperían la idempotencia del upsert nocturno).
CREATE TABLE IF NOT EXISTS public.finance_api_costs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha         date NOT NULL,                       -- día del bucket (1d)
  proveedor     text NOT NULL CHECK (proveedor IN ('openai', 'anthropic', 'google')),
  proyecto      text NOT NULL DEFAULT '',            -- project_id (OpenAI) / workspace_id (Anthropic); '' = default/combinado
  proyecto_nombre text NOT NULL DEFAULT '',          -- "Default project", etc.
  modelo        text NOT NULL DEFAULT '',            -- line_item / model / description si viene
  costo_usd     numeric NOT NULL DEFAULT 0,          -- SIEMPRE en USD (moneda nativa de las APIs)
  input_tokens  bigint,
  output_tokens bigint,
  fuente        text NOT NULL,                       -- 'openai_costs_api' | 'anthropic_cost_report' | 'gcp_bigquery'
  raw           jsonb,                               -- payload crudo del proveedor (auditoría)
  synced_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fecha, proveedor, proyecto, modelo, fuente)
);

CREATE INDEX IF NOT EXISTS finance_api_costs_fecha_idx
  ON public.finance_api_costs (fecha);
CREATE INDEX IF NOT EXISTS finance_api_costs_prov_fecha_idx
  ON public.finance_api_costs (proveedor, fecha);

ALTER TABLE public.finance_api_costs ENABLE ROW LEVEL SECURITY;

-- ── 2) Gastos operativos (fijos y variables), carga MANUAL desde la página ─────
CREATE TABLE IF NOT EXISTS public.finance_expenses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concepto     text NOT NULL,                        -- "Vercel Pro", "Proxy DataImpulse", "n8n EasyPanel"...
  categoria    text NOT NULL DEFAULT 'otro'
               CHECK (categoria IN ('suscripcion', 'infraestructura', 'proxy', 'marketing', 'sueldos', 'impuestos', 'otro')),
  tipo         text NOT NULL CHECK (tipo IN ('fijo', 'variable')),
  monto        numeric NOT NULL,
  moneda       text NOT NULL DEFAULT 'USD' CHECK (moneda IN ('USD', 'ARS')),
  recurrencia  text NOT NULL DEFAULT 'mensual' CHECK (recurrencia IN ('mensual', 'anual', 'unico')),
  fecha_inicio date NOT NULL,                         -- desde qué mes aplica
  fecha_fin    date,                                  -- NULL = sigue vigente
  proveedor    text,                                  -- opcional (a quién le pagás)
  notas        text,
  activo       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_expenses_activo_idx
  ON public.finance_expenses (activo, tipo);

ALTER TABLE public.finance_expenses ENABLE ROW LEVEL SECURITY;

-- ── 3) Tipo de cambio USD→ARS por mes (para mostrar todo en USD y en ARS) ──────
-- periodo_mes usa el MISMO formato 'YYYY-MM' que public.pagos_agencia.periodo_mes.
CREATE TABLE IF NOT EXISTS public.finance_fx (
  periodo_mes  text PRIMARY KEY,                      -- 'YYYY-MM'
  usd_ars      numeric NOT NULL CHECK (usd_ars > 0),  -- cuántos ARS = 1 USD
  fuente       text NOT NULL DEFAULT 'manual',        -- 'manual' | 'oficial' | 'blue' | 'mep'...
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.finance_fx ENABLE ROW LEVEL SECURITY;

-- (Sin policies a propósito: nadie salvo el service-role toca estas tablas.)
