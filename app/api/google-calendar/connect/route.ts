import { NextResponse } from "next/server"
import crypto from "crypto"
import { createClient } from "@/lib/supabase/server"
import {
  getGoogleClientId,
  getRedirectUri,
  getAppUrl,
  GOOGLE_CALENDAR_SCOPE,
  isGoogleCalendarConfigured,
} from "@/lib/google-calendar/config"

export const runtime = "nodejs"

/** Inicia el flujo OAuth: redirige al consentimiento de Google. */
export async function GET() {
  const appUrl = getAppUrl()

  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.redirect(`${appUrl}/auth/login`)
  }

  const basePath =
    session.user.user_metadata?.role === "director"
      ? "/director/configuracion"
      : "/asesor/configuracion"

  if (!isGoogleCalendarConfigured()) {
    return NextResponse.redirect(
      `${appUrl}${basePath}?tab=integraciones&google=no_config`
    )
  }

  const state = crypto.randomBytes(16).toString("hex")

  const params = new URLSearchParams({
    client_id: getGoogleClientId(),
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  })

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`

  const res = NextResponse.redirect(authUrl)
  res.cookies.set("gcal_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 min
  })
  return res
}
