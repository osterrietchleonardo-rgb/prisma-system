import type { SupabaseClient } from "@supabase/supabase-js"
import { puedeEjecutar, sigueElegible } from "./guardrails"
import { registrarEvento } from "./eventos"
import { armarVariables } from "./plantillas"
import { nombreValido } from "./semilla"
import type { Candidato, ConfigAgencia, Decision } from "./tipos"

/**
 * Task 15 — el ejecutor: de la decisión al envío. Corre SOLO en modo `activo` (el runner no lo
 * llama en sombra). Antes de mandar, vuelve a pasar por los guardrails con datos frescos:
 * presupuesto diario de la agencia, releer la conversación (si alguien habló, no se manda),
 * nombre válido, y el `dispatch` existente hace el resto (ventana horaria 6-23 AR, texto real de
 * la plantilla, envío, `wa_messages`, `n8n_chat_histories`, `follow_ups_history`).
 * Todo resultado queda en `seguimiento_decisiones.resultado` y en `lead_eventos`.
 */

type FetchFn = typeof fetch

export interface OpcionesEjecutor {
  /** Origen del servidor que corre (p.ej. https://prisma.vakdor.com): el dispatch es un endpoint propio. */
  origen: string
  dispatchSecret?: string
  /** En un preview con SSO de Vercel, el bypass para que el self-call no rebote. */
  bypassSecret?: string
  fetchFn?: FetchFn
}

/** Inicio del día ARGENTINO en ISO (el presupuesto diario se cuenta por día AR, no UTC). */
export function inicioDelDiaAR(ahora: Date = new Date()): string {
  const dia = ahora.toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" })
  return new Date(`${dia}T00:00:00-03:00`).toISOString()
}

export async function ejecutarDecision(
  db: SupabaseClient,
  d: Decision,
  c: Candidato,
  config: ConfigAgencia,
  decisionId: string,
  opts: OpcionesEjecutor
): Promise<{ resultado: string; wamid: string | null }> {
  const fetchFn = opts.fetchFn ?? fetch
  const marcar = async (resultado: string, ejecutada = false, wamid: string | null = null) => {
    await db.from("seguimiento_decisiones").update({ resultado, ejecutada }).eq("id", decisionId)
    return { resultado, wamid }
  }

  if (!d.plantilla) return marcar("bloqueada_sin_plantilla")

  // Presupuesto diario de la agencia (enviados hoy = decisiones ejecutadas hoy, día AR)
  const { count } = await db
    .from("seguimiento_decisiones")
    .select("id", { count: "exact", head: true })
    .eq("agency_id", c.agency_id)
    .eq("ejecutada", true)
    .gte("creado_en", inicioDelDiaAR())

  const veredicto = puedeEjecutar(d, c, config, count ?? 0)
  if (!veredicto.ok) return marcar(`bloqueada_${veredicto.motivo}`)

  // Doble verificación: releer la conversación AHORA (guardrail anti-colisión)
  const { data: actual } = await db.from("wa_conversations").select("*").eq("id", c.id).single()
  if (!actual || !sigueElegible(c, actual as Candidato)) return marcar("bloqueada_conversacion_cambio")

  // SOLO metricas.nombre — jamás el de WhatsApp (decisión 24/8); sin nombre válido no hay plantilla
  if (!nombreValido(c)) return marcar("bloqueada_sin_nombre")
  const nombre = String(c.metricas.nombre).trim()
  const variables = armarVariables(d.plantilla, nombre, d.frase_cierre, c.follow_ups_sent)

  // Despachar por el camino existente (arreglado el 26/8: components + error real de Meta)
  const headers: Record<string, string> = { "Content-Type": "application/json", "x-api-key": opts.dispatchSecret ?? "" }
  if (opts.bypassSecret) headers["x-vercel-protection-bypass"] = opts.bypassSecret
  let res: Response
  try {
    res = await fetchFn(`${opts.origen.replace(/\/+$/, "")}/api/whatsapp/dispatch`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        agency_id: c.agency_id,
        conversation_id: c.id,
        contact_phone: c.contact_phone,
        template_name: d.plantilla,
        variables,
      }),
    })
  } catch (e) {
    await registrarEvento(db, c.agency_id, c.id, "error", `dispatch inalcanzable: ${String(e).slice(0, 120)}`)
    return marcar("error_dispatch_red")
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    await registrarEvento(db, c.agency_id, c.id, "envio_bloqueado", `El envío falló: ${String(data?.error ?? res.status).slice(0, 160)}`, { plantilla: d.plantilla })
    return marcar(`error_dispatch_${res.status}`)
  }
  if (data?.skipped) {
    await registrarEvento(db, c.agency_id, c.id, "envio_bloqueado", `No se envió: ${data.skipped}${data.ventana ? ` (${data.ventana})` : ""}`, { plantilla: d.plantilla })
    return marcar(`bloqueada_${data.skipped}`)
  }
  const wamid: string | null = data?.wamid ?? null
  if (!wamid) {
    // el dispatch arreglado ya devuelve 502 sin id; esto es el cinturón por si cambia
    await registrarEvento(db, c.agency_id, c.id, "envio_bloqueado", "El dispatch respondió OK pero sin id de mensaje: no se da por enviado", { plantilla: d.plantilla })
    return marcar("error_sin_wamid")
  }

  // Estado del lead (lo que antes hacían los nodos Actualizar_F*). El mensaje empático de una
  // escalada (seg_pendiente) NO cuenta como intento de seguimiento: es una disculpa.
  const horas = d.proximo_intento_horas ?? 72
  const cambios: Record<string, unknown> = {
    next_follow_up_at: new Date(Date.now() + horas * 3600e3).toISOString(),
  }
  if (d.accion === "contactar") {
    cambios.follow_ups_sent = c.follow_ups_sent + 1
    cambios.recovery_stage = "follow_up"
  }
  await db.from("wa_conversations").update(cambios).eq("id", c.id)

  await registrarEvento(db, c.agency_id, c.id, "envio",
    `Enviada ${d.plantilla}: "${d.frase_cierre ?? ""}" — ${d.razon}`, { wamid, plantilla: d.plantilla, accion: d.accion })
  return marcar("enviada", true, wamid)
}

/** Posponer y abandonar no mandan nada: solo mueven el estado del lead (reversible). */
export async function aplicarSinEnvio(db: SupabaseClient, d: Decision, c: Candidato, decisionId: string): Promise<string> {
  if (d.accion === "posponer") {
    const horas = d.proximo_intento_horas ?? 72
    await db.from("wa_conversations")
      .update({ next_follow_up_at: new Date(Date.now() + horas * 3600e3).toISOString() })
      .eq("id", c.id)
    await db.from("seguimiento_decisiones").update({ resultado: "pospuesta", ejecutada: true }).eq("id", decisionId)
    return "pospuesta"
  }
  if (d.accion === "abandonar") {
    // NUNCA closed_lost automático: solo apaga el seguimiento, reversible desde la ficha
    await db.from("wa_conversations")
      .update({ requires_follow_up: false, next_follow_up_at: null, dropoff_reason: "agente_abandono" })
      .eq("id", c.id)
    await db.from("seguimiento_decisiones").update({ resultado: "abandonada", ejecutada: true }).eq("id", decisionId)
    await registrarEvento(db, c.agency_id, c.id, "cambio_estado", `El agente dejó de seguir a este lead: ${d.razon}`)
    return "abandonada"
  }
  return "sin_cambios"
}
