import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { getAdminDb } from "@/lib/admin-vakdor/logger"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const db = getAdminDb()

  const { data: conv, error } = await db
    .from("wa_conversations")
    .select(
      "id, agency_id, agent_id, contact_name, contact_phone, status, bot_active, pipeline_stage, etiquetas, score, last_message_at, created_at"
    )
    .eq("id", params.id)
    .single()

  if (error || !conv) {
    return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 })
  }

  // Agencia
  const { data: agency } = await db
    .from("agencies")
    .select("id, name")
    .eq("id", conv.agency_id)
    .single()

  // Agente asignado
  let agent: { full_name: string | null; email: string | null } | null = null
  if (conv.agent_id) {
    const { data } = await db
      .from("profiles")
      .select("full_name, email")
      .eq("id", conv.agent_id)
      .single()
    agent = data || null
  }

  // Mensajes (solo lectura, orden cronológico)
  const { data: messages } = await db
    .from("wa_messages")
    .select("id, content, role, message_type, metadata, created_at")
    .eq("conversation_id", conv.id)
    .order("created_at", { ascending: true })
    .limit(1000)

  return NextResponse.json(
    {
      conversation: {
        ...conv,
        agency_name: agency?.name || "—",
        agent_name: agent?.full_name || agent?.email || null,
      },
      messages: messages || [],
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  )
}
