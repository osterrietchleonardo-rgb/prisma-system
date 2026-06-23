// ─────────────────────────────────────────────────────────────
// Orquestadores de sincronización Tokko, reutilizables por:
//  - los endpoints manuales (director logueado): /api/tokko/sync, /api/tokko/sync-leads
//  - el cron automático (sin sesión): /api/cron/tokko-sync
// Toda la lógica de mapeo vive acá (una sola fuente de verdad).
// ─────────────────────────────────────────────────────────────
import { createClient as createAdminClient, type SupabaseClient } from "@supabase/supabase-js"
import { fetchTokko, syncPropertiesFromTokko, syncAgentsFromTokko } from "./tokko"
import { pickSurfaces, stripTokkoSensitive, deriveLeadOrigin, findTagByGroup } from "./tokko-shared"
import { generateEmbedding } from "./gemini"

export function getAdminClient(): SupabaseClient {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms))

// ───────────────────────── PROPIEDADES ─────────────────────────
const typeMapping: Record<string, string> = {
  Apartment: "Departamento",
  House: "Casa",
  Land: "Lote",
  Office: "Oficina",
  Local: "Local Comercial",
  Store: "Local Comercial",
  Ph: "PH",
}

const statusMapping: Record<string, string> = {
  Sale: "Venta",
  Rent: "Alquiler",
  "Temporary Rent": "Alquiler Temporario",
}

function mapTokkoProperty(p: any, agencyId: string, agencyProfiles: any[] | null) {
  const rawType = p.type?.name || "Desconocido"
  const rawStatus = p.operations?.[0]?.operation_type || "Venta"
  const producerEmail = p.producer?.email?.toLowerCase()
  const matchedProfile = agencyProfiles?.find((ap) => ap.email?.toLowerCase() === producerEmail)

  const activeOperation = p.operations?.[0]
  const validPrice = activeOperation?.prices?.find((pr: any) => pr.price > 0) || activeOperation?.prices?.[0]

  // Superficies robustas (ver lib/tokko-shared)
  const { total: totalArea, covered: coveredArea } = pickSurfaces(p)

  return {
    tokko_id: p.id.toString(),
    agency_id: agencyId,
    assigned_agent_id: matchedProfile?.id || null,
    assigned_agent: {
      name: p.producer?.name || "Sin asignar",
      email: p.producer?.email || "",
      cellphone: p.producer?.cellphone || p.producer?.phone || "",
    },
    title: p.publication_title,
    description: p.description,
    price: validPrice?.price || 0,
    currency: validPrice?.currency || "USD",
    property_type: typeMapping[rawType] || rawType,
    status: statusMapping[rawStatus] || rawStatus,
    address: p.address,
    city: p.location?.name,
    bedrooms: p.suite_amount || 0,
    bathrooms: p.bathroom_amount || 0,
    total_area: totalArea,
    covered_area: coveredArea,
    images: p.photos?.map((f: { image: string }) => f.image) || [],
    tokko_data: stripTokkoSensitive(p),
    is_active: true,
    updated_at: new Date().toISOString(),
  }
}

// Texto canonico que se vectoriza por propiedad (mismo formato que el backfill).
function buildPropertyEmbedText(p: {
  title?: string | null
  property_type?: string | null
  address?: string | null
  city?: string | null
  description?: string | null
}) {
  return [p.title, p.property_type, p.address, p.city, p.description]
    .map((v) => (v ?? "").toString().trim())
    .filter(Boolean)
    .join(" ")
}

/**
 * Genera embeddings (Gemini) para propiedades NUEVAS o cuyo texto cambio.
 * - Best-effort: si Gemini falla en una, no corta el sync; la retoma el proximo sync.
 * - Tope por corrida (MAX_PER_RUN) para no agotar timeouts/limites; el resto se completa
 *   en corridas siguientes porque quedan con embedding NULL.
 */
async function syncPropertyEmbeddings(
  admin: SupabaseClient,
  agencyId: string,
  mapped: { tokko_id: string; title: any; description: any; address: any; city: any; property_type: any }[],
  prevTextByTokkoId: Map<string, string>,
) {
  const MAX_PER_RUN = 100
  const tokkoIds = mapped.map((p) => p.tokko_id)

  // tokko_ids sin embedding (recien insertados o pendientes de corridas anteriores)
  const missing = new Set<string>()
  const CH = 300
  for (let i = 0; i < tokkoIds.length; i += CH) {
    const chunk = tokkoIds.slice(i, i + CH)
    const { data } = await admin
      .from("properties")
      .select("tokko_id")
      .eq("agency_id", agencyId)
      .in("tokko_id", chunk)
      .is("embedding", null)
    for (const r of data || []) missing.add(r.tokko_id)
  }

  // (Re)embeddear: sin embedding, o con texto (titulo/desc/direccion/ciudad/tipo) modificado.
  const toEmbed = mapped.filter((p) => {
    const newText = buildPropertyEmbedText(p)
    if (!newText) return false
    if (missing.has(p.tokko_id)) return true
    const prev = prevTextByTokkoId.get(p.tokko_id)
    return prev !== undefined && prev !== newText
  })

  let embedded = 0
  for (const p of toEmbed.slice(0, MAX_PER_RUN)) {
    try {
      const embedding = await generateEmbedding(buildPropertyEmbedText(p))
      await admin.from("properties").update({ embedding }).eq("agency_id", agencyId).eq("tokko_id", p.tokko_id)
      embedded++
      await sleep(300)
    } catch (e: any) {
      console.error(`Embedding propiedad ${p.tokko_id} fallo (no corta sync):`, e?.message || e)
    }
  }

  return { embedded, pendientes: Math.max(0, toEmbed.length - embedded) }
}

