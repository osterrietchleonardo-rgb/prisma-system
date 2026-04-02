import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data, error } = await supabase
      .from("contract_templates")
      .select("*")
      .eq("id", params.id)
      .single()

    if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(data)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Get current template to increment version
    const { data: current } = await supabase
      .from("contract_templates")
      .select("version, agency_id, is_system_default")
      .eq("id", params.id)
      .single()

    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // System defaults cannot be edited directly
    if (current.is_system_default) {
      return NextResponse.json({ error: "No se pueden editar plantillas del sistema" }, { status: 403 })
    }

    const newVersion = (current.version || 1) + 1

    // Save current version to history
    await supabase.from("contract_template_versions").insert({
      template_id: params.id,
      version: current.version,
      template_body: body.template_body,
      campos_schema: body.campos_schema || [],
      modified_by: user.id,
    })

    const updateData: Record<string, unknown> = {
      version: newVersion,
      updated_at: new Date().toISOString(),
    }
    if (body.template_body !== undefined) updateData.template_body = body.template_body
    if (body.campos_schema !== undefined) updateData.campos_schema = body.campos_schema
    if (body.nombre !== undefined) updateData.nombre = body.nombre

    const { data, error } = await supabase
      .from("contract_templates")
      .update(updateData)
      .eq("id", params.id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { error } = await supabase
      .from("contract_templates")
      .delete()
      .eq("id", params.id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
