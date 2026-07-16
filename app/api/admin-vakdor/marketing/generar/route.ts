import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { resumenParaMemoria, insertarIdeasMotor } from "@/lib/admin-vakdor/marketing/store"
import { generarTexto } from "@/lib/admin-vakdor/marketing/claude"
import { BRAND_SYSTEM } from "@/lib/admin-vakdor/marketing/brand-prompt"
import type { NuevaIdeaInput, FuenteIdea, FormatoIdea } from "@/lib/admin-vakdor/marketing/types"

export const dynamic = "force-dynamic"

const FUENTES: FuenteIdea[] = ["linkedin", "instagram", "blog"]
const FORMATOS: FormatoIdea[] = ["post_texto","carrusel","imagen","encuesta","articulo_linkedin","reel","lead_magnet","articulo_blog"]

export async function POST(request: NextRequest) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const previas = await resumenParaMemoria()
  const evitar = previas.map((p) => `- ${p.titulo}${p.angulo ? ` (${p.angulo})` : ""}`).join("\n") || "(ninguna todavía)"

  const user = [
    `Generá 5 ideas de contenido para Vakdor (mezcla LinkedIn y blog).`,
    `NO repitas estos ángulos/títulos ya usados:\n${evitar}`,
    `Devolvé SOLO un array JSON válido, sin texto extra, con objetos:`,
    `{"titulo": string, "fuente": "linkedin"|"blog", "formato": "post_texto"|"carrusel"|"articulo_blog", "angulo": string, "gancho": string, "motivo": string}`,
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
    ideas.push({
      titulo, fuente, formato,
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
