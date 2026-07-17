import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { getAdminDb } from "@/lib/admin-vakdor/logger"
import { guardarDesarrollo } from "@/lib/admin-vakdor/marketing/store"
import { generarTexto } from "@/lib/admin-vakdor/marketing/claude"
import { BRAND_SYSTEM } from "@/lib/admin-vakdor/marketing/brand-prompt"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const db = getAdminDb()
  const { data: idea, error } = await db
    .from("marketing_ideas")
    .select("titulo, fuente, formato, angulo, gancho, estructura, brief")
    .eq("id", params.id).single()
  if (error || !idea) return NextResponse.json({ error: "idea no encontrada" }, { status: 404 })

  const user = `Pieza a desarrollar — fuente: ${idea.fuente}, formato: ${idea.formato}. Título: ${idea.titulo}. Ángulo: ${idea.angulo ?? ""}. Gancho: ${idea.gancho ?? ""}. Estructura: ${idea.estructura ?? ""}. Brief: ${JSON.stringify(idea.brief ?? {})}.

Desarrollá el CONTENIDO COMPLETO siguiendo la skill vakdor-copywriter al pie (Eje Clave que aterriza en el Resultado, 2ª persona, párrafos cortos, sin emojis, viñetas con •, sin links en el cuerpo).

Si fuente = "linkedin": devolvé SOLO este JSON:
{"contenido":"<el post/carrusel completo listo para publicar, con saltos de línea>","primer_comentario":"<comentario de engagement: pregunta o estadística cruda, NUNCA 'comentá X'; el link a vakdor.com va acá si corresponde>","hashtags":["#...", 3 a 5 hashtags]}

Si fuente = "blog": devolvé SOLO este JSON:
{"contenido":"<el artículo en Markdown: ## para H2, ### para H3, listas, intro que responde en las primeras 100 palabras, un H2 de respuesta directa (TL;DR), 3-6 H2, una sección FAQ con H3=pregunta, y conclusión con CTA a /call>","blog":{"title":"<=60 caracteres, keyword al inicio","slug":"kebab-case","meta_description":"<=155 caracteres, dolor + solución + CTA","seo_keywords":["principal","2-4 secundarias"],"read_time_minutes": <número = palabras/200 redondeado>}}

Devolvé SOLO el JSON, sin texto extra ni fences de markdown.`

  let raw: string
  try {
    raw = await generarTexto(BRAND_SYSTEM, user, 4000)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }

  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return NextResponse.json({ error: "la IA no devolvió un JSON válido" }, { status: 502 })

  let parsed: { contenido?: unknown; primer_comentario?: unknown; hashtags?: unknown; blog?: unknown }
  try {
    parsed = JSON.parse(match[0])
  } catch {
    return NextResponse.json({ error: "la IA no devolvió un JSON válido" }, { status: 502 })
  }

  const contenido = typeof parsed.contenido === "string" ? parsed.contenido.trim() : ""
  if (!contenido) return NextResponse.json({ error: "la IA no devolvió contenido" }, { status: 502 })

  const primer_comentario = typeof parsed.primer_comentario === "string" ? parsed.primer_comentario : undefined
  const hashtags = Array.isArray(parsed.hashtags) ? (parsed.hashtags as string[]) : undefined
  const blog = parsed.blog && typeof parsed.blog === "object" ? (parsed.blog as Record<string, unknown>) : undefined

  try {
    if (idea.fuente === "blog") {
      await guardarDesarrollo(params.id, {
        contenido, blog,
        evento: { fecha: new Date().toISOString(), tipo: "desarrollada", detalle: "IA" },
      })
    } else {
      await guardarDesarrollo(params.id, {
        contenido, primer_comentario, hashtags,
        evento: { fecha: new Date().toISOString(), tipo: "desarrollada", detalle: "IA" },
      })
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, contenido, primer_comentario, hashtags, blog })
}
