import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data, error } = await supabase
      .from("contratos")
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

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.form_data !== undefined) updateData.form_data = body.form_data
    if (body.estado !== undefined) updateData.estado = body.estado
    if (body.pdf_url !== undefined) updateData.pdf_url = body.pdf_url
    if (body.nombre_referencia !== undefined) updateData.nombre_referencia = body.nombre_referencia

    // Si se modifica el contenido del contrato, queda marcado como "modificado" con su motivo
    if (body.form_data !== undefined) {
      updateData.estado_gestion = "modificado"
      if (body.motivo_gestion !== undefined) updateData.motivo_gestion = body.motivo_gestion
    }

    const { data, error } = await supabase
      .from("contratos")
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

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Soft-delete: se marca como eliminado con motivo (el director mantiene el historial)
    let motivo: string | null = null
    try {
      const body = await req.json()
      motivo = body?.motivo_gestion ?? null
    } catch {
      // sin body
    }

    const { error } = await supabase
      .from("contratos")
      .update({
        estado_gestion: "eliminado",
        motivo_gestion: motivo,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
