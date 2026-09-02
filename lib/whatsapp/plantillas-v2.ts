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

/**
 * Plantillas para el EQUIPO (asesores y director) — Task 12e, análisis del 25/8. Salen del
 * mismo número de la agencia que atiende a los leads, junto con el email correspondiente.
 * Todas UTILITY (avisan de una gestión pendiente). {{1}} = nombre del destinatario; el último
 * parámetro es siempre el link al chat o a la decisión en PRISMA, seguido de un cierre fijo
 * (regla de Meta, verificada 26/8: "las variables no pueden estar al principio ni al final"). NO llevan BAJA: el opt-out
 * es sacar el teléfono del perfil. Prerrequisitos: teléfono en `profiles.phone` (E.164) y el
 * gate de internos en n8n ANTES del primer envío.
 */
export function plantillasEquipo(prefix: string): PlantillaV2[] {
  return [
    {
      template_name: `${prefix}_asesor_cliente_esperando`,
      category: "UTILITY",
      language: "es_AR",
      body: "Hola {{1}}, tenés un cliente esperando tu respuesta en PRISMA: {{2}}. Entrá y respondele desde acá: {{3}} ¡Gracias!",
      body_examples: ["Martín", "Belen pidió coordinar una visita el 1/8 y hace 3 semanas que nadie le escribe", "https://prisma.vakdor.com/asesor/leads-whatsapp"],
      buttons: [],
    },
    {
      template_name: `${prefix}_asesor_sigue_esperando`,
      category: "UTILITY",
      language: "es_AR",
      body: "Hola {{1}}, {{2}} sigue esperando desde hace {{3}}. Si no lo podés tomar, avisá por acá y lo reasignamos: {{4}} ¡Gracias!",
      body_examples: ["Martín", "Belen", "2 días", "https://prisma.vakdor.com/asesor/leads-whatsapp"],
      buttons: [],
    },
    {
      template_name: `${prefix}_director_asesor_sin_respuesta`,
      category: "UTILITY",
      language: "es_AR",
      body: "Hola {{1}}, {{2}} pese a los avisos. Decidilo en PRISMA (reasignar, tomarlo vos o dar más tiempo): {{3}} Gracias.",
      body_examples: ["Víctor", "Fernanda lleva 24 horas sin atender a Delfina, que quedó esperando la confirmación de la visita del 3/8", "https://prisma.vakdor.com/director/leads"],
      buttons: [],
    },
    {
      template_name: `${prefix}_director_aprobacion_pendiente`,
      category: "UTILITY",
      language: "es_AR",
      body: "Hola {{1}}, el agente necesita tu OK para {{2}}. Revisalo y decidí en PRISMA: {{3}} Gracias.",
      body_examples: ["Víctor", "crear una plantilla nueva de seguimiento para leads que piden tasación", "https://prisma.vakdor.com/director/configuracion"],
      buttons: [],
    },
  ]
}

export const NOMBRES_EQUIPO = [
  "asesor_cliente_esperando",
  "asesor_sigue_esperando",
  "director_asesor_sin_respuesta",
  "director_aprobacion_pendiente",
] as const
