import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Get template info
    const { data: template } = await supabase
      .from("contract_templates")
      .select("tipo, agency_id")
      .eq("id", params.id)
      .single()

    if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const { data: profile } = await supabase
      .from("profiles")
      .select("agency_id")
      .eq("id", user.id)
      .single()

    if (!profile?.agency_id) {
      return NextResponse.json({ error: "No agency found" }, { status: 403 })
    }

    // Deactivate all templates of same type for same agency
    await supabase
      .from("contract_templates")
      .update({ is_active: false })
      .eq("tipo", template.tipo)
      .eq("agency_id", profile.agency_id)

    // Activate the selected template
    const { data, error } = await supabase
      .from("contract_templates")
      .update({ is_active: true, updated_at: new Date().toISOString() })
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
