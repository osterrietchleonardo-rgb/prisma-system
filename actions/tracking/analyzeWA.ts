"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { ParsedMessage } from "@/lib/tracking/waParser";

export async function analyzeWA(messages: ParsedMessage[], usuarioName: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY is missing.");
    throw new Error("Missing API Key");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-3.5-flash",
    systemInstruction: `
Sos un analizador de conversaciones de WhatsApp para asesores inmobiliarios argentinos.
El asesor se llama "${usuarioName}".
Analizá el desempeño comercial del asesor en esta conversación con un potencial cliente.
Respondé ÚNICAMENTE con JSON válido sin backticks ni texto adicional. Estructura:
{
  "tono": "formal" | "informal" | "profesional" | "agresivo" | "pasivo",
  "nivel_personalizacion": "alto" | "medio" | "bajo",
  "ofrecio_visita": boolean,
  "ofrecio_propiedades": boolean,
  "seguimiento_activo": boolean,
  "uso_nombre_lead": boolean,
  "escucha_activa": boolean,
  "score_profesionalismo": 1 a 10,
  "score_general": 1 a 10,
  "puntos_positivos": [máx 3 strings concretos],
  "puntos_mejora": [máx 3 strings concretos],
  "resumen": "2 oraciones evaluando el desempeño comercial"
}
`,
  });

  // Get first 120 text messages
  const sample = messages.slice(0, 120).map(m => `[${m.timestamp.toISOString()}] ${m.sender}: ${m.text}`).join("\n");

  try {
    const response = await model.generateContent(`Analizá la siguiente conversación (primeros mensajes):\n\n${sample}`);
    const completionText = response.response.text();
    
    let cleanJson = completionText.trim();
    if (cleanJson.startsWith("```json")) {
      cleanJson = cleanJson.replace(/^```json\s*/, "").replace(/```$/, "").trim();
    } else if (cleanJson.startsWith("```")) {
      cleanJson = cleanJson.replace(/^```\s*/, "").replace(/```$/, "").trim();
    }

    return JSON.parse(cleanJson);
  } catch (error) {
    console.error("Error analyzing WA with Gemini:", error);
    throw error;
  }
}
