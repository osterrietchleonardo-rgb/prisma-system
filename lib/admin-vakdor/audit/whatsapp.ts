import { getAdminDb } from "@/lib/admin-vakdor/logger"
import { peorSemaforo, type AuditSnapshot, type Semaforo } from "./types"

const TZ = "America/Argentina/Buenos_Aires"

interface MetricasWa {
  leads_nuevos: number
  conversaciones_activas: number
  msgs_entrantes: number
  msgs_salientes: number
  contactos_nuevos: number
  sin_responder_total: number
  sin_responder_6h: number
  primera_respuesta_min_mediana: number | null
  tasa_respuesta_pct: number | null
  agente_ciego: number
  calificados: number
  propiedades_mostradas: number
  visitas_agendadas: number
  handoffs: number
  origen_campana: number
  origen_organico: number
  reactivaciones: number
  enfriados: number
}

/** Una sola consulta agregada por scope. `agencyId` null = global (todas las agencias). */
async function metricasWhatsapp(agencyId: string | null): Promise<MetricasWa> {
  const db = getAdminDb()

  // Rango "hoy" en AR calculado en JS (evita SQL crudo, que supabase-js no soporta
  // desde el server helper). Offset AR fijo -3h (sin horario de verano).
  const ahora = new Date()
  const ar = new Date(ahora.toLocaleString("en-US", { timeZone: TZ }))
  const inicioAr = new Date(ar.getFullYear(), ar.getMonth(), ar.getDate())
  const inicioUtc = new Date(inicioAr.getTime() + 3 * 3600 * 1000).toISOString()
  const hace6h = new Date(Date.now() - 6 * 3600 * 1000).toISOString()
  const hace7d = new Date(Date.now() - 7 * 86400 * 1000).toISOString()

  const withAg = (q: any): any => (agencyId ? q.eq("agency_id", agencyId) : q)

  const cnt = async (build: (q: any) => any, tabla: string): Promise<number> => {
    let q = db.from(tabla).select("*", { count: "exact", head: true })
    q = withAg(q)
    q = build(q)
    const { count, error } = await q
    if (error) throw new Error(`cnt ${tabla}: ${error.message}`)
    return count ?? 0
  }

  const [
    leads_nuevos, conversaciones_activas, msgs_entrantes, msgs_salientes, contactos_nuevos,
    agente_ciego, calificados, visitas_agendadas, handoffs, reactivaciones, enfriados,
  ] = await Promise.all([
    cnt((q) => q.gte("created_at", inicioUtc), "wa_conversations"),
    cnt((q) => q.eq("status", "active"), "wa_conversations"),
    cnt((q) => q.eq("role", "lead").gte("created_at", inicioUtc), "wa_messages"),
    cnt((q) => q.in("role", ["bot", "human"]).gte("created_at", inicioUtc), "wa_messages"),
    cnt((q) => q.gte("created_at", inicioUtc), "wa_contacts"),
    cnt((q) => q.eq("status", "pending"), "wa_n8n_dead_letter"),
    cnt((q) => q.in("metricas->>etapa", ["calificacion", "recomendacion", "visita"]), "wa_conversations"),
    cnt((q) => q.eq("metricas->>visita_agendada", "true"), "wa_conversations"),
    cnt((q) => q.eq("metricas->>fue_derivado_a_humano", "true"), "wa_conversations"),
    cnt((q) => q.not("recovery_stage", "is", null), "wa_conversations"),
    cnt((q) => q.or(`funnel_status.eq.closed_lost,last_message_at.lt.${hace7d}`), "wa_conversations"),
  ])

  // sin_responder: NO se puede comparar dos columnas con .filter(col, op, "otraCol")
  // en supabase-js — el 3er argumento es un literal, no el nombre de otra columna.
  // El dataset es chico (~28 filas), así que se trae y se calcula en JS.
  let srQ = db.from("wa_conversations").select("id, last_inbound_at, last_message_at")
  srQ = withAg(srQ)
  const { data: srRows, error: srErr } = await srQ
  if (srErr) throw new Error(`sin_responder: ${srErr.message}`)
  const hace6hMs = Date.now() - 6 * 3600 * 1000
  let sin_responder_total = 0
  let sin_responder_6h = 0
  for (const r of srRows ?? []) {
    const inbound = r.last_inbound_at as string | null
    if (!inbound) continue
    const inboundMs = new Date(inbound).getTime()
    const lastMsgMs = r.last_message_at ? new Date(r.last_message_at as string).getTime() : 0
    if (lastMsgMs <= inboundMs) {
      sin_responder_total++
      if (inboundMs < hace6hMs) sin_responder_6h++
    }
  }

  // propiedades_mostradas: `.gt("metricas->propiedades_mostradas", "[]")` no distingue
  // de forma confiable array vacío vs con elementos en supabase-js. Se trae
  // `id, metricas->propiedades_mostradas` (postgREST lo devuelve bajo la key
  // "propiedades_mostradas") y se cuenta en JS por longitud del array.
  let pmQ = db.from("wa_conversations").select("id, metricas->propiedades_mostradas")
  pmQ = withAg(pmQ)
  const { data: pmRows, error: pmErr } = await pmQ
  if (pmErr) throw new Error(`propiedades_mostradas: ${pmErr.message}`)
  const propiedades_mostradas = (pmRows ?? []).filter(
    (r: any) => Array.isArray(r.propiedades_mostradas) && r.propiedades_mostradas.length > 0,
  ).length

  // Métricas que necesitan cálculo fino (mediana, tasa, origen) → helper aparte.
  const { primera_respuesta_min_mediana, tasa_respuesta_pct } = await slaWhatsapp(agencyId, inicioUtc)
  const origen_campana = await origenCampana(agencyId)
  const origen_organico = Math.max(leads_nuevos - origen_campana, 0)

  return {
    leads_nuevos, conversaciones_activas, msgs_entrantes, msgs_salientes, contactos_nuevos,
    sin_responder_total, sin_responder_6h, primera_respuesta_min_mediana, tasa_respuesta_pct,
    agente_ciego, calificados, propiedades_mostradas, visitas_agendadas, handoffs,
    origen_campana, origen_organico, reactivaciones, enfriados,
  }
}

