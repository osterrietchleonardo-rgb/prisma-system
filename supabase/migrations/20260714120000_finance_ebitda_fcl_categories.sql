-- ============================================================================
-- Finanzas (admin-vakdor): dos categorías de gasto nuevas para EBITDA y FCL.
--   · depreciacion → Depreciación/Amortización. Es gasto OPERATIVO (baja el EBIT);
--     EBITDA la vuelve a sumar por no ser salida de caja.
--   · capex → Inversiones/CAPEX. NO es gasto del Estado de Resultado (es inversión):
--     se excluye del EBIT y de las tortas; solo impacta en el Flujo de Caja Libre.
-- Cambio aditivo: amplía el CHECK de finance_expenses.categoria.
-- ============================================================================

ALTER TABLE public.finance_expenses DROP CONSTRAINT IF EXISTS finance_expenses_categoria_check;
ALTER TABLE public.finance_expenses ADD CONSTRAINT finance_expenses_categoria_check
  CHECK (categoria IN ('suscripcion', 'infraestructura', 'proxy', 'marketing', 'sueldos', 'impuestos', 'financiero', 'depreciacion', 'capex', 'otro'));
