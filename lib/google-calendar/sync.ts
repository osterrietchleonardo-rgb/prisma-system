import { createAdminClient } from "@/lib/supabase/admin"
import { decryptToken } from "./crypto"
import {
  getAccessToken,
  createEvent,
  updateEvent,
  deleteEvent,
  type CalendarEventInput,
} from "./client"
import { DEFAULT_TIMEZONE, DEFAULT_EVENT_DURATION_MIN, isGoogleCalendarConfigured } from "./config"

export type SyncResult =
  | { status: "created" | "updated" | "deleted" | "noop" }
  | { status: "skipped"; reason: string }
  | { status: "error"; reason: string }

const CANCEL_STATES = new Set(["cancelada", "cancelado"])

/** Normaliza 'HH:MM' o 'HH:MM:SS' a 'HH:MM:SS'. */
function normalizeTime(t: string): string {
  if (!t) return "00:00:00"
  const parts = t.split(":")
  while (parts.length < 3) parts.push("00")
  return parts.slice(0, 3).map((p) => p.padStart(2, "0")).join(":")
}

/** Construye el payload del evento a partir de la visita. Argentina = UTC-3. */
function buildEvent(visit: Record<string, any>): CalendarEventInput {
  const hora = normalizeTime(visit.hora_visita)
  const start = new Date(`${visit.fecha_visita}T${hora}-03:00`)
  const end = new Date(start.getTime() + DEFAULT_EVENT_DURATION_MIN * 60_000)

  const cliente = visit.nombre_completo || "Cliente"
  const propiedad = visit.propiedad_titulo || "Propiedad a confirmar"

  const descLines = [
    `Cliente: ${cliente}`,
    visit.telefono ? `Tel: ${visit.telefono}` : null,
    visit.email ? `Email: ${visit.email}` : null,
    visit.tipo_operacion ? `Operación: ${visit.tipo_operacion}` : null,
    visit.presupuesto ? `Presupuesto: ${visit.presupuesto}` : null,
    visit.calificacion_lead ? `Calificación: ${visit.calificacion_lead}` : null,
    visit.intereses_clave ? `Intereses: ${visit.intereses_clave}` : null,
    "",
    "— Agendado desde PRISMA",
  ].filter(Boolean)

  return {
    summary: `Visita: ${cliente} — ${propiedad}`,
    description: descLines.join("\n"),
    location: visit.zona_propiedad || undefined,
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    timeZone: DEFAULT_TIMEZONE,
  }
}

/**
 * Reconcilia el evento de Google con el estado actual de la visita.
 * Idempotente: crea, actualiza o borra según corresponda.
 * NUNCA lanza: cualquier error se devuelve como { status: "error" } para que
 * el llamador lo ignore (la fuente de verdad es Supabase, no Google).
 */
export async function reconcileVisit(visitId: string): Promise<SyncResult> {
  try {
    if (!isGoogleCalendarConfigured()) {
      return { status: "skipped", reason: "integración no configurada" }
    }

    const admin = createAdminClient()

    const { data: visit, error } = await admin
      .from("scheduled_visits")
      .select("*")
      .eq("id", visitId)
      .single()

    if (error || !visit) {
      return { status: "skipped", reason: "visita no encontrada" }
    }
    if (!visit.agent_id) {
      return { status: "skipped", reason: "visita sin asesor asignado" }
    }

    // ¿El asesor conectó su Google?
    const { data: tokenRow } = await admin
      .from("google_calendar_tokens")
      .select("refresh_token_enc")
      .eq("user_id", visit.agent_id)
      .single()

    if (!tokenRow?.refresh_token_enc) {
      return { status: "skipped", reason: "asesor sin Google conectado" }
    }

    const refreshToken = decryptToken(tokenRow.refresh_token_enc)
    const accessToken = await getAccessToken(refreshToken)

    const isCancelled = CANCEL_STATES.has((visit.estado_visita || "").toLowerCase())
    const existingEventId: string | null = visit.google_event_id || null

    // ── Caso CANCELADA: borrar el evento espejo ──
    if (isCancelled) {
      if (!existingEventId) return { status: "noop" }
      await deleteEvent(accessToken, existingEventId)
      await admin
        .from("scheduled_visits")
        .update({ google_event_id: null })
        .eq("id", visitId)
      return { status: "deleted" }
    }

    const payload = buildEvent(visit)

    // ── Caso EXISTE evento: actualizar (si desapareció en Google, recrear) ──
    if (existingEventId) {
      try {
        await updateEvent(accessToken, existingEventId, payload)
        return { status: "updated" }
      } catch (err: any) {
        const msg = String(err?.message || "")
        if (msg.includes("(404)") || msg.includes("(410)")) {
          const newId = await createEvent(accessToken, payload)
          await admin
            .from("scheduled_visits")
            .update({ google_event_id: newId })
            .eq("id", visitId)
          return { status: "created" }
        }
        throw err
      }
    }

    // ── Caso NUEVO: crear evento y guardar su id ──
    const eventId = await createEvent(accessToken, payload)
    await admin
      .from("scheduled_visits")
      .update({ google_event_id: eventId })
      .eq("id", visitId)
    return { status: "created" }
  } catch (err: any) {
    console.error("[google-calendar] reconcileVisit error:", err?.message || err)
    return { status: "error", reason: err?.message || "error desconocido" }
  }
}