/** Mediana del tiempo de primera respuesta y % de conversaciones respondidas, para los mensajes de hoy. */
async function slaWhatsapp(
  agencyId: string | null,
  inicioUtc: string,
): Promise<{ primera_respuesta_min_mediana: number | null; tasa_respuesta_pct: number | null }> {
  const db = getAdminDb()
  let q = db
    .from("wa_messages")
    .select("conversation_id, role, created_at")
    .gte("created_at", inicioUtc)
    .in("role", ["lead", "bot", "human"])
    .order("created_at", { ascending: true })
  if (agencyId) q = q.eq("agency_id", agencyId)
  const { data, error } = await q
  if (error) throw new Error(`slaWhatsapp: ${error.message}`)

  const porConv = new Map<string, { lead?: number; resp?: number }>()
  for (const m of data ?? []) {
    const t = new Date(m.created_at as string).getTime()
    const c = porConv.get(m.conversation_id as string) ?? {}
    if (m.role === "lead" && c.lead === undefined) c.lead = t
    if ((m.role === "bot" || m.role === "human") && c.resp === undefined && c.lead !== undefined) c.resp = t
    porConv.set(m.conversation_id as string, c)
  }
  const conLead = [...porConv.values()].filter((c) => c.lead !== undefined)
  const tiempos = conLead
    .filter((c) => c.resp !== undefined)
    .map((c) => (c.resp! - c.lead!) / 60000)
    .sort((a, b) => a - b)
  const mediana = tiempos.length
    ? Math.round(tiempos[Math.floor(tiempos.length / 2)])
    : null
  const tasa = conLead.length
    ? Math.round((tiempos.length / conLead.length) * 100)
    : null
  return { primera_respuesta_min_mediana: mediana, tasa_respuesta_pct: tasa }
}

/** Conversaciones cuyo contacto (mismo teléfono+agencia) tuvo una campaña enviada. Aproximado por diseño. */
async function origenCampana(agencyId: string | null): Promise<number> {
  const db = getAdminDb()
  let cq = db.from("wa_contacts").select("phone").not("last_campaign_sent_at", "is", null)
  if (agencyId) cq = cq.eq("agency_id", agencyId)
  const { data: contactos, error: ce } = await cq
  if (ce) throw new Error(`origenCampana contactos: ${ce.message}`)
  const phones = (contactos ?? []).map((c) => c.phone as string)
  if (!phones.length) return 0
  let vq = db.from("wa_conversations").select("*", { count: "exact", head: true }).in("contact_phone", phones)
  if (agencyId) vq = vq.eq("agency_id", agencyId)
  const { count, error } = await vq
  if (error) throw new Error(`origenCampana convs: ${error.message}`)
  return count ?? 0
}

function semaforoWhatsapp(m: MetricasWa): { semaforo: Semaforo; sub: Record<string, Semaforo> } {
  const sub: Record<string, Semaforo> = {
    agente_ciego: m.agente_ciego === 0 ? "verde" : m.agente_ciego <= 2 ? "amarillo" : "rojo",
    sin_responder: m.sin_responder_6h > 0 ? "rojo" : m.sin_responder_total > 0 ? "amarillo" : "verde",
    tasa_respuesta:
      m.tasa_respuesta_pct === null ? "gris" : m.tasa_respuesta_pct >= 80 ? "verde" : m.tasa_respuesta_pct >= 50 ? "amarillo" : "rojo",
    enfriados: m.enfriados === 0 ? "verde" : "amarillo",
  }
  return { semaforo: peorSemaforo(Object.values(sub)), sub }
}

/** Devuelve el snapshot global + uno por agencia activa. */
export async function auditarWhatsapp(): Promise<AuditSnapshot[]> {
  const db = getAdminDb()
  const { data: agencias, error } = await db.from("agencies").select("id, name").is("deleted_at", null)
  if (error) throw new Error(`auditarWhatsapp agencias: ${error.message}`)

  const scopes: { scope: string; agencyId: string | null; nombre: string }[] = [
    { scope: "global", agencyId: null, nombre: "Global" },
    ...(agencias ?? []).map((a) => ({ scope: a.id as string, agencyId: a.id as string, nombre: a.name as string })),
  ]

  const snaps: AuditSnapshot[] = []
  for (const s of scopes) {
    const m = await metricasWhatsapp(s.agencyId)
    const { semaforo, sub } = semaforoWhatsapp(m)
    snaps.push({
      experto: "whatsapp",
      scope: s.scope,
      semaforo,
      resumen: "", // lo completa el endpoint con narrate
      metricas: { ...m, agencia: s.nombre, sub_semaforos: sub },
    })
  }
  return snaps
}
