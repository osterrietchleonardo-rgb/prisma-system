import { getAdminDb } from "@/lib/admin-vakdor/logger"
import { phoneKey } from "./phone"
import type { WeekWindow } from "./types"

export interface Agencia {
  id: string
  name: string
  ownerEmail: string | null
  ownerName: string | null
}

export interface ResendEmail {
  id: string
  to: string
  subject: string
  createdAt: string
  clicked: boolean
  /** Teléfono del lead, sacado del HTML del email. null si no se pudo leer. */
  phoneKey: string | null
}

/** Inmobiliarias activas con su director fundador (agencies.owner_id). */
export async function fetchAgencias(): Promise<Agencia[]> {
  const db = getAdminDb()
  const { data: agencias, error } = await db
    .from("agencies")
    .select("id, name, owner_id")
    .eq("estado", "activo")
  if (error) throw new Error(`fetchAgencias: ${error.message}`)

  const ownerIds = (agencias ?? []).map((a) => a.owner_id).filter(Boolean) as string[]
  const { data: owners } = ownerIds.length
    ? await db.from("profiles").select("id, email, full_name").in("id", ownerIds)
    : { data: [] as { id: string; email: string | null; full_name: string | null }[] }

  const porId = new Map((owners ?? []).map((o) => [o.id, o]))
  return (agencias ?? []).map((a) => {
    const owner = a.owner_id ? porId.get(a.owner_id) : undefined
    return {
      id: a.id,
      name: a.name ?? "Inmobiliaria",
      ownerEmail: owner?.email ?? null,
      ownerName: owner?.full_name ?? null,
    }
  })
}

/**
 * Consultas ingresadas: conversaciones creadas en la semana CON al menos un mensaje
 * del cliente. Sin ese filtro, una campaña masiva infla el número (1.397 vs 232 reales
 * la semana del 20-jul).
 *
 * Se resuelve en dos pasos porque supabase-js no expone EXISTS: se traen los ids de las
 * conversaciones nuevas y después los ids que tienen algún mensaje 'lead'.
 */
export async function fetchConsultas(agencyId: string, w: WeekWindow): Promise<number> {
  const db = getAdminDb()
  const ids: string[] = []
  // PostgREST corta en 1.000 filas por default: una semana de campaña masiva ya superó
  // eso (1.397 conversaciones el 20-jul), así que hay que paginar igual que en
  // fetchConversaciones/fetchMensajesDesde.
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await db
      .from("wa_conversations")
      .select("id")
      .eq("agency_id", agencyId)
      .gte("created_at", w.startUtc)
      .lte("created_at", w.endUtc)
      .range(desde, desde + 999)
    if (error) throw new Error(`fetchConsultas: ${error.message}`)
    for (const c of data ?? []) ids.push(c.id)
    if (!data || data.length < 1000) break
  }
  if (!ids.length) return 0

  const conMensaje = new Set<string>()
  // La lista puede ser grande (1.397 en la semana de la campaña): se pagina de a 500
  // para no pasarse del largo máximo de URL de PostgREST.
  for (let i = 0; i < ids.length; i += 500) {
    const idsChunk = ids.slice(i, i + 500)
    // Un solo chunk de 500 conversaciones puede devolver más de 1.000 mensajes 'lead'
    // (954 filas medido en Central para la ventana 27-jul/2-ago, al borde del techo de
    // PostgREST), así que también hay que paginar esta consulta con .range().
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await db
        .from("wa_messages")
        .select("conversation_id")
        .eq("agency_id", agencyId)
        .eq("role", "lead")
        .in("conversation_id", idsChunk)
        .range(desde, desde + 999)
      if (error) throw new Error(`fetchConsultas: ${error.message}`)
      for (const m of data ?? []) conMensaje.add(m.conversation_id)
      if (!data || data.length < 1000) break
    }
  }
  return conMensaje.size
}

