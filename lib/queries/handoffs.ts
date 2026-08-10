import { createClient } from "@/lib/supabase/server"

/**
 * Handoffs sin atender.
 *
 * Un "handoff" es cuando el bot de WhatsApp deriva la conversación a un asesor humano:
 * el flujo Gestion_Handoff (n8n) apaga el bot y deja un mensaje interno de marca en
 * wa_messages. Ese mensaje es el ÚNICO marcador confiable del handoff:
 * `bot_active = false` NO sirve, porque la enorme mayoría de las conversaciones con el
 * bot apagado se apagaron a mano desde la app, no por una derivación.
 *
 * Se considera "atendido" cuando, después del handoff, alguien de la inmobiliaria
 * escribió en la conversación (role 'human', o 'internal' que no sea la marca del
 * propio handoff — los asesores a veces quedan registrados así).
 *
 * El alcance lo resuelve RLS: el director ve toda la inmobiliaria y el asesor solo
 * sus conversaciones (wa_conversations.agent_id = auth.uid()).
 */

/** Texto con el que Gestion_Handoff marca la derivación en wa_messages. */
const HANDOFF_MARKER = "Handoff activado"

/** Techo de mensajes de handoff a traer. Hoy hay ~60 en total; da mucho margen. */
const MAX_HANDOFFS = 500

export type HandoffSeverity = "reciente" | "demorado" | "critico"

export interface UnattendedHandoff {
  conversationId: string
  contactName: string | null
  contactPhone: string
  agentId: string | null
  agentName: string | null
  handoffAt: string
  hoursWaiting: number
  /** Mensajes que mandó el cliente DESPUÉS del handoff y nadie respondió. */
  clientMessagesAfter: number
  lastClientMessageAt: string | null
  severity: HandoffSeverity
}

export interface HandoffsDashboardData {
  unattended: UnattendedHandoff[]
  totalHandoffs: number
  attended: number
  criticos: number
  /** Cuántos clientes siguieron escribiendo sin recibir respuesta. */
  esperandoConMensajes: number
  /** Mediana de horas que tardó el asesor en responder, sobre los atendidos. */
  medianResponseHours: number | null
}

const EMPTY: HandoffsDashboardData = {
  unattended: [],
  totalHandoffs: 0,
  attended: 0,
  criticos: 0,
  esperandoConMensajes: 0,
  medianResponseHours: null,
}

function severityFor(hours: number): HandoffSeverity {
  if (hours >= 24) return "critico"
  if (hours >= 2) return "demorado"
  return "reciente"
}

function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export async function getHandoffsDashboardData(
  agencyId: string,
  agentId?: string,
  startDate?: string,
  endDate?: string
): Promise<HandoffsDashboardData> {
  const supabase = createClient()

  // 1. Marcas de handoff. Descendente: la primera que veamos de cada conversación
  //    es la más reciente, que es la que importa si se derivó más de una vez.
  let handoffQuery = supabase
    .from("wa_messages")
    .select("conversation_id, created_at")
    .eq("agency_id", agencyId)
    .eq("role", "internal")
    .ilike("content", `%${HANDOFF_MARKER}%`)
    .order("created_at", { ascending: false })
    .limit(MAX_HANDOFFS)

  if (startDate) handoffQuery = handoffQuery.gte("created_at", startDate)
  // El filtro de fecha manda 'yyyy-MM-dd'. Sin extenderlo a fin de día se perderían
  // los handoffs de hoy, que son justamente los que hay que atender.
  if (endDate) handoffQuery = handoffQuery.lte("created_at", `${endDate}T23:59:59.999Z`)

  const { data: handoffMsgs, error: handoffError } = await handoffQuery
  if (handoffError || !handoffMsgs?.length) return EMPTY

  const handoffAtByConv = new Map<string, string>()
  for (const msg of handoffMsgs) {
    if (!handoffAtByConv.has(msg.conversation_id)) {
      handoffAtByConv.set(msg.conversation_id, msg.created_at)
    }
  }

  // 2. Conversaciones derivadas. RLS ya recorta lo que puede ver cada rol;
  //    agentId es el filtro de asesor del dashboard del director.
  let convQuery = supabase
    .from("wa_conversations")
    .select("id, contact_name, contact_phone, agent_id, assigned_agent:profiles!wa_conversations_agent_id_fkey(full_name)")
    .eq("agency_id", agencyId)
    .in("id", Array.from(handoffAtByConv.keys()))

  if (agentId) convQuery = convQuery.eq("agent_id", agentId)

  const { data: conversations, error: convError } = await convQuery
  if (convError || !conversations?.length) return EMPTY

  const visibleIds = conversations.map(c => c.id)
  const earliestHandoff = visibleIds
    .map(id => handoffAtByConv.get(id)!)
    .reduce((min, at) => (at < min ? at : min))

  // 3. Todo lo que pasó después del handoff más viejo, en un solo viaje.
  const { data: laterMsgs } = await supabase
    .from("wa_messages")
    .select("conversation_id, role, content, created_at")
    .eq("agency_id", agencyId)
    .in("conversation_id", visibleIds)
    .gte("created_at", earliestHandoff)
    .order("created_at", { ascending: true })

  const now = Date.now()
  const unattended: UnattendedHandoff[] = []
  const responseHours: number[] = []

  for (const conv of conversations) {
    const handoffAt = handoffAtByConv.get(conv.id)!
    const after = (laterMsgs || []).filter(
      m => m.conversation_id === conv.id && m.created_at > handoffAt
    )

    // Respuesta de la inmobiliaria: el asesor escribiendo. Algunos mensajes de asesor
    // quedan guardados como 'internal', así que también cuentan — salvo la propia
    // marca de handoff, que puede repetirse si la conversación se derivó de nuevo.
    const agencyReply = after.find(
      m => m.role === "human" || (m.role === "internal" && !m.content?.includes(HANDOFF_MARKER))
    )

    if (agencyReply) {
      responseHours.push(
        (new Date(agencyReply.created_at).getTime() - new Date(handoffAt).getTime()) / 3_600_000
      )
      continue
    }

    const clientMsgs = after.filter(m => m.role === "lead")
    const hoursWaiting = (now - new Date(handoffAt).getTime()) / 3_600_000
    const agent = Array.isArray(conv.assigned_agent) ? conv.assigned_agent[0] : conv.assigned_agent

    unattended.push({
      conversationId: conv.id,
      contactName: conv.contact_name,
      contactPhone: conv.contact_phone,
      agentId: conv.agent_id,
      agentName: agent?.full_name ?? null,
      handoffAt,
      hoursWaiting,
      clientMessagesAfter: clientMsgs.length,
      lastClientMessageAt: clientMsgs.length ? clientMsgs[clientMsgs.length - 1].created_at : null,
      severity: severityFor(hoursWaiting),
    })
  }

  // Los que más esperaron, primero.
  unattended.sort((a, b) => b.hoursWaiting - a.hoursWaiting)

  return {
    unattended,
    totalHandoffs: conversations.length,
    attended: conversations.length - unattended.length,
    criticos: unattended.filter(h => h.severity === "critico").length,
    esperandoConMensajes: unattended.filter(h => h.clientMessagesAfter > 0).length,
    medianResponseHours: median(responseHours),
  }
}
