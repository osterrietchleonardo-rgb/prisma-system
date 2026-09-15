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

/**
 * Límites del día en hora ARGENTINA para filtrar columnas timestamptz.
 *
 * El filtro manda 'yyyy-MM-dd'. Comparado tal cual (o con `T23:59:59.999` sin zona), la base lo
 * toma en UTC: el período corría 3 horas y lo escrito entre las 21 y las 24 de cada día caía en
 * el día siguiente (auditoría del dashboard, 15/9/2026). Argentina no tiene horario de verano:
 * -03:00 fijo. Si no es una fecha 'yyyy-MM-dd' se devuelve tal cual.
 */
export function inicioDelDiaAR(fecha: string): string {
  return ES_FECHA.test(fecha) ? `${fecha}T00:00:00-03:00` : fecha
}

export function finDelDiaAR(fecha: string): string {
  return ES_FECHA.test(fecha) ? `${fecha}T23:59:59.999-03:00` : fecha
}

/**
 * "del 16/08 al 15/09": las aclaraciones de los tiempos de respuesta dicen qué período están
 * contando, así el número se lee junto con el filtro que el director eligió.
 */
export function etiquetaPeriodo(from?: string, to?: string): string {
  if (!from || !to || !ES_FECHA.test(from) || !ES_FECHA.test(to)) return "todo el historial"
  const corta = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`
  return from === to ? `el ${corta(from)}` : `del ${corta(from)} al ${corta(to)}`
}
