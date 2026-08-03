import type { WeekWindow } from "./types"

/** Argentina es UTC-3 fijo: no tiene horario de verano desde 2009. */
const AR_OFFSET_MS = 3 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]

/**
 * Ventana de la semana ANTERIOR (lunes 00:00 a domingo 23:59:59.999), en hora argentina,
 * devuelta como ISO UTC para consultar la base.
 *
 * El truco: restarle el offset a "ahora" da un Date cuyos getters UTC leen la hora
 * argentina. Así toda la aritmética de días se hace con getUTC*, que no depende de la
 * zona horaria del servidor (Vercel corre en UTC, la máquina de Leonardo en AR).
 */
export function previousWeek(now: Date = new Date()): WeekWindow {
  const ar = new Date(now.getTime() - AR_OFFSET_MS)

  // getUTCDay(): 0 = domingo. Lo giramos para que el lunes sea 0.
  const diasDesdeElLunes = (ar.getUTCDay() + 6) % 7
  const lunesDeEstaSemana =
    Date.UTC(ar.getUTCFullYear(), ar.getUTCMonth(), ar.getUTCDate()) - diasDesdeElLunes * DAY_MS

  const inicioAr = lunesDeEstaSemana - 7 * DAY_MS
  const finAr = lunesDeEstaSemana - 1 // 23:59:59.999 del domingo

  const inicio = new Date(inicioAr + AR_OFFSET_MS)
  const fin = new Date(finAr + AR_OFFSET_MS)

  return {
    startUtc: inicio.toISOString(),
    endUtc: fin.toISOString(),
    label: etiqueta(new Date(inicioAr), new Date(finAr)),
  }
}

/** "27 de julio al 2 de agosto de 2026". Recibe fechas ya en hora AR leídas con getUTC*. */
function etiqueta(desde: Date, hasta: Date): string {
  const d = `${desde.getUTCDate()} de ${MESES[desde.getUTCMonth()]}`
  const h = `${hasta.getUTCDate()} de ${MESES[hasta.getUTCMonth()]} de ${hasta.getUTCFullYear()}`
  return `${d} al ${h}`
}
