import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { getAdminDb } from "@/lib/admin-vakdor/logger"
import { resumenParaMemoria, insertarIdeasMotor } from "@/lib/admin-vakdor/marketing/store"
import { generarTexto } from "@/lib/admin-vakdor/marketing/claude"
import { BRAND_SYSTEM } from "@/lib/admin-vakdor/marketing/brand-prompt"
import type { NuevaIdeaInput, FuenteIdea, FormatoIdea, FunnelStage } from "@/lib/admin-vakdor/marketing/types"

export const dynamic = "force-dynamic"

const FUENTES: FuenteIdea[] = ["linkedin", "instagram", "blog"]
const FORMATOS: FormatoIdea[] = ["post_texto","carrusel","imagen","encuesta","articulo_linkedin","reel","lead_magnet","articulo_blog"]
const FUNNELS: FunnelStage[] = ["tofu", "mofu", "bofu"]

export async function POST(request: NextRequest) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const previas = await resumenParaMemoria()
  const evitar = previas.map((p) => `- ${p.titulo}${p.angulo ? ` (${p.angulo})` : ""}`).join("\n") || "(ninguna todavía)"

  // Insights reales de Buffer (los cachea el worker 1x/día). Fundamentan las ideas con datos.
  let insights = ""
  try {
    const { data } = await getAdminDb()
      .from("marketing_insights").select("resumen").order("fecha", { ascending: false }).limit(1).maybeSingle()
    insights = typeof data?.resumen === "string" ? data.resumen : ""
  } catch { /* falla suave */ }

  const user = [
    `Generá 5 ideas de contenido para Vakdor (mezcla LinkedIn y blog).`,
    insights ? `DATOS REALES DE RENDIMIENTO (Buffer) — priorizá ángulos/temas parecidos a los que MÁS rinden y evitá el patrón de los que menos; no inventes:\n${insights}` : "",
    `Balanceá el EMBUDO: asigná a cada idea una etapa "funnel": "tofu" (descubrimiento, dolor amplio, sin vender), "mofu" (nutrición, el mecanismo/método PRISMA), "bofu" (empujón a la reunión, prueba + CTA a agendar). Mezclá las 3 etapas.`,
    `NO repitas estos ángulos/títulos ya usados:\n${evitar}`,
    `Devolvé SOLO un array JSON válido, sin texto extra, con objetos:`,
    `{"titulo": string, "fuente": "linkedin"|"blog", "formato": "post_texto"|"carrusel"|"articulo_blog", "funnel": "tofu"|"mofu"|"bofu", "angulo": string, "gancho": string, "motivo": string}`,
  ].join("\n\n")

  let raw: string
  try {
    raw = await generarTexto(BRAND_SYSTEM, user)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  // Extraer el array JSON de la respuesta (tolerante a fences ```json).
  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) return NextResponse.json({ error: "respuesta IA sin JSON", raw }, { status: 502 })
  let parsed: unknown
  try { parsed = JSON.parse(match[0]) } catch { return NextResponse.json({ error: "JSON inválido", raw }, { status: 502 }) }
  if (!Array.isArray(parsed)) return NextResponse.json({ error: "no es array", raw }, { status: 502 })

  const ideas: NuevaIdeaInput[] = []
  for (const it of parsed as Record<string, unknown>[]) {
    if (!it || typeof it !== "object") continue
    const titulo = typeof it.titulo === "string" ? it.titulo.trim() : ""
    const fuente = it.fuente as FuenteIdea
    const formato = it.formato as FormatoIdea
    if (!titulo || !FUENTES.includes(fuente) || !FORMATOS.includes(formato)) continue
    const funnel = it.funnel as FunnelStage
    ideas.push({
      titulo, fuente, formato,
      funnel: FUNNELS.includes(funnel) ? funnel : null,
      angulo: typeof it.angulo === "string" ? it.angulo : null,
      gancho: typeof it.gancho === "string" ? it.gancho : null,
      motivo: typeof it.motivo === "string" ? it.motivo : null,
      origen: "motor",
    })
  }
  try {
    const creadas = await insertarIdeasMotor(ideas)
    return NextResponse.json({ creadas })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
