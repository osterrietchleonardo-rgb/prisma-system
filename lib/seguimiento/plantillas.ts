import { PLANTILLAS } from "./tipos"

/** Se agrega al final de {{2}} SOLO desde el 2º seguimiento sin respuesta (regla 25/8). */
export const BAJA = " Si preferís que no te escriba más, decime BAJA."

export interface PlantillaDisponible {
  /** nombre SIN prefijo de agencia, p.ej. "seg_retomar" */
  nombre: string
  /** texto fijo completo con {{1}} y {{2}} */
  texto: string
}

/** Quita el prefijo `ag<6hex>_` y devuelve el texto del BODY de una fila de wa_templates. */
export function plantillaDesdeFila(fila: { template_name: string; components: unknown }): PlantillaDisponible | null {
  const nombre = String(fila.template_name).replace(/^ag[0-9a-f]{6}_/, "")
  const comps = Array.isArray(fila.components) ? (fila.components as Array<{ type?: string; text?: string }>) : []
  const body = comps.find((c) => c.type === "BODY")?.text
  return body ? { nombre, texto: body } : null
}

/**
 * Las variables que espera cada plantilla (cuerpos reales verificados 24-25/8):
 *   f1/f2: [nombre, frase]  ·  f3: [nombre] (texto fijo)  ·  v2 (seg_*): [nombre, frase (+ BAJA)]
 * La BAJA va solo con follow_ups_sent ≥ 1 y nunca en seg_pendiente (es una disculpa, no marketing).
 */
export function armarVariables(
  plantilla: string,
  nombre: string,
  frase: string | null,
  followUpsSent: number
): string[] {
  if (plantilla === PLANTILLAS.f3) return [nombre]
  if (plantilla === PLANTILLAS.f1 || plantilla === PLANTILLAS.f2) return [nombre, (frase ?? "").trim()]
  const conBaja = followUpsSent >= 1 && plantilla !== PLANTILLAS.pendiente
  return [nombre, (frase ?? "").trim() + (conBaja ? BAJA : "")]
}
