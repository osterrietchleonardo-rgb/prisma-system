"use server";

import Anthropic from "@anthropic-ai/sdk";
import { ParsedMessage } from "@/lib/tracking/waParser";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "", // Ensure it's in .env
});

export async function analyzeWA(messages: ParsedMessage[], usuarioName: string) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is missing.");
    throw new Error("Missing API Key");
  }

  // Get first 120 text messages
  const sample = messages.slice(0, 120).map(m => `[${m.timestamp.toISOString()}] ${m.sender}: ${m.text}`).join("\n");

  const systemPrompt = `
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
`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Analizá la siguiente conversación (primeros mensajes):\n\n${sample}`
        }
      ]
    });

    const completionText = response.content[0].type === 'text' ? response.content[0].text : "";
    // Regex or simple parse assuming output is plain JSON
    let cleanJson = completionText.trim();
    if (cleanJson.startsWith("```json")) {
      cleanJson = cleanJson.replace(/```json/g, "").replace(/```/g, "").trim();
    }

    return JSON.parse(cleanJson);
  } catch (error) {
    console.error("Error analyzing WA with Anthropic:", error);
    throw error;
  }
}
