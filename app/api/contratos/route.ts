import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
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

    const isDirector = profile.role === "director"

    let query = supabase
      .from("contratos")
      .select("*")
      .eq("agency_id", profile.agency_id)
      .order("created_at", { ascending: false })

    if (isDirector) {
      // El director ve todos los contratos de la agencia (incluye eliminados, con su motivo)
    } else {
      // El asesor solo ve los suyos y no los eliminados
      query = query.eq("created_by", user.id).neq("estado_gestion", "eliminado")
    }

    const { data, error } = await query
    if (error) throw error

    let rows = data || []

    // Enriquecer con el nombre del asesor que generó cada contrato (solo lo usa el director)
    if (isDirector && rows.length > 0) {
      const creatorIds = Array.from(new Set(rows.map(r => r.created_by).filter(Boolean)))
      if (creatorIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", creatorIds)
        const nameById = new Map((profiles || []).map(p => [p.id, p.full_name]))
        rows = rows.map(r => ({ ...r, asesor_nombre: nameById.get(r.created_by) || null }))
      }
    }

    return NextResponse.json(rows)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
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

    // El contrato generado comparte el código único de la plantilla usada,
    // de modo que el código del PDF/Word que subió el director coincide con el
    // del contrato generado por el asesor. Si la plantilla aún no tiene código
    // (p.ej. plantilla del sistema), se genera uno y se persiste en la plantilla.
    let codigo_unico: string | null = null
    if (body.template_id) {
      const { data: tpl } = await supabase
        .from("contract_templates")
        .select("codigo_unico")
        .eq("id", body.template_id)
        .single()
      codigo_unico = tpl?.codigo_unico ?? null
      if (!codigo_unico) {
        codigo_unico = `PLT-${crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`
        // Admin client: el backfill del código en la plantilla debe persistir
        // aunque lo dispare un asesor (RLS no le permitiría editar plantillas).
        await createAdminClient()
          .from("contract_templates")
          .update({ codigo_unico })
          .eq("id", body.template_id)
      }
    } else {
      // Sin plantilla persistida (fallback): código propio del contrato
      codigo_unico = `CTR-${crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`
    }

    const { data, error } = await supabase
      .from("contratos")
      .insert({
        agency_id: profile.agency_id,
        template_id: body.template_id || null,
        tipo: body.tipo,
        nombre_referencia: body.nombre_referencia || null,
        estado: body.estado || "borrador",
        codigo_unico,
        estado_gestion: "original",
        form_data: body.form_data || {},
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
