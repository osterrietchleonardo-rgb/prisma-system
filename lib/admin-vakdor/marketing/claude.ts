import Anthropic from "@anthropic-ai/sdk"

export const MODELO = "claude-sonnet-5"

const MAX_TOKENS_TECHO = 8000

export interface OpcionesLlamada {
  maxTokens?: number
  /** "low" para tareas mecánicas (clasificar). Se omite para redacción: el default es el bueno. */
  effort?: "low" | "medium" | "high"
  /** true para bloques de system grandes y estables (skills): los cachea y se leen al 10%. */
  cachearSystem?: boolean
}

/**
 * Arma el body de la llamada. Separado de la llamada para poder testearlo.
 * OJO: temperature/top_p/top_k y budget_tokens devuelven 400 en Sonnet 5.
 */
export function construirParams(system: string, user: string, opts: OpcionesLlamada = {}) {
  const bloqueSystem: Record<string, unknown> = { type: "text", text: system }
  if (opts.cachearSystem) bloqueSystem.cache_control = { type: "ephemeral" }

  const params: Record<string, unknown> = {
    model: MODELO,
    // El thinking adaptativo consume el MISMO presupuesto de salida que el texto visible:
    // un límite pensado solo para el texto trunca la respuesta. Por eso el default es el techo.
    max_tokens: Math.min(opts.maxTokens ?? MAX_TOKENS_TECHO, MAX_TOKENS_TECHO),
    thinking: { type: "adaptive" },
    system: [bloqueSystem],
    messages: [{ role: "user", content: user }],
  }
  if (opts.effort) params.output_config = { effort: opts.effort }
  return params
}

/** Sonnet 5 devuelve también bloques `thinking`: hay que quedarse solo con los de texto. */
export function extraerTexto(content: unknown[]): string {
  return (content as { type: string; text?: string }[])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("")
    .trim()
}

/**
 * `stop_reason: "max_tokens"` = la respuesta viene cortada a la mitad. Los caminos que parsean
 * JSON explotan solos (JSON.parse tira), pero los de texto crudo — la reescritura de la revisión —
 * devuelven una pieza a medio escribir que NO es falsy y pisa en silencio a una completa.
 * Se trata como fallo de la llamada: quien llama decide (acá, conservar el texto original).
 */
export function verificarNoTruncada(stopReason: unknown, maxTokens: unknown): void {
  if (stopReason === "max_tokens") {
    throw new Error(`respuesta truncada por max_tokens (${String(maxTokens)}): el thinking adaptativo consumió el presupuesto de salida`)
  }
}

export async function generarTexto(system: string, user: string, opts: OpcionesLlamada = {}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY")
  const client = new Anthropic({ apiKey })
  const params = construirParams(system, user, opts)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await client.messages.create(params as any)
  verificarNoTruncada((res as { stop_reason?: unknown }).stop_reason, params.max_tokens)
  return extraerTexto(res.content as unknown[])
}
