import Anthropic from "@anthropic-ai/sdk"
import { MODELO, verificarNoTruncada } from "@/lib/admin-vakdor/marketing/claude"
import { DecisionAgenteSchema, PLANTILLAS, type DecisionAgente, type PasoAgente } from "./tipos"
import type { Herramientas } from "./herramientas"

export const MAX_ITERACIONES = 6
const MAX_TOKENS = 4000

/**
 * Bloque estable. El cache_control del final cubre TODO el prefijo (tools + system):
 * a partir de la 2ª llamada del loop se lee al 10% del costo.
 * Las reglas duras NO viven acá (guardrails.ts + requisitosInvestigacion); esto guía el criterio.
 */
export const PROMPT_AGENTE = `Sos el agente de seguimiento de una inmobiliaria argentina. Tu trabajo NO es mandar mensajes: es DECIDIR, para un lead puntual, si corresponde contactarlo hoy, esperar, o dejar de insistir. Un buen asesor sabe cuándo NO escribir. Menos mensajes, mejor dirigidos.

REGLA DE ORO: ninguna afirmación sin el dato leído. Todo lo que digas en la frase o en la razón tiene que salir de algo que LEÍSTE en esta investigación con tus herramientas. Si no lo leíste, no existe.

MÉTODO (en este orden):
1. leer_mensajes SIEMPRE primero: la conversación real es la fuente principal. Si la charla parece larga o hay una negociación, pedí más mensajes (cantidad hasta 50).
2. leer_intentos_previos: para NO repetir el ángulo de un intento anterior.
3. leer_compromisos si la semilla dice que hay activos: un compromiso vencido o por vencer manda sobre todo lo demás.
4. Si vas a mencionar una propiedad en el mensaje, ANTES verificála con leer_propiedad. Si la búsqueda no devuelve nada o la propiedad figura NO DISPONIBLE, no la menciones como disponible. Esta regla no tiene excepciones.
5. Terminá SIEMPRE con emitir_decision. Nunca respondas con texto suelto.

ACCIONES POSIBLES (input de emitir_decision):
- "contactar": mandar UNA plantilla de WhatsApp hoy. Elegí cuál:
  · "${PLANTILLAS.f1}" — primer toque suave, retoma una duda o interés puntual del historial.
  · "${PLANTILLAS.f2}" — segundo toque, aporta valor o destraba un requisito (presupuesto, zona, requisito excluyente).
  · "${PLANTILLAS.f3}" — último toque, cierre honesto y puerta abierta. OJO: su texto es fijo — tu frase_cierre NO se envía en f3 (escribila igual: queda como registro de tu criterio).
  "frase_cierre": la frase que completa la plantilla. Español rioplatense (voseo: querés, pudiste, te sirve), tono conversacional, sin presión. PROHIBIDO inventar propiedades, precios, zonas o datos que no hayas leído. PROHIBIDO afirmar montos de expensas. PROHIBIDO prometer "te confirmo y te aviso". Si el historial es corto, pregunta genérica y natural. Terminá con una pregunta fácil de responder.
- "posponer": hoy no corresponde (contestó hace poco, dijo que avisa, es mal momento). Indicá "proximo_intento_horas" (4 a 720).
- "abandonar": insistir ya molesta (agotó interés, solo curioseaba, señales claras de no, o no es un lead de propiedades — p.ej. entró por un envío de reclutamiento). El sistema apaga el seguimiento pero NO cierra el lead.
- "escalar": hay algo que un humano tiene que ver YA (pidió hablar con una persona, hay un compromiso de un asesor vencido, o algo no cierra). Explicalo en "razon".

CAMPOS:
- "razon": la lee el asesor humano. Clara, en castellano, una o dos frases.
- "evidencia": citá el dato concreto que sostiene la decisión — el mensaje (con fecha), la métrica o la propiedad verificada. Sin evidencia real, bajá la confianza y posponé.
- "confianza": 0 a 1. Si dudás, bajala — con menos de 0.5 el sistema no ejecuta.`