/**
 * Handoffs de la semana: el mensaje interno con la marca. Si una conversación se derivó
 * más de una vez, vale la última (se ordena descendente y se queda con la primera vista).
 */
export async function fetchHandoffs(
  agencyId: string,
  w: WeekWindow,
): Promise<{ conversationId: string; at: string }[]> {
  const db = getAdminDb()
  const { data, error } = await db
    .from("wa_messages")
    .select("conversation_id, created_at")
    .eq("agency_id", agencyId)
    .eq("role", "internal")
    .ilike("content", "%Handoff activado%")
    .gte("created_at", w.startUtc)
    .lte("created_at", w.endUtc)
    .order("created_at", { ascending: false })
  if (error) throw new Error(`fetchHandoffs: ${error.message}`)

  const vistas = new Map<string, string>()
  for (const m of data ?? []) {
    if (!vistas.has(m.conversation_id)) vistas.set(m.conversation_id, m.created_at)
  }
  return [...vistas].map(([conversationId, at]) => ({ conversationId, at }))
}

export async function fetchConversaciones(
  agencyId: string,
): Promise<{ id: string; phone: string | null; agentId: string | null }[]> {
  const db = getAdminDb()
  const filas: { id: string; phone: string | null; agentId: string | null }[] = []
  // Central tiene ~1.700 conversaciones: PostgREST corta en 1.000 por defecto, así que
  // se pagina explícitamente.
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await db
      .from("wa_conversations")
      .select("id, contact_phone, agent_id")
      .eq("agency_id", agencyId)
      .range(desde, desde + 999)
    if (error) throw new Error(`fetchConversaciones: ${error.message}`)
    for (const c of data ?? []) filas.push({ id: c.id, phone: c.contact_phone, agentId: c.agent_id })
    if (!data || data.length < 1000) break
  }
  return filas
}

/** Nombres de asesores buscables por id Y por email (el email es la clave en Resend). */
export async function fetchAsesores(agencyId: string): Promise<Map<string, string>> {
  const db = getAdminDb()
  const { data, error } = await db
    .from("profiles")
    .select("id, email, full_name")
    .eq("agency_id", agencyId)
  if (error) throw new Error(`fetchAsesores: ${error.message}`)

  const mapa = new Map<string, string>()
  for (const p of data ?? []) {
    const nombre = p.full_name ?? p.email ?? "(sin nombre)"
    mapa.set(p.id, nombre)
    if (p.email) mapa.set(p.email.toLowerCase(), nombre)
  }
  return mapa
}

export async function fetchMensajesDesde(
  agencyId: string,
  conversationIds: string[],
  sinceUtc: string,
): Promise<{ conversationId: string; role: string; content: string | null; at: string }[]> {
  if (!conversationIds.length) return []
  const db = getAdminDb()
  const filas: { conversationId: string; role: string; content: string | null; at: string }[] = []
  for (let i = 0; i < conversationIds.length; i += 200) {
    const idsChunk = conversationIds.slice(i, i + 200)
    // PostgREST corta en 1.000 filas por default: una sola tanda de 200 conversaciones puede
    // mover más mensajes que eso en una semana (pasó con Central, con handoffs + derivaciones
    // por email juntos), así que hay que paginar con .range() como en fetchConversaciones, o
    // se pierden mensajes en silencio y "atendido" da mal.
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await db
        .from("wa_messages")
        .select("conversation_id, role, content, created_at")
        .eq("agency_id", agencyId)
        .in("conversation_id", idsChunk)
        .gte("created_at", sinceUtc)
        .order("created_at", { ascending: true })
        .range(desde, desde + 999)
      if (error) throw new Error(`fetchMensajesDesde: ${error.message}`)
      for (const m of data ?? []) {
        filas.push({ conversationId: m.conversation_id, role: m.role, content: m.content, at: m.created_at })
      }
      if (!data || data.length < 1000) break
    }
  }
  return filas
}

