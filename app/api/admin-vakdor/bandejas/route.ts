import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { getAdminDb } from "@/lib/admin-vakdor/logger"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const db = getAdminDb()
  const { searchParams } = new URL(request.url)
  const q = searchParams.get("q")?.trim() || ""
  const agencyId = searchParams.get("agency_id") || ""
  const estado = searchParams.get("estado") || ""
  const page = parseInt(searchParams.get("page") || "1")
  const perPage = Math.min(parseInt(searchParams.get("perPage") || "25"), 100)
  const offset = (page - 1) * perPage

  // --- Conversaciones (todas las agencias, vía service role) ---
  let query = db
    .from("wa_conversations")
    .select(
      "id, agency_id, agent_id, contact_name, contact_phone, status, bot_active, unread_count, pipeline_stage, etiquetas, last_message_at, created_at",
      { count: "exact" }
    )

  if (agencyId) query = query.eq("agency_id", agencyId)
  if (estado && estado !== "todos") query = query.eq("status", estado)
  if (q) query = query.or(`contact_name.ilike.%${q}%,contact_phone.ilike.%${q}%`)

  query = query
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + perPage - 1)

  const { data: conversations, count, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // --- Listado de agencias para el filtro (liviano) ---
  const { data: agencies } = await db
    .from("agencies")
    .select("id, name")
    .order("name")

  const agencyMap = new Map((agencies || []).map((a) => [a.id, a.name]))

  // --- Perfiles de agentes asignados ---
  const agentIds = Array.from(
    new Set((conversations || []).map((c) => c.agent_id).filter(Boolean) as string[])
  )
  let agentMap = new Map<string, { full_name: string | null; email: string | null }>()
  if (agentIds.length > 0) {
    const { data: agents } = await db
      .from("profiles")
      .select("id, full_name, email")
      .in("id", agentIds)
    agentMap = new Map((agents || []).map((a) => [a.id, { full_name: a.full_name, email: a.email }]))
  }

  const data = (conversations || []).map((c) => {
    const agent = c.agent_id ? agentMap.get(c.agent_id) : null
    return {
      id: c.id,
      agency_id: c.agency_id,
      agency_name: agencyMap.get(c.agency_id) || "—",
      contact_name: c.contact_name,
      contact_phone: c.contact_phone,
      status: c.status,
      bot_active: c.bot_active,
      unread_count: c.unread_count,
      pipeline_stage: c.pipeline_stage,
      etiquetas: c.etiquetas || [],
      agent_name: agent?.full_name || agent?.email || null,
      last_message_at: c.last_message_at,
    }
  })

  return NextResponse.json(
    {
      data,
      total: count || 0,
      page,
      perPage,
      agencies: agencies || [],
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  )
}
