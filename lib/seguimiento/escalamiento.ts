import type { SupabaseClient } from "@supabase/supabase-js"
import { enviarAviso, linkAlChat, nombreCliente, unaLinea, type Aviso, type PerfilEquipo } from "./avisos"
import { bloqueContextoHtml, contextoDelLead, lineaContextoWhatsApp, type ContextoLead } from "./contexto"
import { registrarEvento } from "./eventos"
import type { Candidato } from "./tipos"

/**
 * Task 19 — escalamiento mínimo al director: un lead con humano a cargo (bot apagado) cuyo
 * ÚLTIMO mensaje es suyo y lleva más de `escalamiento_horas` sin respuesta. Nivel único →
 * director, por email + WhatsApp (`director_asesor_sin_respuesta`), con el contexto del lead.
 * Tope `max_escalamientos_dia` por agencia y nunca dos veces el mismo chat en 24 h. La
 * escalera completa multi-nivel es la fase 2 (§III.2.3); esto es la red de seguridad.
 * En sombra registra lo que habría avisado; en activo manda.
 */

type Conv = Pick<Candidato, "id" | "agency_id" | "contact_phone" | "metricas" | "agent_id" | "last_message_at">

function primerNombre(p: Pick<PerfilEquipo, "full_name">): string {
  return (p.full_name ?? "").trim().split(/\s+/)[0] || "Hola"
}
function esc(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] as string)
}

export function horasTexto(horas: number): string {
  const h = Math.round(horas)
  if (h < 48) return `${h} ${h === 1 ? "hora" : "horas"}`
  const d = Math.round(h / 24)
  return `${d} días`
}

/** Pura: el aviso al director, con contexto y la situación etiquetada. */
export function armarAvisoDirectorSinRespuesta(
  director: PerfilEquipo,
  c: Pick<Candidato, "id" | "contact_phone" | "metricas">,
  info: { asesorNombre: string | null; horas: number; contexto?: ContextoLead },
  appUrl: string,
  nombreAgencia: string
): Aviso {
  const cliente = nombreCliente(c)
  const tel = `+${c.contact_phone.replace(/\D/g, "")}`
  const link = linkAlChat(director, c.id, appUrl)
  const espera = horasTexto(info.horas)
  const situacion = info.asesorNombre
    ? `${info.asesorNombre} lleva ${espera} sin responderle a ${cliente} (${tel}), que quedó esperando a un humano`
    : `${cliente} (${tel}) lleva ${espera} esperando a un humano y no tiene asesor asignado`
  const html = [
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;color:#1a1a1a">`,
    `<p>Hola ${esc(primerNombre(director))},</p>`,
    `<p><strong>Qué pasa:</strong> ${esc(situacion)}.</p>`,
    ...bloqueContextoHtml(info.contexto),
    `<p>Decidilo en PRISMA: reasignarlo, tomarlo vos o darle más tiempo al asesor.</p>`,
    `<p><a href="${link}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Abrir el chat en PRISMA</a></p>`,
    `<p style="color:#888;font-size:13px">— Agente de seguimiento de PRISMA · ${esc(nombreAgencia)}</p>`,
    `</div>`,
  ].join("\n")
  return {
    destinatario: director,
    esAsignado: false,
    link,
    asunto: `${cliente} lleva ${espera} sin respuesta — ${nombreAgencia}`,
    html,
    plantilla: "director_asesor_sin_respuesta",
    // "Hola {{1}}, {{2}} pese a los avisos. Decidilo en PRISMA (...): {{3}} Gracias."
    variables: [primerNombre(director), unaLinea(`${situacion}.${lineaContextoWhatsApp(info.contexto)}`.replace(/\.$/, ""), 700), link],
  }
}

export interface ResumenEscalamiento {
  casos: number
  avisados: number
  simulados: number
  omitidos: number
}

