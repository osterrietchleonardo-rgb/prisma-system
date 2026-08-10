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
