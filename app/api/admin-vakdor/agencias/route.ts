import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { getAdminDb } from "@/lib/admin-vakdor/logger"

export async function GET(request: NextRequest) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const db = getAdminDb()
  const { searchParams } = new URL(request.url)
  const q = searchParams.get("q") || ""
  const estado = searchParams.get("estado") || ""
  const page = parseInt(searchParams.get("page") || "1")
  const perPage = Math.min(parseInt(searchParams.get("perPage") || "20"), 100)
  const offset = (page - 1) * perPage

  let query = db
    .from("agencies")
    .select(`
      id, name, estado, logo_url, email, phone, address, created_at, deleted_at,
      profiles!profiles_agency_id_fkey(id, role, estado, full_name, email),
      agency_ai_credits(credits_total, credits_used)
    `, { count: "exact" })
    .order("name")
    .range(offset, offset + perPage - 1)

  if (q) {
    query = query.ilike("name", `%${q}%`)
  }

  if (estado && estado !== "todos") {
    query = query.eq("estado", estado)
  }

  const { data, count, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Enriquecer con pagos del mes actual
  const now = new Date()
  const mesActual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  
  const agencyIds = (data || []).map((a) => a.id)
  const { data: pagos } = await db
    .from("pagos_agencia")
    .select("agencia_id, monto, periodo_mes")
    .in("agencia_id", agencyIds)
    .eq("periodo_mes", mesActual)

  const pagosMesMap = new Map((pagos || []).map((p) => [p.agencia_id, p.monto]))

  // Propiedades sincronizadas
  const { data: props } = await db
    .from("properties")
    .select("agency_id")
    .in("agency_id", agencyIds)

  const propsMap = (props || []).reduce((acc, p) => {
    if (p.agency_id) acc[p.agency_id] = (acc[p.agency_id] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const enriched = (data || []).map((agency) => {
    const profiles = (agency.profiles as Array<{ role: string; estado: string; full_name: string }>) || []
    
    // Soportar tanto si Supabase retorna un array como un objeto directo por la relación 1-1
    const rawCredits = agency.agency_ai_credits as any
    const credits = Array.isArray(rawCredits) ? rawCredits[0] : (rawCredits || null)

    return {
      id: agency.id,
      name: agency.name,
      estado: agency.estado || "activo",
      logo_url: agency.logo_url,
      email: agency.email,
      directores: profiles.filter((p) => p.role === "director"),
      asesores: profiles.filter((p) => p.role === "asesor"),
      creditos: credits ? { total: credits.credits_total, usado: credits.credits_used, disponible: credits.credits_total - credits.credits_used } : null,
      propiedades_tokko: propsMap[agency.id] || 0,
      pago_mes_actual: pagosMesMap.get(agency.id) || null,
      created_at: agency.created_at,
    }
  })

  return NextResponse.json({ data: enriched, total: count || 0, page, perPage })
}
