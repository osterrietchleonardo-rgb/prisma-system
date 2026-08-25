/**
 * Plantillas de seguimiento v2 (Super Agente, Task 12b). Textos aprobados por Leonardo el
 * 25/8/2026 tras ver ejemplos reales. Módulo PURO (sin Next/Supabase) para que lo usen el
 * provisionador (`injectCoreTemplates`) y el script one-off que las crea en agencias existentes.
 *
 * Reglas: {{1}} = nombre del lead (sin nombre válido no hay seguimiento), {{2}} = el mensaje
 * del agente. La línea de BAJA NO va en la plantilla: la agrega el ejecutor al final de {{2}}
 * a partir del 2º seguimiento sin respuesta. `seg_pendiente` va SOLO con la acción `escalar`.
 */
export interface PlantillaV2 {
  template_name: string
  category: "MARKETING" | "UTILITY"
  language: "es_AR"
  body: string
  body_examples: string[]
  buttons: never[]
}

export function plantillasV2(prefix: string, agencia: string): PlantillaV2[] {
  const A = agencia.trim()
  return [
    {
      template_name: `${prefix}_seg_retomar`,
      category: "MARKETING",
      language: "es_AR",
      body: `Hola {{1}}, ¿cómo va? Te escribo de ${A} porque me quedé pensando en tu búsqueda. {{2}} Contame y lo vemos.`,
      body_examples: ["Natalia", "La cochera era el tema que te frenaba en Núñez. ¿Seguís necesitándola sí o sí, o ya la resolviste por otro lado?"],
      buttons: [],
    },
    {
      template_name: `${prefix}_seg_valor`,
      category: "MARKETING",
      language: "es_AR",
      body: `Hola {{1}}, te escribo de ${A}. {{2}} Si te sirve, decime y te paso más.`,
      body_examples: ["Fernando", "En Belgrano hay un depto de 4 ambientes en Amenábar al 2100, apto crédito confirmado, a 159.900 USD, dentro de tu presupuesto."],
      buttons: [],
    },
    {
      template_name: `${prefix}_seg_pendiente`,
      category: "UTILITY",
      language: "es_AR",
      body: `Hola {{1}}, te escribo de ${A} por algo que te quedamos debiendo. {{2}} Perdón por la demora.`,
      body_examples: ["Maia", "Quedó pendiente confirmarte el rendimiento anual del local en Moreno 550. Estoy hablando con el asesor responsable para que se comunique con vos a la brevedad."],
      buttons: [],
    },
    {
      template_name: `${prefix}_seg_novedad`,
      category: "MARKETING",
      language: "es_AR",
      body: `Hola {{1}}, te escribo de ${A} porque apareció algo que puede interesarte. {{2}} ¿Querés que te cuente más?`,
      body_examples: ["Juan", "Entró un 2 ambientes en Caballito a 62.000 USD, sin usufructo, dentro de lo que buscabas."],
      buttons: [],
    },
    {
      template_name: `${prefix}_seg_puerta_abierta`,
      category: "MARKETING",
      language: "es_AR",
      body: `Hola {{1}}, te escribo de ${A}. {{2}} Cuando quieras retomar, escribime por acá y seguimos.`,
      body_examples: ["Mauro", "Me quedó presente tu interés en el semipiso de dos ambientes en Las Cañitas, el que tiene el balcón aterrazado que te gustó."],
      buttons: [],
    },
  ]
}

/** Nombres SIN prefijo, para el catálogo del agente (`PLANTILLAS` en lib/seguimiento/tipos.ts). */
export const NOMBRES_V2 = ["seg_retomar", "seg_valor", "seg_pendiente", "seg_novedad", "seg_puerta_abierta"] as const