/** Visitas cargadas desde el inicio de la ventana, para la señal "quedó la visita". */
export async function fetchVisitasDesde(
  agencyId: string,
  sinceUtc: string,
): Promise<{ phoneKey: string | null; at: string }[]> {
  const db = getAdminDb()
  const { data, error } = await db
    .from("scheduled_visits")
    .select("telefono, created_at")
    .eq("agency_id", agencyId)
    .gte("created_at", sinceUtc)
  if (error) throw new Error(`fetchVisitasDesde: ${error.message}`)
  return (data ?? []).map((v) => ({ phoneKey: phoneKey(v.telefono), at: v.created_at }))
}

/**
 * Etapa de cada cliente en el pipeline de Tracking Performance.
 *
 * Misma regla que lib/tracking/pipeline.ts: manda el evento más reciente por created_at
 * entre las actividades vivas y los movimientos manuales del tablero. Las tablas son
 * chicas (28 actividades, 4 movimientos), así que se traen enteras y se cruza en JS.
 */
export async function fetchEtapasPipeline(agencyId: string): Promise<Map<string, string>> {
  const db = getAdminDb()

  const { data: logs, error: errLogs } = await db
    .from("performance_logs")
    .select("type, created_at, wa_contact_id, lead_id, status")
    .eq("agency_id", agencyId)
    .neq("status", "eliminada")
  if (errLogs) throw new Error(`fetchEtapasPipeline logs: ${errLogs.message}`)

  const waIds = [...new Set((logs ?? []).map((l) => l.wa_contact_id).filter(Boolean))] as string[]
  const leadIds = [...new Set((logs ?? []).map((l) => l.lead_id).filter(Boolean))] as string[]

  const { data: contactos } = waIds.length
    ? await db.from("wa_contacts").select("id, phone").in("id", waIds)
    : { data: [] as { id: string; phone: string | null }[] }
  const { data: leads } = leadIds.length
    ? await db.from("leads").select("id, phone").in("id", leadIds)
    : { data: [] as { id: string; phone: string | null }[] }

  const telWa = new Map((contactos ?? []).map((c) => [c.id, c.phone]))
  const telLead = new Map((leads ?? []).map((l) => [l.id, l.phone]))

  // Se queda con el evento más nuevo por cliente.
  const ultimo = new Map<string, { at: string; stage: string }>()
  const anotar = (key: string | null, at: string, stage: string) => {
    if (!key || !stage) return
    const previo = ultimo.get(key)
    if (!previo || at > previo.at) ultimo.set(key, { at, stage })
  }

  for (const l of logs ?? []) {
    const tel = l.wa_contact_id ? telWa.get(l.wa_contact_id) : l.lead_id ? telLead.get(l.lead_id) : null
    anotar(phoneKey(tel), l.created_at, l.type)
  }

  const { data: moves, error: errMoves } = await db
    .from("tracking_pipeline_moves")
    .select("client_key, to_stage, created_at")
    .eq("agency_id", agencyId)
  if (errMoves) throw new Error(`fetchEtapasPipeline moves: ${errMoves.message}`)
  for (const m of moves ?? []) anotar(phoneKey(m.client_key), m.created_at, m.to_stage)

  return new Map([...ultimo].map(([key, v]) => [key, v.stage]))
}

/**
 * Emails mandados en la ventana. Es la ÚNICA evidencia de las derivaciones por visita y
 * por link: Avisar_Asesor manda el email y no escribe nada en wa_messages.
 *
 * Devuelve null si Resend falla, para que el informe salga igual con esas secciones
 * marcadas como no disponibles.
 */
