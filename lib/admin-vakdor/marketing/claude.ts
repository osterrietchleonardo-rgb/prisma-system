import Anthropic from "@anthropic-ai/sdk"

const MODEL = "claude-opus-4-8" // default del SDK (confirmado con la skill claude-api)

export async function generarTexto(system: string, user: string, maxTokens = 4000): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY")
  const client = new Anthropic({ apiKey })
  // Sin temperature/top_p/top_k: Opus 4.8 los rechaza con 400. Sin streaming: max_tokens <= 16000.
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  })
  const parts = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
  return parts.join("\n").trim()
}
