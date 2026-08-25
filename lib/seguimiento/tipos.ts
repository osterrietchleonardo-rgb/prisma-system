import { z } from "zod"

/** Nombres SIN prefijo de agencia: el dispatch antepone `ag<6hex>_` solo. */
export const PLANTILLAS = {
  f1: "seg_f1_seguimiento",
  f2: "seg_f2_valor",
  f3: "seg_f3_breakup",
  visita24: "visita_recordatorio_24h",
  visita3: "visita_recordatorio_3h",
  visita1: "visita_recordatorio_1h",
  noShow: "visita_post_noshow", // nombre real verificado 24/8 (Task 0)
  reactivacion: "reactivacion_snoozed", // la 8ª del catálogo; candidata futura del decisor
  // ── v2 (Task 12b, aprobadas por Leonardo el 25/8): {{1}} nombre, {{2}} mensaje del agente ──
  retomar: "seg_retomar",
  valor: "seg_valor",
  pendiente: "seg_pendiente", // SOLO junto con "escalar": el lead esperaba a un humano
  novedad: "seg_novedad",
  puertaAbierta: "seg_puerta_abierta",
} as const

/** Plantillas que el decisor puede elegir. Hasta que las v2 estén aprobadas en Meta, el
 *  dispatch rechaza las que no existan (queda `bloqueada_*`, nunca un envío a ciegas). */
export const PLANTILLAS_SEGUIMIENTO = [
  PLANTILLAS.f1, PLANTILLAS.f2, PLANTILLAS.f3,
  PLANTILLAS.retomar, PLANTILLAS.valor, PLANTILLAS.novedad, PLANTILLAS.puertaAbierta,
] as const

/*
 * Variables por plantilla (cuerpos reales verificados 24/8 en whatsapp-templates.ts):
 *   f1/f2:            [nombre, frase]      f3: [nombre] — SIN frase, el cierre es fijo
 *   visita24/visita3: [nombre, hora, direccion]     visita1: [nombre, hora]
 *   noShow:           [nombre]            reactivacion: [nombre, frase]
 */

const camposDecision = {
  accion: z.enum(["contactar", "posponer", "abandonar", "escalar"]),
  plantilla: z.enum([...PLANTILLAS_SEGUIMIENTO, PLANTILLAS.pendiente]).nullable(),
  /** La frase que completa la variable {{2}} de la plantilla. */
  frase_cierre: z.string().min(5).max(300).nullable(),
  proximo_intento_horas: z.number().int().min(4).max(720).nullable(),
  /** En castellano. La ve el asesor en la ficha. */
  razon: z.string().min(10).max(500),
  confianza: z.number().min(0).max(1),
}

type CamposDecision = {
  accion: string
  plantilla: string | null
  frase_cierre: string | null
  proximo_intento_horas: number | null
}

function validarCoherencia(d: CamposDecision, ctx: z.RefinementCtx) {
  if (d.accion === "contactar" && (!d.plantilla || !d.frase_cierre))
    ctx.addIssue({ code: "custom", message: "contactar exige plantilla y frase_cierre" })
  if (d.accion === "contactar" && d.plantilla === PLANTILLAS.pendiente)
    ctx.addIssue({ code: "custom", message: "seg_pendiente solo va con escalar (el lead esperaba a un humano)" })
  if (d.accion === "posponer" && d.proximo_intento_horas == null)
    ctx.addIssue({ code: "custom", message: "posponer exige proximo_intento_horas" })
  // escalar: plantilla opcional, pero si la lleva es seg_pendiente con su frase
  if (d.accion === "escalar" && d.plantilla && (d.plantilla !== PLANTILLAS.pendiente || !d.frase_cierre))
    ctx.addIssue({ code: "custom", message: "escalar solo admite seg_pendiente, y con frase_cierre" })
}

export const DecisionSchema = z.object(camposDecision).superRefine(validarCoherencia)
export type Decision = z.infer<typeof DecisionSchema>

/** La decisión del agente suma la evidencia citada. Asignable a Decision. */
export const DecisionAgenteSchema = z
  .object({
    ...camposDecision,
    /** Qué dato concreto sostiene la decisión: el mensaje, la métrica o la propiedad LEÍDA. */
    evidencia: z.string().min(15).max(400),
  })
  .superRefine(validarCoherencia)
export type DecisionAgente = z.infer<typeof DecisionAgenteSchema>

/** Un paso de investigación del loop. Se guarda en contexto_snapshot y se ve en el panel. */
export interface PasoAgente {
  herramienta: string
  input: Record<string, unknown>
  /** Primeros 200 caracteres del resultado, para el trace. */
  resumen: string
}

/** Fila de wa_conversations que devuelve seguimiento_candidatos(). Solo lo que se usa. */
export interface Candidato {
  id: string
  agency_id: string
  contact_phone: string
  contact_name: string | null
  funnel_status: string
  visit_status: string
  visit_scheduled_at: string | null
  visit_address: string | null
  follow_ups_sent: number
  next_follow_up_at: string | null
  last_message_at: string | null
  metricas: Record<string, unknown>
  follow_ups_history: Array<Record<string, unknown>> | null
  requires_follow_up: boolean
  bot_active: boolean
  opt_out: boolean
}

export interface ConfigAgencia {
  agency_id: string
  modo: "apagado" | "sombra" | "activo"
  silencio_minimo_horas: number
  max_intentos: number
  max_mensajes_dia: number
  escalamiento_horas: number
  max_escalamientos_dia: number
}

export interface CompromisoActivo {
  tipo: string
  descripcion: string
  asumido_por: string
  vence_en: string | null
}
