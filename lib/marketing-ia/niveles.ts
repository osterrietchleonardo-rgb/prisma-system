import type { ConsciousnessLevel } from "@/types/marketing-ia"

/** Etiquetas tal cual las guarda el formulario de IPC en flow_data.nivel_conciencia. */
const ETIQUETA_A_NIVEL: Record<string, ConsciousnessLevel> = {
  "Inconsciente": 0,
  "Consciente del Problema": 1,
  "Consciente de la Solución": 2,
  "Consciente del Producto": 3,
  "Muy Consciente": 4,
}

export const NIVEL_DESCRIPCION: Record<ConsciousnessLevel, string> = {
  0: "El público no sabe que tiene el problema. Creá el problema en su mente antes de hablar de la solución.",
  1: "Siente que algo no funciona pero no identifica la causa. Ayudalo a ponerle nombre al dolor.",
  2: "Sabe que hay soluciones pero no nos conoce. Posicioná nuestra solución como la correcta.",
  3: "Nos conoce pero tiene dudas. Trabajá objeciones y usá prueba social.",
  4: "Está casi listo. Sé directo. Oferta clara. CTA fuerte.",
}

/** Nivel de consciencia del IPC. Si el perfil no lo trae, asume 1 (el default histórico del módulo). */
export function nivelDesdeIpc(flowData: unknown): ConsciousnessLevel {
  const etiqueta = (flowData as { nivel_conciencia?: unknown } | null)?.nivel_conciencia
  if (typeof etiqueta !== "string") return 1
  return ETIQUETA_A_NIVEL[etiqueta.trim()] ?? 1
}