export async function correrEscalamiento(
  db: SupabaseClient,
  opts: { appUrl?: string; fetchFn?: typeof fetch; ahoraMs?: number } = {}
): Promise<ResumenEscalamiento> {
  const appUrl = opts.appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://prisma.vakdor.com"
  const ahoraMs = opts.ahoraMs ?? Date.now()
  const resumen: ResumenEscalamiento = { casos: 0, avisados: 0, simulados: 0, omitidos: 0 }

  const { data: configs } = await db.from("seguimiento_config").select("agency_id, modo, escalamiento_horas, max_escalamientos_dia")
  const { data: agencias } = await db.from("agencies").select("id, name")
  const nombreAgencia = new Map<string, string>((agencias ?? []).map((a) => [a.id, a.name ?? "PRISMA"]))

  for (const config of configs ?? []) {
    if (config.modo === "apagado") continue
    const corte = new Date(ahoraMs - config.escalamiento_horas * 3600e3).toISOString()
    const { data: esperando } = await db
      .from("wa_conversations")
      .select("id, agency_id, contact_phone, metricas, agent_id, last_message_at")
      .eq("agency_id", config.agency_id)
      .eq("bot_active", false) // humano a cargo
      .eq("opt_out", false)
      .not("funnel_status", "in", "(closed_won,closed_lost)")
      .lt("last_message_at", corte)
      .gt("last_message_at", new Date(ahoraMs - 14 * 24 * 3600e3).toISOString()) // más viejo que 2 semanas ya no es "esperando"
      .order("last_message_at", { ascending: true })
      .limit(50)

    // tope diario + no repetir el mismo chat en 24 h
    const hoy = new Date(ahoraMs); hoy.setUTCHours(hoy.getUTCHours() - 3, 0, 0, 0) // ~inicio del día AR
    const { data: yaHoy } = await db.from("lead_eventos").select("conversation_id")
      .eq("agency_id", config.agency_id).in("tipo", ["escalamiento", "escalamiento_simulado"])
      .gte("ts", new Date(ahoraMs - 24 * 3600e3).toISOString())
    const avisados24h = new Set((yaHoy ?? []).map((e) => e.conversation_id))
    let cupo = Math.max(0, config.max_escalamientos_dia - avisados24h.size)

    const { data: directores } = await db.from("profiles").select("id, full_name, role, email, phone")
      .eq("agency_id", config.agency_id).eq("role", "director").eq("estado", "activo").is("deleted_at", null)
      .order("created_at", { ascending: true }).limit(1)
    const director = (directores?.[0] as PerfilEquipo | undefined) ?? null

    for (const c of (esperando ?? []) as Conv[]) {
      // el filtro "último mensaje es del LEAD" (role='lead', verificado 24/8)
      const { data: ultimo } = await db.from("wa_messages").select("role").eq("conversation_id", c.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle()
      if (ultimo?.role !== "lead") continue
      resumen.casos++
      if (avisados24h.has(c.id)) { resumen.omitidos++; continue }
      if (cupo <= 0) { resumen.omitidos++; continue }
      if (!director) {
        await registrarEvento(db, c.agency_id, c.id, "aviso_sin_destinatario", "Escalamiento sin director activo a quien avisar")
        resumen.omitidos++
        continue
      }
      const horas = (ahoraMs - Date.parse(c.last_message_at ?? "")) / 3600e3
      let asesorNombre: string | null = null
      if (c.agent_id) {
        const { data: p } = await db.from("profiles").select("full_name").eq("id", c.agent_id).maybeSingle()
        asesorNombre = p?.full_name ?? null
      }
      const contexto = await contextoDelLead(db, c)
      const aviso = armarAvisoDirectorSinRespuesta(director, c, { asesorNombre, horas, contexto }, appUrl, nombreAgencia.get(c.agency_id) ?? "PRISMA")
      cupo--
      avisados24h.add(c.id)
      if (config.modo !== "activo") {
        await registrarEvento(db, c.agency_id, c.id, "escalamiento_simulado",
          `[${config.modo}] se habría avisado al director ${director.full_name ?? ""}: ${aviso.variables[1]}`,
          { horas: Math.round(horas), asesor: asesorNombre, asunto: aviso.asunto })
        resumen.simulados++
        continue
      }
      const r = await enviarAviso(db, c, aviso, nombreAgencia.get(c.agency_id) ?? "PRISMA", { fetchFn: opts.fetchFn })
      await registrarEvento(db, c.agency_id, c.id, "escalamiento",
        `Aviso al director ${director.full_name ?? ""}: email ${r.email}, whatsapp ${r.whatsapp}`,
        { horas: Math.round(horas), asesor: asesorNombre })
      resumen.avisados++
    }
  }
  return resumen
}
