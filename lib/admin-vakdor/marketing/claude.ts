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
    max_tokens: Math.min(opts.maxTokens ?? 4000, MAX_TOKENS_TECHO),
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

export async function generarTexto(system: string, user: string, opts: OpcionesLlamada = {}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY")
  const client = new Anthropic({ apiKey })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await client.messages.create(construirParams(system, user, opts) as any)
  return extraerTexto(res.content as unknown[])
}
