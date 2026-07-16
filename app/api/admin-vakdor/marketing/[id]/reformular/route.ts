import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { getAdminDb } from "@/lib/admin-vakdor/logger"
import { actualizarContenido } from "@/lib/admin-vakdor/marketing/store"
import { generarTexto } from "@/lib/admin-vakdor/marketing/claude"
import { BRAND_SYSTEM } from "@/lib/admin-vakdor/marketing/brand-prompt"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const body = await request.json().catch(() => null)
  const comentario = (body?.comentario as string | undefined)?.trim()
  if (!comentario) return NextResponse.json({ error: "falta comentario" }, { status: 400 })

  const db = getAdminDb()
  const { data: idea, error } = await db
    .from("marketing_ideas")
    .select("titulo, fuente, formato, contenido")
    .eq("id", params.id).single()
  if (error || !idea) return NextResponse.json({ error: "idea no encontrada" }, { status: 404 })

  const user = [
    `Pieza: ${idea.fuente} · ${idea.formato}. Título: ${idea.titulo}.`,
    idea.contenido ? `Borrador actual:\n${idea.contenido}` : `Todavía no hay borrador; escribí uno.`,
    `Instrucción del director para reformular: ${comentario}`,
    `Devolvé SOLO el nuevo texto de la pieza, listo para publicar. Sin explicaciones.`,
  ].join("\n\n")

  try {
    const contenido = await generarTexto(BRAND_SYSTEM, user)
    await actualizarContenido(params.id, {
      contenido, comentario,
      evento: { fecha: new Date().toISOString(), tipo: "reformulada", detalle: comentario.slice(0, 120) },
    })
    return NextResponse.json({ contenido })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
