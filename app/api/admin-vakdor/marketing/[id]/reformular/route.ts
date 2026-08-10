import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { getAdminDb } from "@/lib/admin-vakdor/logger"
import { actualizarContenido, regenerarVisuales } from "@/lib/admin-vakdor/marketing/store"
import { generarTexto } from "@/lib/admin-vakdor/marketing/claude"
import { BRAND_SYSTEM } from "@/lib/admin-vakdor/marketing/brand-prompt"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const body = await request.json().catch(() => null)
  const comentario = (body?.comentario as string | undefined)?.trim()
  const regenerar = body?.regenerar_visuales === true
  if (!comentario) return NextResponse.json({ error: "falta comentario" }, { status: 400 })

  const db = getAdminDb()
  const { data: idea, error } = await db
    .from("marketing_ideas")
    .select("titulo, fuente, formato, contenido")
    .eq("id", params.id).single()
  if (error || !idea) return NextResponse.json({ error: "idea no encontrada" }, { status: 404 })

  // Permitir regeneración de visuales / portada para todos los formatos (carrusel, blog, post imagen, etc.)
  const puedeRegenerar = true
  const haráRegenerar = regenerar && puedeRegenerar

  // Regenerar TODO: limpiamos assets y borrador y mandamos la tarjeta a "en_proceso" con el comentario para el worker
  if (haráRegenerar) {
    try {
      await regenerarVisuales(params.id, comentario)
      return NextResponse.json({ regenerando: true })
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 })
    }
  }

  // Reformular solo el texto.
  const user = [
    `Pieza: ${idea.fuente} · ${idea.formato}. Título: ${idea.titulo}.`,
    `Instrucción del director para reformular: ${comentario}`,
    idea.contenido ? `Borrador actual:\n${idea.contenido}` : `Todavía no hay borrador; escribí uno.`,
    `Devolvé SOLO el nuevo texto, listo para publicar. Sin explicaciones.`,
  ].filter(Boolean).join("\n\n")

  try {
    const contenido = await generarTexto(BRAND_SYSTEM, user)
    await actualizarContenido(params.id, {
      contenido, comentario,
      evento: { fecha: new Date().toISOString(), tipo: "reformulada", detalle: comentario.slice(0, 120) },
    })
    return NextResponse.json({ contenido, regenerando: false })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
