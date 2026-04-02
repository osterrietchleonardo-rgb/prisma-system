import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

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

    const { data, error } = await supabase
      .from("contratos")
      .select("*")
      .eq("agency_id", profile.agency_id)
      .order("created_at", { ascending: false })

    if (error) throw error
    return NextResponse.json(data)
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

    const { data, error } = await supabase
      .from("contratos")
      .insert({
        agency_id: profile.agency_id,
        template_id: body.template_id || null,
        tipo: body.tipo,
        nombre_referencia: body.nombre_referencia || null,
        estado: body.estado || "borrador",
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
