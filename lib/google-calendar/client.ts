import {
  getGoogleClientId,
  getGoogleClientSecret,
  getRedirectUri,
} from "./config"

/**
 * Cliente liviano de Google (OAuth + Calendar API) usando fetch directo.
 * Evitamos dependencias pesadas (googleapis): solo los endpoints que usamos.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token"
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
const CALENDAR_BASE = "https://www.googleapis.com/calendar/v3/calendars/primary/events"

export interface GoogleTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  scope: string
  token_type: string
}

/** Intercambia el `code` del callback por tokens (incluye refresh_token). */
export async function exchangeCodeForTokens(
  code: string
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: getGoogleClientId(),
    client_secret: getGoogleClientSecret(),
    redirect_uri: getRedirectUri(),
    grant_type: "authorization_code",
  })

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google token exchange falló (${res.status}): ${text}`)
  }
  return res.json()
}

/** Obtiene un access_token fresco a partir del refresh_token guardado. */
export async function getAccessToken(refreshToken: string): Promise<string> {
  const body = new URLSearchParams({
    client_id: getGoogleClientId(),
    client_secret: getGoogleClientSecret(),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  })

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google refresh token falló (${res.status}): ${text}`)
  }
  const data = (await res.json()) as GoogleTokenResponse
  return data.access_token
}

/** Email de la cuenta Google (para mostrar "conectado como ..."). */
export async function getGoogleEmail(accessToken: string): Promise<string | null> {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.email ?? null
}

export interface CalendarEventInput {
  summary: string
  description?: string
  location?: string
  startDateTime: string // ISO con offset, ej: 2026-07-01T15:00:00-03:00
  endDateTime: string
  timeZone: string
}

function eventBody(input: CalendarEventInput) {
  return {
    summary: input.summary,
    description: input.description,
    location: input.location,
    start: { dateTime: input.startDateTime, timeZone: input.timeZone },
    end: { dateTime: input.endDateTime, timeZone: input.timeZone },
  }
}

/** Crea un evento en el calendario principal. Devuelve el id del evento. */
export async function createEvent(
  accessToken: string,
  input: CalendarEventInput
): Promise<string> {
  const res = await fetch(CALENDAR_BASE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(eventBody(input)),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google createEvent falló (${res.status}): ${text}`)
  }
  const data = await res.json()
  return data.id as string
}

/** Actualiza un evento existente. */
export async function updateEvent(
  accessToken: string,
  eventId: string,
  input: CalendarEventInput
): Promise<void> {
  const res = await fetch(`${CALENDAR_BASE}/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(eventBody(input)),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google updateEvent falló (${res.status}): ${text}`)
  }
}

/** Borra un evento. 404/410 (ya no existe) se considera éxito. */
export async function deleteEvent(
  accessToken: string,
  eventId: string
): Promise<void> {
  const res = await fetch(`${CALENDAR_BASE}/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const text = await res.text()
    throw new Error(`Google deleteEvent falló (${res.status}): ${text}`)
  }
}

/** Revoca el acceso (al desconectar). Best-effort. */
export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    })
  } catch {
    /* best-effort */
  }
}