export async function fetchResendEmails(w: WeekWindow): Promise<ResendEmail[] | null> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null
  const auth = { Authorization: `Bearer ${apiKey}` }

  try {
    const crudos: { id: string; to: string[]; subject: string; created_at: string; last_event: string }[] = []
    let after: string | null = null

    // Techo de 10 páginas (1.000 emails): en 5 meses se mandaron 482, así que sobra.
    for (let pagina = 0; pagina < 10; pagina++) {
      const url = new URL("https://api.resend.com/emails")
      url.searchParams.set("limit", "100")
      if (after) url.searchParams.set("after", after)

      const res = await fetch(url, { headers: auth })
      if (!res.ok) return null
      const json = await res.json()
      const lote = json.data ?? []
      if (!lote.length) break

      crudos.push(...lote)
      after = lote[lote.length - 1].id
      // La lista viene de más nuevo a más viejo: si ya pasamos el inicio de la ventana,
      // no hace falta seguir paginando.
      const masViejo = lote[lote.length - 1].created_at
      if (aIso(masViejo) < w.startUtc) break
      if (!json.has_more) break
    }

    const enVentana = crudos.filter((e) => {
      const at = aIso(e.created_at)
      return at >= w.startUtc && at <= w.endUtc && esDerivacion(e.subject)
    })

    // El teléfono del lead solo está en el detalle. De a 2 en paralelo: con 5, Resend
    // devuelve 429 (rate limit) en ~25% de las llamadas y el retry de telefonoDelEmail
    // (sin backoff) cae dentro de la misma ventana saturada y no lo resuelve, dejando
    // phoneKey en null de forma no determinística. Medido contra la API real: con 2,
    // 0 errores. Ver docs/interno/TECNICO-PRISMA.md §9.10.
    const salida: ResendEmail[] = []
    for (let i = 0; i < enVentana.length; i += 2) {
      const lote = await Promise.all(
        enVentana.slice(i, i + 2).map(async (e) => ({
          id: e.id,
          to: (e.to?.[0] ?? "").toLowerCase(),
          subject: e.subject,
          createdAt: aIso(e.created_at),
          clicked: e.last_event === "clicked",
          phoneKey: await telefonoDelEmail(e.id, auth),
        })),
      )
      salida.push(...lote)
    }
    return salida
  } catch {
    return null
  }
}

/**
 * Resend devuelve "2026-08-02 13:52:20.042000+00", que no es ISO válido para comparar:
 * al espacio en vez de "T" se suma un offset de zona horaria sin minutos ("+00" en vez de
 * "+00:00"), que V8 no parsea (Date pasa a Invalid Date y toISOString() explota). Se
 * normalizan las dos cosas antes de construir el Date.
 */
function aIso(fecha: string): string {
  const conT = fecha.replace(" ", "T")
  const conOffsetCompleto = conT.replace(/([+-]\d{2})$/, "$1:00")
  return new Date(conOffsetCompleto).toISOString()
}

/** Los dos asuntos que genera Avisar_Asesor. El del handoff sale de la base, no de acá. */
export function esDerivacion(subject: string): boolean {
  return /^Quiere visitar/i.test(subject) || /^Nuevo interesado en tu propiedad/i.test(subject)
}

export function esVisita(subject: string): boolean {
  return /^Quiere visitar/i.test(subject)
}

/**
 * Un reintento: con ~30-60 llamadas en lotes de 5 en paralelo, una falla transitoria de
 * Resend (rate-limit, timeout) dejaba el teléfono en null de forma no determinística entre
 * corridas, y ese número se muestra literal al director (cobertura de pipeline, señales
 * chat/visita). El modo de falla es conservador (resta, no infla), pero no debería depender
 * de la suerte de la red.
 */
async function telefonoDelEmail(id: string, auth: Record<string, string>): Promise<string | null> {
  for (let intento = 0; intento < 2; intento++) {
    try {
      const res = await fetch(`https://api.resend.com/emails/${id}`, { headers: auth })
      if (!res.ok) continue
      const json = await res.json()
      const texto = String(json.html ?? "").replace(/<[^>]+>/g, " ")
      return phoneKey(texto.match(/\b\d{10,14}\b/)?.[0] ?? null)
    } catch {
      // sigue al reintento
    }
  }
  return null
}
