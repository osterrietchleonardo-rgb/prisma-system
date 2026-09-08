/**
 * El período del dashboard (director y asesor).
 *
 * Defecto encontrado el 7/9/2026 con el panel de derivaciones de Kevin: el filtro de arriba
 * (`DatePeriodFilter`) MUESTRA "Últimos 30 días" cuando no hay período en la URL, pero las
 * páginas le pasaban `from`/`to` vacíos a las consultas, que entonces contaban TODO el
 * historial (derivaciones desde el 2 de julio bajo un cartel que decía 30 días). Acá se
 * resuelve el período una sola vez, con el mismo criterio que el filtro: hoy y 30 días atrás,
 * en fecha argentina y en el formato `yyyy-MM-dd` que el filtro escribe en la URL.
 */

export const DIAS_POR_DEFECTO = 30

const FECHA_AR = (d: Date) => d.toLocaleString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).slice(0, 10)

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/

export interface Periodo {
  from: string
  to: string
  /** true si el período salió del defecto (nadie eligió nada en el filtro). */
  porDefecto: boolean
}

/**
 * Si la URL trae `from` y `to` válidos, se respetan tal cual. Si falta cualquiera de los dos
 * (o viene con un formato raro), se usa el defecto de 30 días: lo que la pantalla ya decía.
 */
export function periodoDelDashboard(
  params: { from?: string; to?: string } | undefined,
  ahora: Date = new Date()
): Periodo {
  const from = params?.from?.trim()
  const to = params?.to?.trim()
  if (from && to && ES_FECHA.test(from) && ES_FECHA.test(to) && from <= to) return { from, to, porDefecto: false }
  const desde = new Date(ahora.getTime() - DIAS_POR_DEFECTO * 24 * 3600e3)
  return { from: FECHA_AR(desde), to: FECHA_AR(ahora), porDefecto: true }
}
