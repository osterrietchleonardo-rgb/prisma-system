/**
 * ¿El bot quedó apagado por la derivación que Sofía hizo en ESTE MISMO turno?
 *
 * Por qué existe: `/api/n8n/reply` descarta toda respuesta si la conversación tiene el bot
 * apagado, para no pisar a un asesor que tomó la charla a mano mientras n8n pensaba. Pero cuando
 * Sofía deriva, la herramienta Gestion_Handoff apaga el bot EN EL MEDIO de su turno, antes de que
 * salga su mensaje ("te conecto con el equipo / te derivo con [asesor]"). Ese mensaje se descartaba
 * y el cliente no recibía nada. Medido el 16/9/2026: 3 de 4 derivaciones revisadas en n8n, y unas
 * 76 de 109 en 30 días sin mensaje al cliente.
 *
 * Cómo se distingue:
 *  - La derivación de Sofía deja la marca interna "⚠️ Handoff activado" (la escribe el subflujo
 *    Gestion_Handoff de n8n). El botón del asesor apaga el bot SIN marca.
 *  - Si después de la marca escribió un asesor (role "human"), tomó la charla: se descarta.
 *  - Si después de la marca escribió el cliente (role "lead"), ya es otro turno: se descarta,
 *    para que Sofía no siga hablando con alguien que ya derivó.
 *  - La marca tiene que ser reciente (VENTANA_MS). Medido: el mensaje sale 16-20 s después de
 *    derivar; con varias partes puede llegar a ~1,5 min.
 * Ante cualquier duda (sin marca, marca vieja, datos raros) devuelve false: se sigue descartando.
 */

export const MARCA_DERIVACION = '⚠️ Handoff activado'
export const VENTANA_MS = 5 * 60 * 1000

export type MensajeReciente = {
  role: string | null
  content: string | null
  created_at: string | null
}

/**
 * @param mensajes los últimos mensajes de la conversación, del MÁS NUEVO al más viejo.
 * @param ahora momento de la decisión.
 */
export function esMensajeDeLaDerivacionPropia(mensajes: MensajeReciente[], ahora: Date): boolean {
  for (const m of mensajes) {
    if (m.role === 'human' || m.role === 'lead') return false
    if (m.role === 'internal' && (m.content ?? '').startsWith(MARCA_DERIVACION)) {
      const cuando = m.created_at ? Date.parse(m.created_at) : NaN
      if (Number.isNaN(cuando)) return false
      const edad = ahora.getTime() - cuando
      // un poco de tolerancia por relojes distintos entre n8n, la base y el servidor
      return edad >= -60_000 && edad <= VENTANA_MS
    }
    // mensajes de Sofía (partes anteriores del mismo mensaje) y notas internas no deciden nada
  }
  return false
}