/** Sincroniza TODAS las propiedades de una agencia. Devuelve la cantidad procesada. */
export async function runPropertiesSync(admin: SupabaseClient, agencyId: string, apiKey: string) {
  const [tokkoProperties, tokkoAgents] = await Promise.all([
    syncPropertiesFromTokko(apiKey),
    syncAgentsFromTokko(apiKey),
  ])

  const { data: agencyProfiles } = await admin
    .from("profiles")
    .select("id, email, full_name")
    .eq("agency_id", agencyId)

  const propertiesToUpsert = tokkoProperties.map((p: any) => mapTokkoProperty(p, agencyId, agencyProfiles))

  // Texto previo (ANTES del upsert) para detectar modificaciones que requieren re-embedding.
  const prevTextByTokkoId = new Map<string, string>()
  {
    const ids = propertiesToUpsert.map((p) => p.tokko_id)
    const CH = 300
    for (let i = 0; i < ids.length; i += CH) {
      const chunk = ids.slice(i, i + CH)
      const { data } = await admin
        .from("properties")
        .select("tokko_id, title, description, address, city, property_type")
        .eq("agency_id", agencyId)
        .in("tokko_id", chunk)
      for (const row of data || []) prevTextByTokkoId.set(row.tokko_id, buildPropertyEmbedText(row))
    }
  }

  if (propertiesToUpsert.length > 0) {
    const { error } = await admin.from("properties").upsert(propertiesToUpsert, { onConflict: "tokko_id" })
    if (error) throw error

    // Embeddings automaticos para propiedades nuevas/modificadas (best-effort, no corta el sync).
    await syncPropertyEmbeddings(admin, agencyId, propertiesToUpsert as any, prevTextByTokkoId)
  }

  // Desactivar propiedades que ya no están en Tokko
  const currentTokkoIds = propertiesToUpsert.map((p) => p.tokko_id)
  if (currentTokkoIds.length > 0) {
    const { data: existingProps } = await admin
      .from("properties")
      .select("id, tokko_id")
      .eq("agency_id", agencyId)
      .eq("is_active", true)

    const idsToDeactivate =
      existingProps?.filter((p) => p.tokko_id && !currentTokkoIds.includes(p.tokko_id)).map((p) => p.id) || []

    const chunkSize = 100
    for (let i = 0; i < idsToDeactivate.length; i += chunkSize) {
      const chunk = idsToDeactivate.slice(i, i + chunkSize)
      await admin.from("properties").update({ is_active: false, updated_at: new Date().toISOString() }).in("id", chunk)
    }
  }

  // Upsert de agentes de Tokko
  const agentsToUpsert = tokkoAgents.map((a: any) => ({
    tokko_id: a.id.toString(),
    agency_id: agencyId,
    full_name: a.name,
    email: a.email,
    phone: a.cellphone || a.phone,
    avatar_url: a.picture || a.image,
    updated_at: new Date().toISOString(),
  }))

  if (agentsToUpsert.length > 0) {
    const { error } = await admin.from("tokko_agents").upsert(agentsToUpsert, { onConflict: "tokko_id" })
    if (error) throw error
  }

  await admin.from("agencies").update({ last_sync_at: new Date().toISOString() }).eq("id", agencyId)

  return { count: propertiesToUpsert.length }
}

// ───────────────────────── LEADS / CONTACTOS ─────────────────────────
export async function fetchAllTokkoContacts(apiKey: string) {
  const MAX_CONTACTS = 1000
  const LIMIT = 50
  const DELAY_MS = 350

  let all: any[] = []
  let offset = 0
  let totalCount: number | null = null

  do {
    // más nuevos primero; NO filtrar por deleted_at (es fecha de última actualización)
    const data = await fetchTokko(`/contact/?limit=${LIMIT}&offset=${offset}&order_by=-created_at`, apiKey)

    if (data.objects && Array.isArray(data.objects)) {
      all = [...all, ...data.objects]
    }
    if (totalCount === null) {
      totalCount = data.meta?.total_count ?? all.length
    }
    if (all.length >= Math.min(totalCount ?? MAX_CONTACTS, MAX_CONTACTS)) break

    offset += LIMIT
    await sleep(DELAY_MS)
  } while (offset < Math.min(totalCount ?? MAX_CONTACTS, MAX_CONTACTS))

  return { contacts: all, total: totalCount ?? all.length }
}

