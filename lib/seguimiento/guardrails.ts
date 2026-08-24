import type { Candidato, ConfigAgencia, Decision } from "./tipos"

type Veredicto = { ok: true } | { ok: false; motivo: string }

/** Día calendario argentino de una fecha (el guardrail diario compara días AR, no UTC:
 *  de 21 a 24 AR el día UTC ya es el siguiente, justo dentro de la ventana de envío). */
const DIA_AR = (d: Date | string) =>
  new Date(d).toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" })

/** ¿Ya salió una plantilla de seguimiento hoy (día argentino)? */
function contactadoHoy(c: Candidato): boolean {
  const hoy = DIA_AR(new Date())
  return (c.follow_ups_history ?? []).some(
    (e) => typeof e.at === "string" && DIA_AR(e.at as string) === hoy
  )
}

/** La Capa 1 (SQL) ya filtró la mayoría. Esto es la doble verificación antes de ejecutar. */
export function puedeEjecutar(
  d: Decision,
  c: Candidato,
  config: ConfigAgencia,
  enviadosHoyAgencia: number
): Veredicto {
  if (d.accion !== "contactar") return { ok: true } // solo el envío tiene guardrails de envío
  if (d.confianza < 0.5) return { ok: false, motivo: "confianza_baja" }
  if (enviadosHoyAgencia >= config.max_mensajes_dia)
    return { ok: false, motivo: "presupuesto_diario_agotado" }
  if (contactadoHoy(c)) return { ok: false, motivo: "ya_contactado_hoy" }
  if (c.follow_ups_sent >= config.max_intentos) return { ok: false, motivo: "max_intentos" }
  if (c.opt_out) return { ok: false, motivo: "opt_out" }
  if (!c.bot_active) return { ok: false, motivo: "humano_al_mando" }
  return { ok: true }
}

/** Releer la conversación justo antes de despachar: si algo cambió, no se envía. */
export function sigueElegible(antes: Candidato, ahora: Candidato): boolean {
  if (ahora.last_message_at !== antes.last_message_at) return false // habló alguien
  if (!ahora.bot_active) return false
  if (ahora.opt_out) return false
  if (!ahora.requires_follow_up) return false
  if (ahora.visit_status === "scheduled" || ahora.visit_status === "confirmed") return false
  return true
}
