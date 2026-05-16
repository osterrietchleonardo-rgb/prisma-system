import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { getAdminDb } from "@/lib/admin-vakdor/logger"

export async function GET(request: NextRequest) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const db = getAdminDb()
  const { searchParams } = new URL(request.url)
  const categoria = searchParams.get("categoria") || ""
  const estado = searchParams.get("estado") || ""
  const agenciaId = searchParams.get("agencia_id") || ""
  const desde = searchParams.get("desde") || ""
  const hasta = searchParams.get("hasta") || ""
  const q = searchParams.get("q") || ""
  const page = parseInt(searchParams.get("page") || "1")
  const perPage = Math.min(parseInt(searchParams.get("perPage") || "20"), 100)
  const offset = (page - 1) * perPage

  let query = db
    .from("system_feedback")
    .select(`
      id, created_at, updated_at, type, titulo, content, estado, agency_id,
      user_id, email, role, respondida_por, respuesta,
      profiles!system_feedback_user_id_fkey(full_name, email, role),
      agencies!system_feedback_agency_id_fkey(name)
    `, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + perPage - 1)

  if (categoria) query = query.eq("type", categoria)
  if (estado) query = query.eq("estado", estado)
  if (agenciaId) query = query.eq("agency_id", agenciaId)
  if (desde) query = query.gte("created_at", desde)
  if (hasta) query = query.lte("created_at", hasta)
  if (q) query = query.or(`content.ilike.%${q}%,titulo.ilike.%${q}%`)

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data, total: count || 0, page, perPage })
}
