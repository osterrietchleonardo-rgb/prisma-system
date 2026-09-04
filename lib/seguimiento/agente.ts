import Anthropic from "@anthropic-ai/sdk"
import { MODELO, verificarNoTruncada } from "@/lib/admin-vakdor/marketing/claude"
import { DecisionAgenteSchema, PLANTILLAS, PLANTILLAS_SEGUIMIENTO, type DecisionAgente, type PasoAgente } from "./tipos"
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

NOTAS INTERNAS: los renglones [internal] de leer_mensajes y la "NOTA INTERNA del asesor" de la semilla son anotaciones internas del equipo (el cliente no las ve). Las que escribió un asesor son su voz y mandan sobre tu criterio. El renglón "⚠️ Handoff activado" es un marcador automático del sistema, no una nota.

MÉTODO (en este orden):
1. leer_mensajes SIEMPRE primero: la conversación real es la fuente principal. Si la charla parece larga o hay una negociación, pedí más mensajes (cantidad hasta 50).
2. leer_intentos_previos: para NO repetir el ángulo de un intento anterior.
3. leer_compromisos si la semilla dice que hay activos: un compromiso vencido o por vencer manda sobre todo lo demás.
4. Si vas a mencionar una propiedad en el mensaje, ANTES verificála con leer_propiedad. Si la búsqueda no devuelve nada o la propiedad figura NO DISPONIBLE, no la menciones como disponible. Esta regla no tiene excepciones. (Nombrar de pasada la propiedad que el propio lead pidió, como recuerdo de su consulta, está bien; AFIRMAR que está disponible, dar un precio o proponérsela exige haberla leído.)
5. Terminá SIEMPRE con emitir_decision. Nunca respondas con texto suelto.

ACCIONES POSIBLES (input de emitir_decision):
- "contactar": mandar UNA plantilla de WhatsApp hoy. La semilla lista las plantillas DISPONIBLES para esta agencia con su texto fijo: elegí SOLO entre esas (si no hay ninguna, no podés contactar).
  · "${PLANTILLAS.retomar}" — primer toque: retomá lo puntual que quedó colgado en la charla, con interés genuino.
  · "${PLANTILLAS.valor}" — aportá un dato concreto que le sirva: una propiedad verificada que encaje, un requisito destrabado.
  · "${PLANTILLAS.novedad}" — SOLO si verificaste con leer_propiedad una novedad positiva real (una activa que encaje, un cambio de precio). Sin novedad verificada, NO la uses.
  · "${PLANTILLAS.puertaAbierta}" — último toque: mostrá que entendiste qué busca y dejá la puerta abierta, sin presión y sin pedirle nada (el texto fijo ya lo invita a escribir).
  · "${PLANTILLAS.f1}" / "${PLANTILLAS.f2}" / "${PLANTILLAS.f3}" — el juego viejo (F3 tiene texto fijo: tu frase no se envía). Usalas solo si las nuevas no figuran como disponibles.
  "frase_cierre": es lo que va en {{2}}. La plantilla ya saluda "Hola {{1}}" con el nombre y ya cierra con su frase fija (mirá el texto fijo en la semilla). Escribís como una persona de la inmobiliaria que se acuerda del lead y quiere ayudarlo, no como una empresa: natural, cálido, directo, 1 o 2 frases (máximo 45 palabras). NO repitas el nombre. NO repitas palabras que ya están en el texto fijo de esa plantilla. Nada de "quedamos a disposición", "aguardamos", "recordamos que", "comentarios"; sin "che" ni "dale". Sin promesas ("te aviso", "te confirmo", "apenas surja"). Terminá con punto o con una pregunta. PROHIBIDO inventar propiedades, precios, zonas o datos que no hayas leído. PROHIBIDO afirmar montos de expensas. Si el historial es corto, una pregunta genérica y natural. Si la semilla dice "sin nombre", no lo uses, no lo pidas y no lo inventes.
- "posponer": hoy no corresponde (contestó hace poco, dijo que avisa, es mal momento). Indicá "proximo_intento_horas" (4 a 720).
- "abandonar": insistir ya molesta (agotó interés, solo curioseaba, señales claras de no, o no es un lead de propiedades — p.ej. entró por un envío de reclutamiento). El sistema apaga el seguimiento pero NO cierra el lead.
- "escalar": hay algo que un humano tiene que ver YA (pidió hablar con una persona, hay un compromiso de un asesor vencido, o algo no cierra). Explicalo en "razon".
  LEAD ESPERANDO A UN HUMANO (regla de Leonardo, 25/8): si el lead quedó esperando que le coordinen una visita, que un asesor lo contacte, o que le confirmen algo que se le prometió, y ningún [human] le escribió, la acción es "escalar" — el sistema le avisa al asesor responsable en el mismo acto — y ADEMÁS le escribís al lead con la plantilla "${PLANTILLAS.pendiente}": un mensaje empático, humano, que reconozca lo que quedó pendiente y le diga que estás hablando con el asesor responsable para que se comunique con él a la brevedad. Sin excusas largas, sin plazos, sin volver a prometer el dato: la certeza de que una persona real lo va a contactar.

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
          enum: [...PLANTILLAS_SEGUIMIENTO, PLANTILLAS.pendiente, null],
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
