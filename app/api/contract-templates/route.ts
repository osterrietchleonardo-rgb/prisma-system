import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { 
  TEMPLATE_LOCACION_HABITACIONAL, 
  TEMPLATE_LOCACION_COMERCIAL, 
  TEMPLATE_BOLETO_COMPRAVENTA, 
  TEMPLATE_RESERVA_VENTA 
} from "@/lib/contratos/default-templates"
import { getCamposSchemaForTipo } from "@/lib/contratos/placeholder-helpers"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase
      .from("profiles")
      .select("agency_id")
      .eq("id", user.id)
      .single()

    if (!profile?.agency_id) {
      return NextResponse.json({ error: "No agency found" }, { status: 403 })
    }

    let { data, error } = await supabase
      .from("contract_templates")
      .select("*")
      .or(`agency_id.eq.${profile.agency_id},is_system_default.eq.true`)
      .order("tipo")

    // If no templates found, seed default ones
    if (data && data.length === 0) {
      const defaultTemplates = [
        {
          nombre: "Locación Habitacional (Ley 27.551/DNU 70/2023)",
          tipo: "locacion_habitacional",
          template_body: TEMPLATE_LOCACION_HABITACIONAL,
          campos_schema: getCamposSchemaForTipo("locacion_habitacional"),
          is_active: true,
          is_system_default: true,
          agency_id: profile.agency_id,
          created_by: user.id
        },
        {
          nombre: "Locación Comercial (CCyC)",
          tipo: "locacion_comercial",
          template_body: TEMPLATE_LOCACION_COMERCIAL,
          campos_schema: getCamposSchemaForTipo("locacion_comercial"),
          is_active: true,
          is_system_default: true,
          agency_id: profile.agency_id,
          created_by: user.id
        },
        {
          nombre: "Boleto de Compraventa Inmobiliaria",
          tipo: "boleto_compraventa",
          template_body: TEMPLATE_BOLETO_COMPRAVENTA,
          campos_schema: getCamposSchemaForTipo("boleto_compraventa"),
          is_active: true,
          is_system_default: true,
          agency_id: profile.agency_id,
          created_by: user.id
        },
        {
          nombre: "Reserva de Venta",
          tipo: "reserva_venta",
          template_body: TEMPLATE_RESERVA_VENTA,
          campos_schema: getCamposSchemaForTipo("reserva_venta"),
          is_active: true,
          is_system_default: true,
          agency_id: profile.agency_id,
          created_by: user.id
        }
      ]

      // Cada plantilla nace con su código único (PLT-XXXXXX)
      const defaultTemplatesWithCode = defaultTemplates.map(t => ({
        ...t,
        codigo_unico: `PLT-${crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      }))

      const { data: seeded, error: seedError } = await supabase
        .from("contract_templates")
        .insert(defaultTemplatesWithCode)
        .select()

      if (!seedError) {
        data = seeded
      }
    }

    if (error) throw error
    return NextResponse.json(data)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Límite de plantillas subidas por agencia (excluye las del sistema)
const MAX_TEMPLATES_POR_AGENCIA = 50

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase
      .from("profiles")
      .select("agency_id, role")
      .eq("id", user.id)
      .single()

    if (!profile?.agency_id) {
      return NextResponse.json({ error: "No agency found" }, { status: 403 })
    }

    // Solo los directores pueden subir/crear plantillas (los asesores solo las usan)
    if (profile.role !== "director") {
      return NextResponse.json({ error: "Solo los directores pueden subir plantillas" }, { status: 403 })
    }

    // Enforce el límite de 50 plantillas subidas por agencia (no cuenta las del sistema)
    const { count } = await supabase
      .from("contract_templates")
      .select("id", { count: "exact", head: true })
      .eq("agency_id", profile.agency_id)
      .eq("is_system_default", false)

    if ((count ?? 0) >= MAX_TEMPLATES_POR_AGENCIA) {
      return NextResponse.json(
        { error: `Alcanzaste el máximo de ${MAX_TEMPLATES_POR_AGENCIA} contratos subidos. Eliminá alguno para subir uno nuevo.` },
        { status: 400 }
      )
    }

    // Generar un código único corto (PLT-XXXXXX)
    const codigo_unico = `PLT-${crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`

    const { data, error } = await supabase
      .from("contract_templates")
      .insert({
        agency_id: profile.agency_id,
        nombre: body.nombre,
        tipo: body.tipo,
        template_body: body.template_body,
        campos_schema: body.campos_schema || [],
        codigo_unico,
        archivo_original_url: body.archivo_original_url || null,
        is_active: body.is_active || false,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
