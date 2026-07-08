import { GoogleGenerativeAI } from "@google/generative-ai"
import type { Semaforo } from "./types"

/**
 * Redacta 2-4 oraciones en criollo argentino sobre las métricas del día.
 * NO decide el semáforo (eso lo hace la regla fija); sólo interpreta y sugiere.
 */
export async function redactarResumen(
  experto: string,
  metricas: Record<string, unknown>,
  semaforo: Semaforo,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return "" // sin key, el tablero muestra sólo números
  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" })
    const prompt = [
      `Sos un analista interno de Vakdor (inmobiliaria + software PRISMA).`,
      `Escribí 2 a 4 oraciones, en español rioplatense simple y profesional, sin emojis,`,
      `interpretando estas métricas del experto "${experto}". El estado general es ${semaforo}.`,
      `Decí qué pasó y, si hay algo en amarillo/rojo, qué conviene hacer. No repitas todos los números.`,
      `Datos: ${JSON.stringify(metricas)}`,
    ].join(" ")
    const res = await model.generateContent(prompt)
    return res.response.text().trim()
  } catch (e) {
    return "" // si falla la IA, no rompemos la corrida
  }
}
