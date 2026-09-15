/**
 * ¿La propiedad estaba en cartera en ese instante?
 *
 * Dada de alta en Tokko antes de ese instante y, si hoy está dada de baja, con la baja después.
 * La fecha de baja de Tokko (`deleted_at`) sólo vale para las inactivas: las activas también la
 * traen cargada (15/9/2026: las 349 activas de Central). Sin fecha de alta, se confía en
 * `is_active`.
 *
 * Con esto la cartera responde al filtro de fechas del dashboard: es la que había al cierre del
 * período elegido, y la de hoy cuando el período termina hoy.
 */
export function estabaEnCartera(
  p: { is_active?: boolean | null; alta?: string | null; baja?: string | null },
  instante: number
): boolean {
  const alta = p.alta ? Date.parse(p.alta) : NaN
  if (Number.isNaN(alta)) return !!p.is_active
  if (alta > instante) return false
  if (p.is_active) return true
  const baja = p.baja ? Date.parse(p.baja) : NaN
  return !Number.isNaN(baja) && baja > instante
}