/** Definición de tools para la API. El validador real de emitir_decision es Zod (abajo). */
export const HERRAMIENTAS_API = [
  {
    name: "leer_mensajes",
    description:
      "Lee los últimos N mensajes reales de la conversación de WhatsApp con este lead, con autor y fecha, de viejo a nuevo. Empezá SIEMPRE por acá.",
    input_schema: {
      type: "object",
      properties: {
        cantidad: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          description: "cuántos mensajes traer (default 10)",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "leer_intentos_previos",
    description:
      "Lee los intentos de seguimiento ya enviados a este lead, con la razón de cada uno y su resultado. Obligatorio antes de contactar: nunca repitas un ángulo.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "leer_compromisos",
    description:
      "Lee los compromisos activos de este lead (visitas agendadas, respuestas pendientes) con quién los asumió y cuándo vencen.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "leer_propiedad",
    description:
      "Busca una propiedad REAL de la agencia por dirección, barrio, ciudad o título y devuelve su estado actual (precio, disponibilidad, notas del asesor). OBLIGATORIO antes de mencionar cualquier propiedad en el mensaje.",
    input_schema: {
      type: "object",
      properties: {
        busqueda: { type: "string", description: "dirección, barrio, ciudad o parte del título" },
      },
      required: ["busqueda"],
      additionalProperties: false,
    },
  },
  {
    name: "emitir_decision",
    description:
      "Emite tu decisión final para este lead. Terminá SIEMPRE la investigación con esta herramienta.",
    input_schema: {
      type: "object",
      properties: {
        accion: { type: "string", enum: ["contactar", "posponer", "abandonar", "escalar"] },
        plantilla: {
          type: ["string", "null"],
          enum: [PLANTILLAS.f1, PLANTILLAS.f2, PLANTILLAS.f3, null],
        },
        frase_cierre: {
          type: ["string", "null"],
          description: "la frase que completa la plantilla; null si no contactás",
        },
        proximo_intento_horas: { type: ["integer", "null"], minimum: 4, maximum: 720 },
        razon: { type: "string", description: "en castellano; la lee el asesor" },
        evidencia: {
          type: "string",
          description:
            "el dato concreto que sostiene la decisión: mensaje citado, métrica o propiedad verificada",
        },
        confianza: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["accion", "razon", "evidencia", "confianza"],
      additionalProperties: false,
    },
  },
] as const

export type LlamarAPI = (messages: Anthropic.MessageParam[]) => Promise<Anthropic.Message>

function crearLlamadaReal(): LlamarAPI {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY")
  const client = new Anthropic({ apiKey })
  return (messages) =>
    client.messages.create({
      model: MODELO,
      max_tokens: MAX_TOKENS,
      thinking: { type: "adaptive" },
      // Un solo breakpoint al final del system cachea TODO el prefijo estable
      // (tools + system). Lo variable (el lead) va en messages.
      system: [{ type: "text", text: PROMPT_AGENTE, cache_control: { type: "ephemeral" } }],
      tools: HERRAMIENTAS_API as unknown as Anthropic.Messages.ToolUnion[],
      messages,
    })
}

export interface TokensLoop {
  entrada: number
  salida: number
  cacheLeido: number
}
export interface ResultadoAgente {
  decision: DecisionAgente
  pasos: PasoAgente[]
  tokens: TokensLoop
}

/** Regla dura en código: contactar exige haber leído mensajes e intentos previos. */
export function requisitosInvestigacion(d: DecisionAgente, pasos: PasoAgente[]): string | null {
  if (d.accion !== "contactar") return null
  const usadas = new Set(pasos.map((p) => p.herramienta))
  if (!usadas.has("leer_mensajes"))
    return "rechazada: antes de contactar tenés que leer los mensajes reales (leer_mensajes)"
  if (!usadas.has("leer_intentos_previos"))
    return "rechazada: antes de contactar tenés que revisar los intentos previos (leer_intentos_previos)"
  return null
}

/** Sonnet 5, precio de lista USD/MTok. El costo real se coteja contra la Console (Task 12). */
const TARIFA = { entrada: 3, salida: 15, cacheLeido: 0.3 }
export function estimarCostoUSD(t: TokensLoop): number {
  return (t.entrada * TARIFA.entrada + t.salida * TARIFA.salida + t.cacheLeido * TARIFA.cacheLeido) / 1e6
}

/**
 * El loop. Si en MAX_ITERACIONES no hay decisión válida: throw — el runner registra el
 * error y NO se manda nada (degradación elegante).
 */
export async function decidirConAgente(
  semilla: string,
  herramientas: Herramientas,
  llamar: LlamarAPI = crearLlamadaReal()
): Promise<ResultadoAgente> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: semilla }]
  const pasos: PasoAgente[] = []
  const tokens: TokensLoop = { entrada: 0, salida: 0, cacheLeido: 0 }

  for (let i = 0; i < MAX_ITERACIONES; i++) {
    const res = await llamar(messages)
    verificarNoTruncada(res.stop_reason, MAX_TOKENS)
    tokens.entrada += res.usage.input_tokens
    tokens.salida += res.usage.output_tokens
    tokens.cacheLeido += res.usage.cache_read_input_tokens ?? 0

    const llamadas = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
    if (!llamadas.length)
      throw new Error(`el agente terminó sin emitir decisión (stop: ${res.stop_reason})`)

    // El content COMPLETO vuelve como assistant (thinking incluido: lo exige el tool use)
    messages.push({ role: "assistant", content: res.content })

    const resultados: Anthropic.ToolResultBlockParam[] = []
    for (const tu of llamadas) {
      if (tu.name === "emitir_decision") {
        const parseada = DecisionAgenteSchema.safeParse(tu.input)
        if (!parseada.success) {
          resultados.push({
            type: "tool_result",
            tool_use_id: tu.id,
            is_error: true,
            content: `decisión inválida, corregila: ${parseada.error.issues.map((x) => x.message).join("; ")}`,
          })
          continue
        }
        const rechazo = requisitosInvestigacion(parseada.data, pasos)
        if (rechazo) {
          resultados.push({ type: "tool_result", tool_use_id: tu.id, is_error: true, content: rechazo })
          continue
        }
        return { decision: parseada.data, pasos, tokens }
      }
      const fn = herramientas[tu.name as keyof Herramientas]
      if (!fn) {
        resultados.push({
          type: "tool_result",
          tool_use_id: tu.id,
          is_error: true,
          content: `herramienta desconocida: ${tu.name}`,
        })
        continue
      }
      const salida = await fn(tu.input as never)
      pasos.push({
        herramienta: tu.name,
        input: tu.input as Record<string, unknown>,
        resumen: salida.slice(0, 200),
      })
      resultados.push({ type: "tool_result", tool_use_id: tu.id, content: salida })
    }
    messages.push({ role: "user", content: resultados })
  }
  throw new Error(`el agente agotó ${MAX_ITERACIONES} iteraciones sin decisión válida`)
}