/** Mapa email(min) → profile.id de la agencia, para asignación automática de leads. */
export async function buildAgentEmailMap(admin: SupabaseClient, agencyId: string) {
  const { data: profiles } = await admin.from("profiles").select("id, email").eq("agency_id", agencyId)
  const map = new Map<string, string>()
  for (const p of profiles || []) {
    if (p.email) map.set(String(p.email).toLowerCase().trim(), p.id)
  }
  return map
}

/** Mapea un contacto de Tokko (/contact/, 20 campos) a una fila de `leads`. */
export function mapTokkoContact(c: any, agencyId: string, agentEmailMap?: Map<string, string>) {
  const fullName = (c.name && String(c.name).trim()) || "Sin nombre"

  const tagNames: string[] = (c.tags || [])
    .map((t: any) => (typeof t === "string" ? t : t.name || t.label || String(t)))
    .filter(Boolean)

  const origin = deriveLeadOrigin(c.tags)
  const operation = findTagByGroup(c.tags, /operaci[oó]n/i)
  const location = findTagByGroup(c.tags, /zona|ubicaci[oó]n|localidad|barrio/i)

  const noteParts: string[] = []
  if (origin) noteParts.push(`Origen: ${origin}`)
  if (tagNames.length) noteParts.push(`Etiquetas: ${tagNames.join(", ")}`)

  let createdDate: string | null = null
  const rawDate = c.created_at || c.created_date || c.date
  if (rawDate) {
    try { createdDate = new Date(rawDate).toISOString() } catch { createdDate = null }
  }

  let pipelineStage = "nuevo"
  const tokkoStatus = c.lead_status?.toLowerCase()
  if (tokkoStatus) {
    if (tokkoStatus.includes("nuevo")) pipelineStage = "nuevo"
    else if (tokkoStatus.includes("contacto") || tokkoStatus.includes("respondido")) pipelineStage = "contacto"
    else if (tokkoStatus.includes("visita")) pipelineStage = "visita_realizada"
    else if (tokkoStatus.includes("propuesta") || tokkoStatus.includes("reserva")) pipelineStage = "propuesta"
    else if (tokkoStatus.includes("negociación")) pipelineStage = "negociacion"
    else if (tokkoStatus.includes("cerrado") || tokkoStatus.includes("vendido") || tokkoStatus.includes("alquilado")) pipelineStage = "cerrado"
    else if (tokkoStatus.includes("perdido") || tokkoStatus.includes("descartado")) pipelineStage = "perdido"
  }

  const agentEmail = c.agent?.email ? String(c.agent.email).toLowerCase().trim() : null
  const assignedAgentId = agentEmail ? agentEmailMap?.get(agentEmail) ?? null : null

  return {
    agency_id: agencyId,
    full_name: fullName,
    email: c.email || null,
    phone: c.phone || c.cellphone || null,
    source: origin || "Tokko Broker",
    pipeline_stage: pipelineStage,
    status: "active",
    notes: noteParts.join("\n\n") || null,
    ...(assignedAgentId ? { assigned_agent_id: assignedAgentId } : {}),

    tokko_contact_id: String(c.id),
    tokko_tags: tagNames.length ? tagNames : null,
    tokko_origin: origin,
    tokko_created_date: createdDate,
    tokko_agent_name: c.agent?.name || null,
    tokko_agent_email: c.agent?.email || null,
    tokko_agent_phone: c.agent?.cellphone || c.agent?.phone || null,
    tokko_agent_picture: c.agent?.picture || null,
    tokko_lead_status: c.lead_status || null,
    tokko_property_operation: operation,
    tokko_property_location: location,
    tokko_raw: c,
  }
}

/** Sincroniza los leads (más recientes) de una agencia. Devuelve nuevos/procesados/total. */
export async function runLeadsSync(admin: SupabaseClient, agencyId: string, apiKey: string) {
  const agentEmailMap = await buildAgentEmailMap(admin, agencyId)
  const { contacts, total } = await fetchAllTokkoContacts(apiKey)

  const { count: beforeTotal } = await admin
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("agency_id", agencyId)

  const rows = contacts.map((c: any) => mapTokkoContact(c, agencyId, agentEmailMap))

  const BATCH = 100
  let errors: any[] = []
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error } = await admin.from("leads").upsert(batch, { onConflict: "tokko_contact_id", ignoreDuplicates: false })
    if (error) errors.push(error)
  }

  const { count: finalTotal } = await admin
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("agency_id", agencyId)

  if ((finalTotal || 0) === (beforeTotal || 0) && errors.length > 0) {
    throw new Error(`Error en base de datos: ${errors[0].message}`)
  }

  return {
    imported: finalTotal || 0,
    nuevos: Math.max(0, (finalTotal || 0) - (beforeTotal || 0)),
    procesados: rows.length,
    total,
    errors: errors.length ? errors : undefined,
  }
}
