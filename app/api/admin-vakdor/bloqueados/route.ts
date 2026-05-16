import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { getAdminDb } from "@/lib/admin-vakdor/logger"

export async function GET(request: NextRequest) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const db = getAdminDb()
  const { searchParams } = new URL(request.url)
  const agenciaId = searchParams.get("agencia_id") || ""
  const tipo = searchParams.get("tipo") || ""
  const desde = searchParams.get("desde") || ""

  let query = db
    .from("emails_bloqueados")
    .select("*")
    .is("desbloqueado_at", null)
    .order("bloqueado_at", { ascending: false })

  if (tipo) query = query.eq("tipo_entidad", tipo)
  if (desde) query = query.gte("bloqueado_at", desde)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: data || [] })
}
