import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { getAdminDb } from "@/lib/admin-vakdor/logger"

export const dynamic = "force-dynamic"

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 })

  const { titulo, fuente, formato, funnel, angulo, regenerar } = body

  const updatePatch: Record<string, any> = {}
  if (typeof titulo === "string" && titulo.trim()) updatePatch.titulo = titulo.trim()
  if (typeof fuente === "string" && fuente.trim()) updatePatch.fuente = fuente.trim()
  if (typeof formato === "string" && formato.trim()) updatePatch.formato = formato.trim()
  if (typeof funnel === "string" && funnel.trim()) updatePatch.funnel = funnel.trim()
  if (typeof angulo === "string") updatePatch.angulo = angulo.trim()

  if (regenerar === true) {
    updatePatch.estado = "en_proceso"
    updatePatch.assets = []
    updatePatch.contenido = null
    updatePatch.comentario = `Configuración actualizada a canal: ${fuente ?? "actual"}, formato: ${formato ?? "actual"}`
  }

  const db = getAdminDb()

  // Verificar que la idea esté en la etapa 'idea' para permitir cambio de configuración
  const { data: actual, error: fetchError } = await db
    .from("marketing_ideas")
    .select("estado")
    .eq("id", params.id)
    .single()

  if (fetchError || !actual) {
    return NextResponse.json({ error: "Idea no encontrada" }, { status: 404 })
  }

  if (actual.estado !== "idea") {
    return NextResponse.json(
      { error: "La configuración solo se puede modificar cuando la idea está en la etapa 'Idea'." },
      { status: 400 }
    )
  }

  const { data: idea, error } = await db

    .from("marketing_ideas")
    .update(updatePatch)
    .eq("id", params.id)
    .select("*")
    .single()

  if (error || !idea) {
    return NextResponse.json({ error: error?.message || "error al actualizar idea" }, { status: 500 })
  }

  return NextResponse.json({ idea, regenerando: regenerar === true })
}
