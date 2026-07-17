import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { getAdminDb } from "@/lib/admin-vakdor/logger"
import { firmarAsset } from "@/lib/admin-vakdor/marketing/store"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const path = new URL(request.url).searchParams.get("path")
  if (!path) return NextResponse.json({ error: "falta path" }, { status: 400 })

  // Rechazar segmentos de traversal ("." / "..") antes de cualquier otra validación.
  if (path.split("/").some((s) => s === "." || s === "..")) {
    return NextResponse.json({ error: "path inválido" }, { status: 400 })
  }
  // Verificar que el asset pertenece a esta idea (el path arranca con ideas/<id>/).
  if (!path.startsWith(`ideas/${params.id}/`)) {
    return NextResponse.json({ error: "path no pertenece a la idea" }, { status: 403 })
  }
  // Confirmar que la idea existe.
  const db = getAdminDb()
  const { data, error } = await db.from("marketing_ideas").select("id").eq("id", params.id).single()
  if (error || !data) return NextResponse.json({ error: "idea no encontrada" }, { status: 404 })

  const url = await firmarAsset(path)
  if (!url) return NextResponse.json({ error: "no se pudo firmar" }, { status: 500 })
  return NextResponse.json({ url })
}
