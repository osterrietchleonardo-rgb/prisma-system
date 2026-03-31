import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic";
import { fetchTokko } from "@/lib/tokko"

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms))

// ─────────────────────────────────────────────────────────────
// Fetch ALL contacts from Tokko with pagination + rate-limit respect
// ─────────────────────────────────────────────────────────────
async function fetchAllTokkoContacts(apiKey: string) {
  const MAX_CONTACTS = 10000
  const LIMIT        = 100
  const DELAY_MS     = 350

  let all: any[]         = []
  let offset             = 0
  let totalCount: number | null = null

  do {
    const data = await fetchTokko(
      `/contact/?limit=${LIMIT}&offset=${offset}`,
      apiKey
    )

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

// ─────────────────────────────────────────────────────────────
// Map a Tokko contact object → leads row (all available fields)
// ─────────────────────────────────────────────────────────────
function mapTokkoContact(c: any, agencyId: string) {
  const firstName = c.first_name || ""
  const lastName  = c.last_name  || ""
  const fullName  = [firstName, lastName].filter(Boolean).join(" ").trim()
                  || c.name || "Sin nombre"

  // Tags: Tokko returns them as an array of objects or strings
  const tags: string[] = (c.tags || []).map((t: any) =>
    typeof t === "string" ? t : t.name || t.label || String(t)
  ).filter(Boolean)

  // Property info (nested object)
  const prop = c.property || c.properties?.[0] || null

  // Build a comprehensive notes string
  const noteParts: string[] = []
  if (c.message)      noteParts.push(`Mensaje: ${c.message}`)
  if (c.search_data || c.search_text)
    noteParts.push(`Búsqueda: ${c.search_data || c.search_text}`)
  if (prop?.publication_title || prop?.address)
    noteParts.push(`Propiedad: ${prop?.publication_title || prop?.address}`)
  if (prop?.price)    noteParts.push(`Precio: ${prop?.currency || ""} ${prop?.price}`)
  if (tags.length)    noteParts.push(`Etiquetas: ${tags.join(", ")}`)
  if (c.origin || c.source_name)
    noteParts.push(`Origen: ${c.origin || c.source_name}`)

  // Attempt to parse tokko_created_date
  let createdDate: string | null = null
  const rawDate = c.created_date || c.date || c.created_at
  if (rawDate) {
    try { createdDate = new Date(rawDate).toISOString() }
    catch { createdDate = null }
  }

  // Find location and operation from nested objects (based on typical Tokko response)
  const location = c.location?.name || prop?.location?.name || null
  const operation = c.operation?.name || (tags.find(t => t === "Alquiler") ? "Alquiler" : (tags.find(t => t === "Venta") ? "Venta" : null))

  return {
    agency_id:              agencyId,
    full_name:              fullName,
    email:                  c.email          || null,
    phone:                  c.phone || c.cellphone || c.mobile || null,
    source:                 c.source_name || c.origin || "Tokko Broker",
    pipeline_stage:         "nuevo",
    status:                 "active",
    notes:                  noteParts.join("\n\n") || null,

    // Tokko-specific columns
    tokko_contact_id:       String(c.id),
    tokko_property_id:      prop?.id   ? String(prop.id) : null,
    tokko_property_title:   prop?.publication_title || prop?.title || null,
    tokko_property_address: prop?.address || null,
    tokko_property_type:    prop?.type?.name || null,
    tokko_property_price:   prop?.price
                               ? `${prop?.currency || ""} ${prop.price}`.trim()
                               : null,
    tokko_tags:             tags.length ? tags : null,
    tokko_search_data:      c.search_data || c.search_text || c.message || null,
    tokko_origin:           c.origin || c.source_name || null,
    tokko_created_date:     createdDate,
    tokko_agent_name:       c.agent?.name || null,
    tokko_agent_email:      c.agent?.email || null,
    tokko_agent_phone:      c.agent?.cellphone || c.agent?.phone || null,
    tokko_agent_picture:    c.agent?.picture || null,
    tokko_lead_status:      c.lead_status || null,
    tokko_property_operation: operation,
    tokko_property_location:  location,

    // Full raw object for future reference
    tokko_raw: c,
  }
}

// ─────────────────────────────────────────────────────────────
// GET — Preview contacts from Tokko (with already_imported flag)
// ─────────────────────────────────────────────────────────────
export async function GET(_req: NextRequest) {
  const supabase = createClient()

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, agency_id")
      .eq("id", session.user.id)
      .single()

    if (profile?.role !== "director" || !profile.agency_id) {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
    }

    const { data: agency } = await supabase
      .from("agencies")
      .select("tokko_api_key")
      .eq("id", profile.agency_id)
      .single()

    if (!agency?.tokko_api_key) {
      return NextResponse.json({
        error: "API Key de Tokko no configurada. Configurala en Ajustes."
      }, { status: 400 })
    }

    const { contacts, total } = await fetchAllTokkoContacts(agency.tokko_api_key)

    // Mark already-imported
    const { data: existingLeads } = await supabase
      .from("leads")
      .select("tokko_contact_id")
      .eq("agency_id", profile.agency_id)
      .not("tokko_contact_id", "is", null)

    const alreadyImported = new Set(
      (existingLeads || []).map(l => String(l.tokko_contact_id))
    )

    const mapped = contacts.map((c: any) => {
      const firstName = c.first_name || ""
      const lastName  = c.last_name  || ""
      const fullName  = [firstName, lastName].filter(Boolean).join(" ").trim()
                      || c.name || "Sin nombre"
      const prop      = c.property || c.properties?.[0] || null
      const tags: string[] = (c.tags || []).map((t: any) =>
        typeof t === "string" ? t : t.name || t.label || String(t)
      ).filter(Boolean)

      return {
        tokko_id:         String(c.id),
        full_name:        fullName,
        email:            c.email || null,
        phone:            c.phone || c.cellphone || c.mobile || null,
        message:          c.message || c.search_data || null,
        property_title:   prop?.publication_title || prop?.address || null,
        property_address: prop?.address || null,
        property_type:    prop?.type?.name || null,
        property_price:   prop?.price ? `${prop?.currency || ""} ${prop.price}`.trim() : null,
        contact_date:     c.created_date || c.date || null,
        source:           c.source_name || c.origin || "Tokko Broker",
        tags,
        already_imported: alreadyImported.has(String(c.id)),
      }
    })

    return NextResponse.json({ leads: mapped, total, fetched: contacts.length })
  } catch (error: any) {
    console.error("Tokko leads fetch error:", error?.message)
    return NextResponse.json({
      error: error.message || "Error al obtener contactos de Tokko"
    }, { status: 500 })
  }
}

// ─────────────────────────────────────────────────────────────
// POST — Import ALL (or selected) contacts into Supabase
// Body: { mode: "all" | "selected", leads?: any[], assigned_agent_id?: string }
// ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = createClient()

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, agency_id")
      .eq("id", session.user.id)
      .single()

    if (profile?.role !== "director" || !profile.agency_id) {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
    }

    let body;
    try {
      body = await req.json();
    } catch (e) {
      return NextResponse.json({ error: "Cuerpo de solicitud inválido o vacío" }, { status: 400 });
    }

    const { mode = "all", leads: selectedLeads, assigned_agent_id } = body

    let contactsToImport: any[] = []

    if (mode === "all") {
      const { data: agency } = await supabase
        .from("agencies")
        .select("tokko_api_key")
        .eq("id", profile.agency_id)
        .single()

      if (!agency?.tokko_api_key) {
        return NextResponse.json({ error: "API Key de Tokko no configurada." }, { status: 400 })
      }

      const { contacts } = await fetchAllTokkoContacts(agency.tokko_api_key)
      contactsToImport = contacts
    } else {
      contactsToImport = selectedLeads || []
    }

    if (contactsToImport.length === 0) {
      return NextResponse.json({ error: "No hay contactos para importar" }, { status: 400 })
    }

    const rows = contactsToImport.map((c: any) => ({
      ...mapTokkoContact(c, profile.agency_id!),
      ...(assigned_agent_id ? { assigned_agent_id } : {}),
    }))

    const BATCH = 100
    let totalUpserted = 0
    let errors: any[] = []

    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH)
      const { data, error } = await supabase
        .from("leads")
        .upsert(batch, {
          onConflict: "tokko_contact_id",
          ignoreDuplicates: false
        })
        .select("id")

      if (error) {
        errors.push(error);
        console.error(`Batch ${i / BATCH + 1} error:`, error)
      } else {
        totalUpserted += data?.length || batch.length
      }
    }

    if (totalUpserted === 0 && errors.length > 0) {
      throw new Error(`Error en base de datos: ${errors[0].message}`);
    }

    return NextResponse.json({
      success:  true,
      imported: totalUpserted,
      total:    rows.length,
    })
  } catch (error: any) {
    console.error("Tokko import error details:", error)
    return NextResponse.json({
      error: error.message || "Error interno al importar contactos"
    }, { status: 500 })
  }
}
