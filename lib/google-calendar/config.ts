/** Configuración central de la integración con Google Calendar. */

export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events"

// Zona horaria por defecto para los eventos (Argentina).
export const DEFAULT_TIMEZONE = "America/Argentina/Buenos_Aires"

// Duración por defecto de una visita, en minutos.
export const DEFAULT_EVENT_DURATION_MIN = 60

export function getGoogleClientId(): string {
  const id = process.env.GOOGLE_CLIENT_ID
  if (!id) throw new Error("GOOGLE_CLIENT_ID no está configurada")
  return id
}

export function getGoogleClientSecret(): string {
  const secret = process.env.GOOGLE_CLIENT_SECRET
  if (!secret) throw new Error("GOOGLE_CLIENT_SECRET no está configurada")
  return secret
}

/** Base URL pública de la app (sin barra final). */
export function getAppUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "http://localhost:3000"
  return url.replace(/\/$/, "")
}

/** Redirect URI registrado en Google Cloud para el callback OAuth. */
export function getRedirectUri(): string {
  return (
    process.env.GOOGLE_OAUTH_REDIRECT_URI ||
    `${getAppUrl()}/api/google-calendar/callback`
  )
}

/** true si la integración tiene las variables mínimas para funcionar. */
export function isGoogleCalendarConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_TOKEN_ENCRYPTION_KEY
  )
}
