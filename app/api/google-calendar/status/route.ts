import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isGoogleCalendarConfigured } from "@/lib/google-calendar/config"

export const runtime = "nodejs"

/** Devuelve el estado de conexión de Google Calendar del asesor logueado. */
export async function GET() {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ connected: false, configured: false }, { status: 401 })
  }

  const configured = isGoogleCalendarConfigured()

  const admin = createAdminClient()
  const { data } = await admin
    .from("google_calendar_tokens")
    .select("google_email, connected_at")
    .eq("user_id", session.user.id)
    .single()

  return NextResponse.json({
    configured,
    connected: Boolean(data),
    email: data?.google_email ?? null,
    connectedAt: data?.connected_at ?? null,
  })
}
