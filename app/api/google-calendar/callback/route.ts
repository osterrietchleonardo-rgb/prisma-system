import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { exchangeCodeForTokens, getGoogleEmail } from "@/lib/google-calendar/client"
import { encryptToken } from "@/lib/google-calendar/crypto"
import { getAppUrl } from "@/lib/google-calendar/config"

export const runtime = "nodejs"

/** Recibe el `code` de Google, guarda el refresh token encriptado del asesor. */
export async function GET(req: NextRequest) {
  const appUrl = getAppUrl()
  // El rol determina a qué config volver (director vs asesor).
  let basePath = "/asesor/configuracion"
  const back = (status: string) =>
    NextResponse.redirect(`${appUrl}${basePath}?tab=integraciones&google=${status}`)

  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const errorParam = url.searchParams.get("error")

  if (errorParam) return back("cancelado")
  if (!code || !state) return back("error")

  // Verificar state (CSRF)
  const savedState = cookies().get("gcal_oauth_state")?.value
  if (!savedState || savedState !== state) return back("error")

  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return NextResponse.redirect(`${appUrl}/auth/login`)

  if (session.user.user_metadata?.role === "director") {
    basePath = "/director/configuracion"
  }

  try {
    const tokens = await exchangeCodeForTokens(code)

    if (!tokens.refresh_token) {
      // Google no devolvió refresh_token (suele pasar si ya estaba autorizado
      // sin prompt=consent). Pedimos reconectar.
      return back("sin_refresh")
    }

    const email = await getGoogleEmail(tokens.access_token)

    const admin = createAdminClient()
    const { error } = await admin.from("google_calendar_tokens").upsert(
      {
        user_id: session.user.id,
        refresh_token_enc: encryptToken(tokens.refresh_token),
        google_email: email,
        scope: tokens.scope,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )

    if (error) {
      console.error("[google-calendar] error guardando token:", error.message)
      return back("error")
    }

    const res = back("conectado")
    res.cookies.delete("gcal_oauth_state")
    return res
  } catch (err: any) {
    console.error("[google-calendar] callback error:", err?.message || err)
    return back("error")
  }
}
