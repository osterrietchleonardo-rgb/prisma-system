import type { SupabaseClient } from "@supabase/supabase-js"
import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import { MODELO } from "@/lib/admin-vakdor/marketing/claude"
import { registrarEvento } from "./eventos"
import { crearHerramientas } from "./herramientas"
import type { Candidato } from "./tipos"

/**
 * La despedida no es una espera (Kevin, 7/9; Leonardo: "que los asesores anoten cada chat
 * no es escalable ni consistente"). El caso de Agustins: Micaela le contestó, el cliente
 * cerró con «Gracias!!» y la escalera igual disparó los niveles 2/5/10 h — en la semana del
 * 1 al 7/9, 22 de 82 casos escalados terminaban en un cierre así.
 *
 * Igual que con la nota interna (4/9): la detección es determinista (hay un caso sin
 * respuesta humana después del último mensaje del lead) y la interpretación es de la IA,
 * que lee la conversación y contesta UNA pregunta: ¿ese último mensaje necesita respuesta
 * del asesor? Ante la duda, sí — un aviso de más molesta menos que un cliente perdido.
 */

export const VeredictoDespedidaSchema = z.object({
  requiere_respuesta: z.boolean(),
  razon: z.string().min(1),
})
export type VeredictoDespedida = z.infer<typeof VeredictoDespedidaSchema>
export type LlamarDespedida = (semilla: string) => Promise<VeredictoDespedida>

const PROMPT_DESPEDIDA = `Sos el intérprete de conversaciones del agente de seguimiento de una inmobiliaria argentina. El sistema avisa al asesor (y después al director) cuando un cliente queda esperando respuesta. Tu tarea: mirar el ÚLTIMO mensaje del cliente ([lead]) en el contexto de toda la conversación y decidir si necesita una respuesta del asesor.
- requiere_respuesta: false SOLO si el cliente cerró el intercambio sin dejar nada pendiente del lado de la inmobiliaria: un agradecimiento o despedida después de recibir lo que pidió ("Gracias!!", "Dale, buen finde", "Ok, perfecto"), un aviso de que ya no le interesa o ya resolvió por otro lado ("ya alquilé", "lo vemos por nuestra cuenta"), o un "yo te aviso" donde el próximo paso es del cliente.
- requiere_respuesta: true si el mensaje contiene o implica una pregunta, un pedido, un dato que el asesor tenía que confirmar (un horario propuesto, una dirección, un presupuesto que el asesor pidió), un reclamo, un "sigo esperando", o si es un audio o un mensaje que no se puede leer.
- IMPORTANTE: si lo último que recibió el cliente antes de su mensaje fue una PROMESA de contacto ("el asesor se va a comunicar", "te llamo mañana", "te confirmo y te aviso"), un "gracias" NO cierra nada: el cliente está esperando ese contacto y sigue esperando hasta que un asesor le escriba o lo llame → requiere_respuesta: true. Lo mismo si el asesor le hizo una pregunta y el cliente la contestó: ahora espera el siguiente paso.
- Los mensajes [bot] son del asistente automático (Sofía), los [human] son de un asesor de la inmobiliaria, los [internal] son notas del equipo que el cliente no ve.
- razon: una frase en castellano citando el último mensaje del cliente; la puede leer el director.
Ante la duda, requiere_respuesta=true.`

const HERRAMIENTA_VEREDICTO = {
  name: "emitir_veredicto",
  description: "Emití tu veredicto sobre el último mensaje del cliente.",
  input_schema: {
    type: "object",
    properties: {
      requiere_respuesta: { type: "boolean" },
      razon: { type: "string" },
    },
    required: ["requiere_respuesta", "razon"],
    additionalProperties: false,
  },
} as const

export function semillaDespedida(input: { mensajes: string; ahoraISO: string }): string {
  return [
    `Fecha y hora actual (Argentina): ${input.ahoraISO}`,
    `Conversación real, del más viejo al más nuevo:\n${input.mensajes}`,
    `¿El último mensaje del cliente necesita respuesta del asesor? Emití tu veredicto con emitir_veredicto.`,
  ].join("\n\n")
}

