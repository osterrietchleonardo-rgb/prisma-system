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

export interface AdvisorClassification {
  category: string;
  reason: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reglas por DEFECTO = deterministas (umbrales fijos). Se resuelven POR CÓDIGO.
// Clasificar "facturacion >= 10000" es un if/else: NO necesita IA.
//
// Antes esto lo hacía Gemini (gemini-3.5-flash) por CADA asesor en CADA carga del
// dashboard (director Y asesor), sin caché → miles de llamadas/día facturadas como
// output (con "thinking" incluido, ~$9/1M). Verificado 2026-07-06: ~7.000 llamadas
// en 6 días = ~US$47. Pasarlo a código lo lleva a US$0 y es instantáneo y reproducible.
// ─────────────────────────────────────────────────────────────────────────────
export function classifyByDefaultRules(stats: AdvisorStats): AdvisorClassification {
  const facturacion = stats.facturacion || 0;
  const transacciones = (stats.transacciones || 0) + (stats.reservas || 0);
  const captaciones = stats.captaciones || 0;
  const tasaciones = stats.tasaciones || 0;
  const consultas = (stats.wa_chats || 0) + (stats.prospeccion || 0);

  if (facturacion >= 10000 || transacciones >= 4) {
    return {
      category: "Elite",
      reason: `Facturación US$${facturacion.toFixed(0)} y ${transacciones} transacción(es): supera el umbral Elite.`,
    };
  }
  if (facturacion >= 3000 && transacciones >= 1) {
    return {
      category: "Sólido",
      reason: `Facturación US$${facturacion.toFixed(0)} con ${transacciones} transacción(es) cerrada(s).`,
    };
  }
  if (consultas >= 20 && (tasaciones >= 3 || captaciones >= 3)) {
    return {
      category: "En Desarrollo",
      reason: `${consultas} consultas y actividad de captación/tasación (${captaciones} captaciones, ${tasaciones} tasaciones).`,
    };
  }
  return {
    category: "Requiere Atención",
    reason: "Aún no alcanza los umbrales de facturación, transacciones ni de actividad (consultas/captaciones/tasaciones).",
  };
}

// Con reglas PERSONALIZADAS (texto libre del director) sí se usa IA para interpretarlas,
// pero con thinkingBudget:0: clasificar contra reglas NO requiere razonamiento en cadena,
// y el "thinking" se factura como output. Si la IA falla, cae a las reglas deterministas
// (nunca rompe el dashboard). Idealmente además se cachea (fase 2) para no reclasificar
// en cada render, pero con budget:0 el costo por llamada ya baja ~88%.
async function classifyWithCustomRules(
  stats: AdvisorStats,
  customInstructions: string
): Promise<AdvisorClassification> {
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

    ${customInstructions}

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
    const apiKey = process.env.GEMINI_API_KEY;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { thinkingConfig: { thinkingBudget: 0 } },
        }),
      }
    );
    if (!res.ok) throw new Error(`Gemini ${res.status}`);
    const data = await res.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    const startIndex = text.indexOf("{");
    const endIndex = text.lastIndexOf("}");
    if (startIndex === -1 || endIndex === -1) throw new Error("No JSON object found in response");

    const classification = JSON.parse(text.substring(startIndex, endIndex + 1));
    return {
      category: classification.categoria || "Sin clasificar",
      reason: classification.motivo || "No hay suficientes datos.",
    };
  } catch (error: any) {
    console.error("classifyAdvisor (custom rules) falló, uso reglas por defecto:", error?.message);
    return classifyByDefaultRules(stats);
  }
}

export async function classifyAdvisor(
  stats: AdvisorStats,
  config: AgencyPerformanceConfig | null
): Promise<AdvisorClassification> {
  const custom = config?.custom_instructions?.trim();
  // Sin reglas personalizadas → determinista por código (0 costo, instantáneo, reproducible).
  if (!custom) return classifyByDefaultRules(stats);
  // Con reglas personalizadas → IA sin "thinking".
  return classifyWithCustomRules(stats, custom);
}
