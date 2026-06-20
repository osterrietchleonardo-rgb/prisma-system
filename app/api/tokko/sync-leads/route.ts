import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic";
import {
  fetchAllTokkoContacts,
  mapTokkoContact,
  buildAgentEmailMap,
  runLeadsSync,
} from "@/lib/tokko-sync"

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
      const fullName = (c.name && String(c.name).trim()) || "Sin nombre"
      const tags: string[] = (c.tags || []).map((t: any) =>
        typeof t === "string" ? t : t.name || t.label || String(t)
      ).filter(Boolean)

      return {
        tokko_id:         String(c.id),
        full_name:        fullName,
        email:            c.email || null,
        phone:            c.phone || c.cellphone || null,
        contact_date:     c.created_at || null,
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
  const adminClient = createAdminClient()

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

    // ─── Modo "all": sincroniza desde Tokko (lógica compartida con el cron) ───
    if (mode === "all") {
      const { data: agency } = await supabase
        .from("agencies")
        .select("tokko_api_key")
        .eq("id", profile.agency_id)
        .single()

      if (!agency?.tokko_api_key) {
        return NextResponse.json({ error: "API Key de Tokko no configurada." }, { status: 400 })
      }

      const res = await runLeadsSync(adminClient, profile.agency_id, agency.tokko_api_key)
      return NextResponse.json({
        success: true,
        imported: res.imported,
        nuevos: res.nuevos,
        procesados: res.procesados,
        tokko_total: res.total,
        errors: res.errors,
      })
    }

    // ─── Modo "selected": importa los contactos elegidos en la UI ───
    const contactsToImport: any[] = selectedLeads || []
    if (contactsToImport.length === 0) {
      return NextResponse.json({ error: "No hay contactos para importar" }, { status: 400 })
    }

    const agentEmailMap = await buildAgentEmailMap(adminClient, profile.agency_id!)

    const { count: beforeTotal } = await adminClient
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("agency_id", profile.agency_id)

    const rows = contactsToImport.map((c: any) => ({
      ...mapTokkoContact(c, profile.agency_id!, agentEmailMap),
      // Si el director eligió un asesor manual, ese gana sobre el matcheo automático
      ...(assigned_agent_id ? { assigned_agent_id } : {}),
    }))

    const BATCH = 100
    let errors: any[] = []
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH)
      const { error } = await adminClient
        .from("leads")
        .upsert(batch, { onConflict: "tokko_contact_id", ignoreDuplicates: false })
      if (error) errors.push(error)
    }

    const { count: finalTotal } = await adminClient
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("agency_id", profile.agency_id)

    if ((finalTotal || 0) === (beforeTotal || 0) && errors.length > 0) {
      throw new Error(`Error en base de datos: ${errors[0].message}`)
    }

    return NextResponse.json({
      success: true,
      imported: finalTotal || 0,
      nuevos: Math.max(0, (finalTotal || 0) - (beforeTotal || 0)),
      procesados: rows.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error("Tokko import error details:", error)
    return NextResponse.json({
      error: error.message || "Error interno al importar contactos"
    }, { status: 500 })
  }
}
