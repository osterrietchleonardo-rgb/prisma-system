import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * GET /api/auth/check-status
 * Called by login form after successful Supabase Auth to verify account is not suspended.
 * Returns { status: 'activo' | 'pausado' | 'eliminado' } or { status: 'ok' } if no field.
 */
export async function GET() {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: "no_session" }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("estado")
      .eq("id", session.user.id)
      .single()

    const estado = profile?.estado ?? "activo"
    return NextResponse.json({ estado })
  } catch {
    // On any error, don't block login — let layout handle it
    return NextResponse.json({ estado: "activo" })
  }
}
