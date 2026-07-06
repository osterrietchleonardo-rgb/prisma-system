import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { getAdminDb } from "@/lib/admin-vakdor/logger"

/**
 * GET /api/admin-vakdor/dashboard/user-activity?page=X&limit=Y&agency_id=Z
 *
 * Retorna log de actividad de usuarios paginado, con filtros opcionales.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const db = getAdminDb()
  const searchParams = request.nextUrl.searchParams
  const page = parseInt(searchParams.get("page") || "1", 10)
  const limit = parseInt(searchParams.get("limit") || "10", 10)
  const agencyId = searchParams.get("agency_id")

  const offset = (page - 1) * limit

  // 1. Query base de transacciones de consumo de IA
  let query = db
    .from("ai_credit_transactions")
    .select("id, agency_id, user_id, feature, credits_consumed, created_at", { count: "exact" })

  if (agencyId) {
    query = query.eq("agency_id", agencyId)
  }

  const { data: txs, count, error } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!txs || txs.length === 0) {
    return NextResponse.json({ activities: [], total: count ?? 0 })
  }

  // 2. Traer nombres de agencias y perfiles involucrados para el mapeo
  const agencyIds = Array.from(new Set(txs.map(t => t.agency_id)))
  const userIds = Array.from(new Set(txs.map(t => t.user_id)))

  const [agenciesRes, profilesRes] = await Promise.all([
    db.from("agencies").select("id, name").in("id", agencyIds),
    db.from("profiles").select("id, full_name, role").in("id", userIds),
  ])

  const agencies = agenciesRes.data || []
  const profiles = profilesRes.data || []

  // 3. Mapear actividad con nombres legibles
  const activities = txs.map((t) => {
    const prof = profiles.find((p) => p.id === t.user_id)
    const ag = agencies.find((a) => a.id === t.agency_id)
    return {
      id: t.id,
      userName: prof?.full_name || "Usuario Desconocido",
      userRole: prof?.role || "asesor",
      agencyName: ag?.name || "Agencia Desconocida",
      feature: t.feature || "general",
      creditsConsumed: t.credits_consumed || 0,
      timestamp: t.created_at,
    }
  })

  return NextResponse.json({ activities, total: count ?? 0 })
}
