import type { SupabaseClient } from "@supabase/supabase-js"
import { PLANTILLAS, type Candidato } from "./tipos"
import { registrarEvento } from "./eventos"
import { nombreValido } from "./semilla"
import type { OpcionesEjecutor } from "./ejecutor"

/**
 * Task 16 — recordatorios de visita, deliberadamente casi determinísticos (24 h / 3 h / 1 h
 * antes, y el post no-show). Acá no hay LLM: es el flujo viejo portado al runner, con una
 * mejora: sin extracción de dirección por un modelo (usa `visit_address`; si falta, texto
 * genérico). En sombra registra lo que HABRÍA mandado; en activo manda por el dispatch.
 */

export type Recordatorio = "visita24" | "visita3" | "visita1" | "noShow"

const VENTANAS: Array<{ clave: Exclude<Recordatorio, "noShow">; hasta: number; desde: number }> = [
  { clave: "visita24", hasta: 25, desde: 4 }, // mismas ventanas que los If del flujo viejo
  { clave: "visita3", hasta: 4, desde: 1.5 },
  { clave: "visita1", hasta: 1.5, desde: 0 },
]

/** Un no-show se avisa hasta 48 h después de la visita; más viejo, ya no tiene sentido. */
export const NO_SHOW_MAX_HORAS = 48

function yaSalio(c: Candidato, plantilla: string): boolean {
  return (c.follow_ups_history ?? []).some((e) => e.type === plantilla)
}

export function queRecordatorioToca(c: Candidato, ahoraMs: number): Recordatorio | null {
  if (!c.visit_scheduled_at) return null
  const horas = (Date.parse(c.visit_scheduled_at) - ahoraMs) / 3600e3
  if (Number.isNaN(horas)) return null
  if (horas <= 0) {
    if (c.visit_status === "scheduled" && horas > -NO_SHOW_MAX_HORAS && !yaSalio(c, PLANTILLAS.noShow)) return "noShow"
    return null
  }
  for (const v of VENTANAS) {
    if (horas <= v.hasta && horas > v.desde && !yaSalio(c, PLANTILLAS[v.clave])) return v.clave
  }
  return null
}

/** Variables reales por plantilla (verificado 24/8): 24h/3h = [nombre, hora, dirección]; 1h = [nombre, hora]; no-show = [nombre]. */
export function variablesRecordatorio(cual: Recordatorio, nombre: string, hora: string, direccion: string): string[] {
  if (cual === "visita1") return [nombre, hora]
  if (cual === "noShow") return [nombre]
  return [nombre, hora, direccion]
}

export function horaVisitaAR(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires", hour12: false })
}

export interface ResumenVisitas {
  revisadas: number
  enviados: number
  simulados: number
  bloqueados: number
}

/** Corre con tarea="visitas" (cada 30 min). Sombra: registra. Activo: manda por el dispatch. */
export async function correrVisitas(
  db: SupabaseClient,
  opts: OpcionesEjecutor & { ahoraMs?: number }
): Promise<ResumenVisitas> {
  const fetchFn = opts.fetchFn ?? fetch
  const ahoraMs = opts.ahoraMs ?? Date.now()
  const resumen: ResumenVisitas = { revisadas: 0, enviados: 0, simulados: 0, bloqueados: 0 }

  const { data: configs } = await db.from("seguimiento_config").select("agency_id, modo")
  const modo = new Map<string, string>((configs ?? []).map((x) => [x.agency_id, x.modo]))
  const { data: conVisita } = await db
    .from("wa_conversations")
    .select("*")
    .eq("visit_status", "scheduled")
    .eq("opt_out", false)
    .not("visit_scheduled_at", "is", null)
    .in("agency_id", [...modo.entries()].filter(([, m]) => m !== "apagado").map(([a]) => a))

  for (const c of (conVisita ?? []) as Candidato[]) {
    const m = modo.get(c.agency_id)
    if (!m || m === "apagado") continue
    resumen.revisadas++
    const cual = queRecordatorioToca(c, ahoraMs)
    if (!cual) continue
    const plantilla = PLANTILLAS[cual]
    const direccion = c.visit_address?.trim() || "la propiedad acordada"

    // SOLO metricas.nombre (decisión 24/8). Sin nombre no se manda: se registra y sigue.
    if (!nombreValido(c)) {
      const { data: ya } = await db.from("lead_eventos").select("id").eq("conversation_id", c.id)
        .eq("tipo", "envio_bloqueado").contains("datos", { plantilla }).limit(1)
      if (!ya?.length)
        await registrarEvento(db, c.agency_id, c.id, "envio_bloqueado",
          `Recordatorio ${plantilla} sin enviar: el lead no tiene nombre registrado`, { plantilla })
      resumen.bloqueados++
      continue
    }
    const nombre = String(c.metricas.nombre).trim()
    const variables = variablesRecordatorio(cual, nombre, horaVisitaAR(c.visit_scheduled_at!), direccion)

    if (m !== "activo") {
      // sombra: una sola vez por plantilla y visita
      const { data: ya } = await db.from("lead_eventos").select("id").eq("conversation_id", c.id)
        .eq("tipo", "envio_simulado").contains("datos", { plantilla, visita: c.visit_scheduled_at }).limit(1)
      if (!ya?.length) {
        await registrarEvento(db, c.agency_id, c.id, "envio_simulado",
          `[${m}] tocaba el recordatorio ${plantilla} (${direccion}): «${variables.join(" | ")}»`,
          { plantilla, visita: c.visit_scheduled_at, variables })
        resumen.simulados++
      }
      continue
    }

    const headers: Record<string, string> = { "Content-Type": "application/json", "x-api-key": opts.dispatchSecret ?? "" }
    if (opts.bypassSecret) headers["x-vercel-protection-bypass"] = opts.bypassSecret
    let data: { success?: boolean; wamid?: string | null; skipped?: string; error?: string } = {}
    let ok = false
    try {
      const res = await fetchFn(`${opts.origen.replace(/\/+$/, "")}/api/whatsapp/dispatch`, {
        method: "POST",
        headers,
        body: JSON.stringify({ agency_id: c.agency_id, conversation_id: c.id, contact_phone: c.contact_phone, template_name: plantilla, variables }),
      })
      data = await res.json().catch(() => ({}))
      ok = res.ok && Boolean(data?.success) && Boolean(data?.wamid) // sin wamid NO es éxito (26/8)
    } catch (e) {
      data = { error: String(e).slice(0, 120) }
    }
    await registrarEvento(db, c.agency_id, c.id, ok ? "envio" : "envio_bloqueado",
      ok ? `Recordatorio de visita ${plantilla} (${direccion})` : `Recordatorio ${plantilla} no enviado: ${data.skipped ?? data.error ?? "sin id de mensaje"}`,
      { plantilla, visita: c.visit_scheduled_at, wamid: data.wamid ?? null, respuesta: data })
    if (ok) resumen.enviados++
    else resumen.bloqueados++
  }

  // Auto-realizada (portado del nodo viejo Auto_Realizada; función de la migración de fase 1)
  await db.rpc("seguimiento_marcar_visitas_realizadas")
  return resumen
}
