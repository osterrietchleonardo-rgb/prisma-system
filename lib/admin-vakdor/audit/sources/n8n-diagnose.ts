// Diagnóstico de errores de n8n: trae el detalle de la última ejecución con error de
// cada workflow (mensaje + nodo que falló) y le pide a Gemini que redacte, para cada uno,
// una causa en criollo y una corrección posible. Una sola llamada al modelo para los N errores.
import { GoogleGenerativeAI } from "@google/generative-ai"
import { n8nGetAuth } from "./n8n"

interface ErrorDetalle {
  workflow: string
  message: string
  node: string
}

/** Trae message + nodo que falló de una ejecución con error. */
async function detalleError(execId: string): Promise<{ message: string; node: string } | null> {
  try {
    const j = await n8nGetAuth(`/executions/${execId}?includeData=true`)
    const rd = j?.data?.resultData
    const message: string = rd?.error?.message ?? ""
    const node: string = rd?.error?.node?.name ?? rd?.lastNodeExecuted ?? ""
    if (!message && !node) return null
    return { message: message || "(sin mensaje)", node: node || "(desconocido)" }
  } catch {
    return null
  }
}

/**
 * Para cada workflow con un error reciente, devuelve { causa, correccion }.
 * `ultimoErrorId`: mapa workflow -> exec id (de getN8nHealth). Los null se omiten.
 */
export async function diagnosticarN8n(
  ultimoErrorId: Record<string, string | null>,
): Promise<Record<string, { causa: string; correccion: string }>> {
  const out: Record<string, { causa: string; correccion: string }> = {}
  try {
    // 1. Traer el detalle de cada error (en paralelo).
    const pares = Object.entries(ultimoErrorId).filter(([, id]) => !!id) as [string, string][]
    const detalles: ErrorDetalle[] = []
    await Promise.all(
      pares.map(async ([workflow, id]) => {
        const d = await detalleError(id)
        if (d) detalles.push({ workflow, message: d.message, node: d.node })
      }),
    )
    if (!detalles.length) return out

    // 2. Una sola llamada a Gemini para diagnosticar todos.
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return out
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" })
    const lista = detalles
      .map((d, i) => `${i + 1}. Workflow "${d.workflow}" — nodo "${d.node}" — error: ${d.message}`)
      .join("\n")
    const prompt = [
      `Sos un ingeniero que mantiene automatizaciones de n8n (inmobiliaria Vakdor / PRISMA).`,
      `Para cada error de abajo, escribí en español rioplatense simple:`,
      `- "causa": qué provocó el error, en 1 oración clara (sin jerga innecesaria).`,
      `- "correccion": el arreglo concreto sugerido, en 1 oración.`,
      `Respondé SOLO un JSON array, un objeto por error, en el MISMO orden, con la forma`,
      `[{"workflow":"...","causa":"...","correccion":"..."}]. Sin texto extra.`,
      ``,
      `Errores:`,
      lista,
    ].join("\n")

    const res = await model.generateContent(prompt)
    const txt = res.response.text().trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim()
    const arr: { workflow: string; causa: string; correccion: string }[] = JSON.parse(txt)
    for (const item of arr) {
      if (item?.workflow) out[item.workflow] = { causa: item.causa ?? "", correccion: item.correccion ?? "" }
    }
    return out
  } catch {
    return out // si algo falla, el snapshot queda sin causa/corrección (no rompe)
  }
}
