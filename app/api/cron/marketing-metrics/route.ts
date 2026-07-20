import { NextResponse } from "next/server"
import { assertCron } from "@/lib/admin-vakdor/cron-auth"
import { getAdminDb } from "@/lib/admin-vakdor/logger"
import { prismaIA } from "@/lib/gemini"
import { loadMarketingMetricsPayload } from "@/lib/admin-vakdor/marketing/metricas"

export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function GET(req: Request) {
  const denied = assertCron(req)
  if (denied) return denied

  try {
    const periodo = "30d"
    const payload = await loadMarketingMetricsPayload(periodo)

    const prompt = `Sos el CMO y Growth Hacker Senior de Vakdor, una empresa SaaS argentina para inmobiliarias que ofrece la plataforma PRISMA.
Analizá los siguientes datos reales de tráfico de la web vakdor.com (Google Analytics 4 + Conversion API), búsquedas orgánicas (Google Search Console), rendimiento orgánico en LinkedIn (Buffer) y distribución de contenidos por ángulo/formato.

DATOS DE MARKETING Y EMBUDO (Período: ${periodo}):
${JSON.stringify(payload, null, 2)}

Tu objetivo es devolver un análisis riguroso, corporativo y directo en español rioplatense profesional (sin relleno ni frases vacías).

Respondé ÚNICAMENTE con un JSON válido que tenga esta estructura exacta:
{
  "analisis_actual": "2 a 4 oraciones analizando la salud general del embudo de 6 pasos (Home -> Demo -> Video 100% -> /call -> Formulario -> Reunión), identificando dónde está el mayor cuello de botella o fuga de prospectos.",
  "analisis_mejora": [
    "3 a 5 sugerencias o mejoras concretas con alto impacto (optimizaciones de copy, CTA, experiencia del video de demo o formulario)."
  ],
  "proximo_paso": [
    "3 a 4 acciones prioritarias inmediatas en orden de ejecución."
  ],
  "ranking_analisis": "Análisis explícito sobre el ranking de posts de Buffer/LinkedIn: por qué funcionaron los posts con más impresiones/engagement, qué formatos (carrusel/texto/lead magnet), qué ángulos (dolor operativo/mecanismo) y qué ganchos fueron los más efectivos para replicar."
}
No agregues ningún texto fuera del JSON.`

    const aiResult = await prismaIA.generateContent(prompt)
    const text = aiResult.response.text()
    const jsonString = text.replace(/```json|```/g, "").trim()
    const contenido = JSON.parse(jsonString)

    const generated_at = new Date().toISOString()
    const db = getAdminDb()
    const { error: upErr } = await db
      .from("marketing_ai_analysis")
      .upsert({ periodo, contenido, modelo: "gemini-3.5-flash", generated_at }, { onConflict: "periodo" })

    if (upErr) {
      console.error("Cron Marketing Metrics - Error en upsert:", upErr.message)
    }

    return NextResponse.json({ ok: true, periodo, generated_at, modelo: "gemini-3.5-flash" })
  } catch (e) {
    console.error("Cron Marketing Metrics error:", e)
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
