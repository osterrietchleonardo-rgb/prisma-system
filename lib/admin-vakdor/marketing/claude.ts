import { GoogleGenerativeAI } from "@google/generative-ai"

const MODEL = "gemini-3.5-flash"

export async function generarTexto(system: string, user: string, maxTokens = 4000): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error("Falta GEMINI_API_KEY")
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction: system,
    generationConfig: {
      maxOutputTokens: maxTokens,
    },
  })
  const res = await model.generateContent(user)
  return res.response.text().trim()
}
