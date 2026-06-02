import { prismaIA } from "@/lib/gemini";
import { AgencyPerformanceConfig } from "./types";

export interface AdvisorStats {
  name: string;
  wa_chats?: number;
  prospeccion?: number;
  tasaciones?: number;
  compradores?: number;
  captaciones: number;
  reservas?: number;
  transacciones: number;
  facturacion: number;
  cartera_activa?: number;
  rotacion: number;
}

export async function classifyAdvisor(
  stats: AdvisorStats,
  config: AgencyPerformanceConfig | null
) {
  const defaultPrompt = `
    Evalúa los pasos en orden. En cuanto se cumple una categoría, asígnala:
    - Elite: facturacion_usd >= 10000 O transacciones >= 4
    - Sólido: facturacion_usd >= 3000 Y transacciones >= 1
    - En Desarrollo: consultas >= 20 Y (tasaciones >= 3 O captaciones >= 3)
    - Requiere Atención: si no cumple nada de lo anterior.
  `;

  const prompt = `
    Eres un clasificador de rendimiento comercial inmobiliario. Tu única función es determinar la categoría de un asesor a partir de los datos del mes. La clasificación es determinista y reproducible.

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    SECCIÓN 1 — VARIABLES DE ENTRADA (SISTEMA)
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    Para esta evaluación considerarás los siguientes datos exactos:
    facturacion_usd  =  ${stats.facturacion.toFixed(2)}
    transacciones    =  ${stats.transacciones + (stats.reservas || 0)}
    captaciones      =  ${stats.captaciones}
    cartera_activa   =  ${stats.cartera_activa || 0}
    tasaciones       =  ${stats.tasaciones || 0}
    consultas        =  ${(stats.wa_chats || 0) + (stats.prospeccion || 0)}
    rotacion_pct     =  ${stats.rotacion.toFixed(1)}

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    SECCIÓN 2 — LÓGICA DE CLASIFICACIÓN (DIRECTOR)
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    Aplica estrictamente las siguientes reglas para determinar la categoría:
    
    ${config?.custom_instructions || defaultPrompt}

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    SECCIÓN 3 — FORMATO DE SALIDA ESTRICTO
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    Por requerimientos técnicos del sistema, tu salida DEBE ser un único objeto JSON válido sin bloques de código markdown, con esta estricta estructura:
    {
      "categoria": "[Clasificación final elegida]",
      "motivo": "[Breve explicación de por qué obtuvo esta categoría detallando los valores que cumplió de la lógica]"
    }
  `;

  try {
    const result = await prismaIA.generateContent(prompt);
    const text = result.response.text();
    
    // Find the first { and last } to extract just the JSON part
    const startIndex = text.indexOf('{');
    const endIndex = text.lastIndexOf('}');
    
    if (startIndex === -1 || endIndex === -1) {
      throw new Error("No JSON object found in response");
    }
    
    const cleanJson = text.substring(startIndex, endIndex + 1);
    const classification = JSON.parse(cleanJson);
    
    return {
      category: classification.categoria || "Sin clasificar",
      reason: classification.motivo || "No hay suficientes datos."
    };
  } catch (error: any) {
    console.error("Error classifying advisor:", error);
    try {
      require("fs").writeFileSync("debug-error.log", String(error?.stack || error) + "\\n" + String(error?.message), { flag: 'a' });
    } catch (e) {}
    return {
      category: "Error",
      reason: error?.message || "Error al conectar con la IA."
    };
  }
}
