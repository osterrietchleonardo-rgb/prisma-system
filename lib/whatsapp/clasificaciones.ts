// =============================================
// Clasificaciones ACUMULADAS de un lead.
// Fuente única de verdad para leer, sumar y filtrar el recorrido.
// Usado en: solapa Contactos, bandeja de chats, campañas (segmento y manual).
//
// Un lead pasa por varios lugares: entra por `Whatsapp-Consulta`, después lo
// importás en la lista "Oferta-Julio", después recibe la plantilla `oferta_julio_2026`.
// Antes cada paso pisaba al anterior. Ahora se acumulan, y el filtro tiene que
// traerlo por CUALQUIERA de ellas, no solo por la última.
//
// `clasificacion` (singular) sigue siendo el ORIGEN y no se toca: todo lo que ya
// la lee sigue andando. La lista es aditiva y va al lado.
// =============================================

export interface ClasificacionEntry {
  clasificacion: string
  /** De dónde salió: "inicial", "importación: Oferta-Julio", "plantilla: oferta_julio_2026"… */
  origen: string
  /** ISO. */
  at: string
}

/** Fila con clasificación (contacto o conversación). */
export interface ConClasificaciones {
  clasificacion?: string | null
  clasificaciones_historial?: unknown
}

/** Lee el historial de forma segura (puede venir null, string o basura desde la BD). */
export function leerHistorial(valor: unknown): ClasificacionEntry[] {
  if (!Array.isArray(valor)) return []
  return valor.filter(
    (e): e is ClasificacionEntry =>
      !!e && typeof e === 'object' && typeof (e as ClasificacionEntry).clasificacion === 'string'
  )
}

/**
 * Todas las clasificaciones del lead, sin repetir y en orden de aparición.
 * Arranca por `clasificacion` (el origen) para que el badge principal siga siendo ese.
 */
export function clasificacionesDe(fila: ConClasificaciones): string[] {
  const out: string[] = []
  const push = (v: string | null | undefined) => {
    const clean = (v ?? '').trim()
    if (clean && !out.includes(clean)) out.push(clean)
  }
  push(fila.clasificacion)
  for (const e of leerHistorial(fila.clasificaciones_historial)) push(e.clasificacion)
  return out
}

/**
 * ¿El lead coincide con el filtro? Mira TODAS sus clasificaciones.
 * Un lead que entró por consulta y después recibió una campaña aparece en los dos filtros.
 */
export function coincideClasificacion(fila: ConClasificaciones, filtro: string): boolean {
  if (filtro === 'all') return true
  const todas = clasificacionesDe(fila)
  if (filtro === 'sin') return todas.length === 0
  return todas.includes(filtro)
}

/**
 * Suma una clasificación al recorrido. Devuelve el historial nuevo, o `null` si el
 * lead ya la tenía (así el que llama evita escribir de más en la base).
 */
export function sumarClasificacion(
  fila: ConClasificaciones,
  clasificacion: string | null | undefined,
  origen: string
): ClasificacionEntry[] | null {
  const clean = (clasificacion ?? '').trim()
  if (!clean) return null
  if (clasificacionesDe(fila).includes(clean)) return null
  return [
    ...leerHistorial(fila.clasificaciones_historial),
    { clasificacion: clean, origen, at: new Date().toISOString() },
  ]
}

/** Origen para una plantilla enviada (campaña manual o por segmento). */
export function origenPlantilla(templateName: string): string {
  return `plantilla: ${templateName}`
}

/** Origen para una importación de lista. */
export function origenImportacion(clasificacion: string): string {
  return `importación: ${clasificacion}`
}

/**
 * Plantillas que dispara el sistema solo (seguimiento, recordatorios de visita,
 * reactivación). NO clasifican al lead: no son campañas del cliente.
 *
 * Se reconocen por el prefijo con que las crea el sistema: `ag` + 6 caracteres del
 * agency_id (ver `templatePrefix` en `app/actions/whatsapp-templates.ts`), ej.
 * `ag4962bf_seg_f1_seguimiento`. Las del cliente las crea él en Meta con nombre libre
 * (`reclutamiento_22062026`), así que nunca caen acá.
 */
export function esPlantillaDelSistema(templateName: string | null | undefined): boolean {
  return /^ag[0-9a-f]{6}_/i.test((templateName ?? '').trim())
}
