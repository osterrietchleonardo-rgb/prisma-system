import { prismaIA } from "@/lib/gemini";
import { AgencyPerformanceConfig } from "./types";

export interface AdvisorStats {
  name: string;
  captaciones: number;
  transacciones: number;
  facturacion: number;
  rotacion: number;
}

export async function classifyAdvisor(
  stats: AdvisorStats,
  config: AgencyPerformanceConfig | null
) {
  const defaultPrompt = `
    Clasifica al asesor en una de estas categorías: 'Elite', 'Sólido', 'En Desarrollo' o 'Bajo Rendimiento'.
    Usa los siguientes criterios generales si no hay específicos:
    - Elite: > 5 captaciones o > $10,000 facturados.
    - Sólido: 2-4 captaciones o $3,000-$9,000 facturados.
    - En Desarrollo: 1 captación o < $3,000 facturados.
  `;

  const prompt = `
    Eres un Director Comercial experto. Tu tarea es clasificar el desempeño MENSUAL de un asesor.
    
    CRITERIOS DEL DIRECTOR (PROMPT):
    ${config?.custom_instructions || defaultPrompt}

    DATOS DEL ASESOR (${stats.name}):
    - Captaciones totales: ${stats.captaciones}
    - Transacciones (cierres): ${stats.transacciones}
    - Facturación total (Comisiones): $${stats.facturacion} USD
    - Rotación de cartera: ${stats.rotacion.toFixed(1)}%

    REGLAS:
    1. Devuelve un JSON con "categoria" (nombre de la clase) y "motivo" (breve explicación).
    2. Si el Director definió su propio sistema de clases en el prompt de arriba, respetalo estrictamente.
    3. Responde ÚNICAMENTE el JSON.
  `;

  try {
    const result = await prismaIA.generateContent(prompt);
    const text = result.response.text();
    const cleanJson = text.replace(/```json|```/g, "").trim();
    const classification = JSON.parse(cleanJson);
    
    return {
      category: classification.categoria || "Sin clasificar",
      reason: classification.motivo || "No hay suficientes datos."
    };
  } catch (error) {
    console.error("Error classifying advisor:", error);
    return {
      category: "Error",
      reason: "No se pudo calcular la clasificación."
    };
  }
}