/** Mismo cliente y mismos límites que el veredicto de la nota: 20 s de timeout, un reintento. */
let clienteAnthropic: Anthropic | null = null
function anthropic(): Anthropic {
  if (!clienteAnthropic) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY")
    clienteAnthropic = new Anthropic({ apiKey, timeout: 20_000, maxRetries: 1 })
  }
  return clienteAnthropic
}

/** Una sola llamada, tool forzado, sin thinking (incompatible con tool_choice forzado). */
export function crearLlamadaDespedida(): LlamarDespedida {
  return async (semilla) => {
    const res = await anthropic().messages.create({
      model: MODELO,
      max_tokens: 600,
      system: PROMPT_DESPEDIDA,
      tools: [HERRAMIENTA_VEREDICTO] as unknown as Anthropic.Messages.ToolUnion[],
      tool_choice: { type: "tool", name: "emitir_veredicto" },
      messages: [{ role: "user", content: semilla }],
    })
    const uso = res.content.find((b) => b.type === "tool_use")
    if (!uso || uso.type !== "tool_use") throw new Error("la IA no emitió veredicto")
    return VeredictoDespedidaSchema.parse(uso.input)
  }
}

export type ResultadoDespedida = {
  resultado: "despedida" | "requiere_respuesta" | "error_ia"
  /** true si esta llamada gastó una consulta a la IA (para el tope por corrida). */
  llamoIA: boolean
}

/**
 * Una evaluación por caso (mismo t0): el marcador `despedida_evaluada` guarda el veredicto y
 * las barridas siguientes lo reutilizan sin volver a pagar. Si la IA falla queda
 * `despedida_error` y la escalera sigue como siempre.
 */
export async function procesarDespedidaDelCaso(
  db: SupabaseClient,
  c: Pick<Candidato, "id" | "agency_id" | "contact_phone" | "metricas">,
  t0: string,
  opts: { ahoraMs: number; llamar?: LlamarDespedida }
): Promise<ResultadoDespedida> {
  const { data: previa } = await db
    .from("lead_eventos").select("datos")
    .eq("conversation_id", c.id).eq("tipo", "despedida_evaluada")
    .contains("datos", { t0 })
    .order("ts", { ascending: false }).limit(1).maybeSingle()
  if (previa?.datos) {
    const guardado = (previa.datos as { requiere_respuesta?: boolean }).requiere_respuesta
    return { resultado: guardado === false ? "despedida" : "requiere_respuesta", llamoIA: false }
  }

  const mensajes = await crearHerramientas(db, c as Candidato).leer_mensajes({ cantidad: 30 })
  const ahoraISO = new Date(opts.ahoraMs).toLocaleString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).slice(0, 16)

  let veredicto: VeredictoDespedida
  try {
    veredicto = await (opts.llamar ?? crearLlamadaDespedida())(semillaDespedida({ mensajes, ahoraISO }))
  } catch (e) {
    await registrarEvento(db, c.agency_id, c.id, "despedida_error",
      `La IA no pudo leer si el cliente espera respuesta; la escalera sigue como siempre: ${String(e).slice(0, 150)}`,
      { t0 })
    return { resultado: "error_ia", llamoIA: true }
  }

  // Marcador inline y chequeado. Si no se pudo guardar, el veredicto igual manda: por una
  // despedida no se le avisa a nadie, así que lo peor que pasa es volver a preguntar en la
  // barrida siguiente (y eso lo acota el tope por corrida).
  const { error: errMarca } = await db.from("lead_eventos").insert({
    agency_id: c.agency_id,
    conversation_id: c.id,
    tipo: "despedida_evaluada",
    actor: "agente_seguimiento",
    descripcion: veredicto.requiere_respuesta
      ? `Conversación leída: el cliente espera respuesta, la escalera sigue — ${veredicto.razon}`
      : `Conversación leída: el cliente cerró y no espera respuesta, no se avisa a nadie — ${veredicto.razon}`,
    datos: { t0, ...veredicto },
  })
  if (errMarca) console.error("[seguimiento] despedida_evaluada no se pudo registrar:", errMarca.message)

  return { resultado: veredicto.requiere_respuesta ? "requiere_respuesta" : "despedida", llamoIA: true }
}
