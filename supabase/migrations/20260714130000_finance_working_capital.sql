-- ============================================================================
-- Capital de trabajo (admin-vakdor · Finanzas · para el Flujo de Caja Libre).
-- Guarda los SALDOS mensuales de cada partida operativa. El sistema calcula la
-- VARIACIÓN (Δ) comparando el saldo del mes con el del mes anterior, y ese Δ es
-- el que resta/suma al FCL.
--
-- Signo del capital de trabajo (WC = activos op. − pasivos op.):
--   por_cobrar (te deben) ........... +  (si sube, inmoviliza caja → resta FCL)
--   prepago (pagaste adelantado) .... +  (inmoviliza)
--   por_pagar (le debés) ............ −  (si sube, libera caja → suma FCL)
--   anticipo_cliente (cobraste adel.) −  (libera)
--
-- Acceso: SOLO service-role (RLS on, sin policies), igual que finance_*.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.finance_working_capital (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_mes  text NOT NULL,                     -- 'YYYY-MM'
  tipo         text NOT NULL CHECK (tipo IN ('por_cobrar', 'por_pagar', 'anticipo_cliente', 'prepago')),
  concepto     text,
  monto        numeric NOT NULL DEFAULT 0,        -- saldo del mes (en su moneda)
  moneda       text NOT NULL DEFAULT 'USD' CHECK (moneda IN ('USD', 'ARS')),
  notas        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_working_capital_mes_idx
  ON public.finance_working_capital (periodo_mes);

ALTER TABLE public.finance_working_capital ENABLE ROW LEVEL SECURITY;
-- (Sin policies a propósito: solo el service-role la toca.)
