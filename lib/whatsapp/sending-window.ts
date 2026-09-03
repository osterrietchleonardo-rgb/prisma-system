// Ventana horaria de envío (horario de Argentina).
// Proteger la reputación del número: nada de mensajes proactivos de madrugada.
// Meta penaliza (calidad ROJA) los envíos masivos/automáticos en horarios molestos.
//
// Regla: se permite enviar entre START_HOUR (inclusive) y END_HOUR (exclusive),
// en hora de Buenos Aires. Default 6am → 11pm (último envío 22:59).
//
// Aplica a: campañas (goteo automático) y seguimientos automáticos (n8n → dispatch).
// NO aplica a: respuestas del bot a un lead que escribió (esas son reactivas, dentro
// de la ventana de 24h de Meta, y no se restringen por horario).

export const SENDING_WINDOW_START_HOUR = 6   // 6am AR
export const SENDING_WINDOW_END_HOUR = 23    // 11pm AR (exclusivo: 23:00 ya no envía)

const AR_TZ = 'America/Argentina/Buenos_Aires'

/** Hora del día (0-23) en Argentina para una fecha dada. */
export function horaArgentina(date: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: AR_TZ,
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const h = parts.find((p) => p.type === 'hour')?.value ?? '0'
  // '24' puede aparecer a medianoche en algunos entornos; normalizar a 0.
  const n = parseInt(h, 10) % 24
  return Number.isNaN(n) ? 0 : n
}

/**
 * ¿Estamos dentro de la ventana horaria permitida para enviar mensajes proactivos?
 * @param date fecha a evaluar (default: ahora)
 */
export function dentroDeVentanaEnvio(date: Date = new Date()): boolean {
  const h = horaArgentina(date)
  return h >= SENDING_WINDOW_START_HOUR && h < SENDING_WINDOW_END_HOUR
}

/** Texto legible de la ventana, para logs y respuestas. */
export function ventanaEnvioLabel(): string {
  const fmt = (h: number) => (h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`)
  return `${fmt(SENDING_WINDOW_START_HOUR)}–${fmt(SENDING_WINDOW_END_HOUR)} (Argentina)`
}

// Argentina no tiene horario de verano: UTC-3 fijo. Eso permite calcular las horas
// hábiles con aritmética pura, sin Intl por cada iteración.
const OFFSET_AR_MS = -3 * 3600e3
const DIA_MS = 24 * 3600e3

/**
 * Horas HÁBILES (dentro de la ventana 6-23 AR) transcurridas entre dos instantes.
 * Es la medida justa de "cuánto lleva esperando el cliente" para los avisos al equipo:
 * el que duerme no está ignorando a nadie (Kevin, 2/9/2026). Un lead que escribe a las
 * 3:00 recién empieza a "esperar" a las 6:00; uno de las 22:00 suma 1 h, congela a las
 * 23:00 y retoma a las 6:00.
 */
export function horasHabiles(desdeMs: number, hastaMs: number): number {
  if (!Number.isFinite(desdeMs) || !Number.isFinite(hastaMs) || hastaMs <= desdeMs) return 0
  const a = desdeMs + OFFSET_AR_MS
  const b = hastaMs + OFFSET_AR_MS
  let total = 0
  for (let dia = Math.floor(a / DIA_MS) * DIA_MS; dia < b; dia += DIA_MS) {
    const desde = Math.max(a, dia + SENDING_WINDOW_START_HOUR * 3600e3)
    const hasta = Math.min(b, dia + SENDING_WINDOW_END_HOUR * 3600e3)
    if (hasta > desde) total += hasta - desde
  }
  return total / 3600e3
}
