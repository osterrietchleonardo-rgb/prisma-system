import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { decryptToken } from "@/lib/google-calendar/crypto"
import { revokeToken } from "@/lib/google-calendar/client"

export const runtime = "nodejs"

/** Desconecta Google Calendar: revoca el acceso y borra la llave guardada. */
export async function POST() {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  }

  const admin = createAdminClient()

  // Intentar revocar en Google (best-effort)
  const { data: row } = await admin
    .from("google_calendar_tokens")
    .select("refresh_token_enc")
    .eq("user_id", session.user.id)
    .single()

  if (row?.refresh_token_enc) {
    try {
      await revokeToken(decryptToken(row.refresh_token_enc))
    } catch {
      /* best-effort */
    }
  }

  const { error } = await admin
    .from("google_calendar_tokens")
    .delete()
    .eq("user_id", session.user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
