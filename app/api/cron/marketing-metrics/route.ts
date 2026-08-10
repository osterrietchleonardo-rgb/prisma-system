import { NextResponse } from "next/server"
import { assertCron } from "@/lib/admin-vakdor/cron-auth"
import { getAdminDb } from "@/lib/admin-vakdor/logger"
import { prismaIA } from "@/lib/gemini"
import { loadMarketingMetricsPayload, type MarketingMetricsPayload } from "@/lib/admin-vakdor/marketing/metricas"

export const dynamic = "force-dynamic"
export const maxDuration = 120

const PERIODOS = ["7d", "30d", "90d"] as const

function armarPrompt(periodo: string, payload: MarketingMetricsPayload) {
  const pasos = payload.funnel.map((s, i) => `${i + 1}. ${s.label} (${s.sublabel})`).join(" -> ")

  return `Sos el CMO y Growth Hacker Senior de Vakdor, una empresa SaaS argentina para inmobiliarias que ofrece la plataforma PRISMA.
Analizá los datos reales de vakdor.com: tráfico y embudo (Google Analytics 4), búsquedas orgánicas (Google Search Console),
totales orgánicos de LinkedIn (Buffer), comportamiento (Microsoft Clarity) y distribución de contenidos por ángulo/formato.

DATOS DE MARKETING Y EMBUDO (Período: ${periodo}):
${JSON.stringify(payload, null, 2)}

CÓMO LEER ESTOS DATOS (respetalo, no inventes):
- El embudo tiene ${payload.funnel.length} pasos: ${pasos}.
- "count" son PERSONAS distintas y "eventCount" son veces que ocurrió. Usá personas para hablar de conversión.
- "noCalificados" son los que enviaron el formulario y el pre-filtro NO les abrió el calendario. No es una fuga a corregir con copy: es filtrado a propósito.
- "sources" dice qué fuentes respondieron. Si alguna está en "error" o "sin_token", sus números son cero por falta de datos, NO por mal rendimiento: decilo así.
- Clarity cubre solo los últimos ${payload.sources.clarityDias} días, sin importar el período elegido.
- De LinkedIn solo hay TOTALES del período (posts, impresiones, alcance, reacciones, comentarios).
  NO tenés el detalle post por post, así que NO menciones publicaciones concretas, ni ganchos, ni títulos, ni cuál funcionó mejor.
- Si un número es cero porque nadie llegó a esa etapa, decilo tal cual. Nunca completes con datos que no están.

Respondé ÚNICAMENTE con un JSON válido con esta estructura exacta:
{
  "analisis_actual": "2 a 4 oraciones sobre la salud del embudo, señalando el paso donde se pierde más gente y con qué números lo afirmás.",
  "analisis_mejora": [
    "3 a 5 mejoras concretas de alto impacto (copy, CTA, experiencia del video, formulario), atadas al paso del embudo que las justifica."
  ],
  "proximo_paso": [
    "3 a 4 acciones prioritarias inmediatas en orden de ejecución."
  ],
  "ranking_analisis": "Lectura del canal de LinkedIn usando SOLO los totales disponibles (cantidad de posts, impresiones, alcance, reacciones, comentarios, engagement). Si no alcanzan para concluir algo, decí explícitamente qué falta medir."
}
Español rioplatense profesional, sin relleno. No agregues ningún texto fuera del JSON.`
}

export async function GET(req: Request) {
  const denied = assertCron(req)
  if (denied) return denied

  try {
    // Los payloads se piden de a uno: así Clarity se consulta una sola vez
    // (cachea internamente) y no se queman 3 de las 10 llamadas diarias.
    const payloads: MarketingMetricsPayload[] = []
    for (const periodo of PERIODOS) {
      payloads.push(await loadMarketingMetricsPayload(periodo))
    }

    // El análisis se genera para los TRES períodos: antes solo existía el de 30d
    // y el panel prometía un análisis que en 7d y 90d nunca iba a aparecer.
    const db = getAdminDb()
    const generated_at = new Date().toISOString()

    const resultados = await Promise.allSettled(
      PERIODOS.map(async (periodo, i) => {
        const aiResult = await prismaIA.generateContent(armarPrompt(periodo, payloads[i]))
        const text = aiResult.response.text()
        const contenido = JSON.parse(text.replace(/```json|```/g, "").trim())

        const { error: upErr } = await db
          .from("marketing_ai_analysis")
          .upsert({ periodo, contenido, modelo: "gemini-3.5-flash", generated_at }, { onConflict: "periodo" })

        if (upErr) throw new Error(`upsert ${periodo}: ${upErr.message}`)
        return periodo
      })
    )

    const ok: string[] = []
    const fallaron: string[] = []
    resultados.forEach((r, i) => {
      if (r.status === "fulfilled") ok.push(PERIODOS[i])
      else {
        fallaron.push(PERIODOS[i])
        console.error(`Cron Marketing Metrics - falló ${PERIODOS[i]}:`, r.reason)
      }
    })

    return NextResponse.json({
      ok: fallaron.length === 0,
      generados: ok,
      fallaron,
      generated_at,
      modelo: "gemini-3.5-flash",
    })
  } catch (e) {
    console.error("Cron Marketing Metrics error:", e)
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
