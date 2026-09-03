import type { SupabaseClient } from "@supabase/supabase-js"
import { dentroDeVentanaEnvio, horasHabiles } from "@/lib/whatsapp/sending-window"
import { enviarAviso, linkAlChat, nombreCliente, unaLinea, type Aviso, type PerfilEquipo } from "./avisos"
import { bloqueContextoHtml, contextoDelLead, lineaContextoWhatsApp, type ContextoLead } from "./contexto"
import { registrarEvento } from "./eventos"
import type { Candidato } from "./tipos"

/**
 * La escalera del lead que espera a un humano (regla de Leonardo, 27/8).
 *
 * QUIÉN está esperando: un lead al que el bot derivó a un asesor (`metricas.fue_derivado_a_humano`,
 * `etapa = handoff`, `solicito_hablar_con_humano`) o cuyo chat tiene el bot apagado (un humano
 * tomó el mando), y que desde su último mensaje NO recibió ningún mensaje de un asesor. Cubre los
 * dos casos: bot apagado con la promesa de que lo atienden, y bot activo diciendo "el asesor se va
 * a comunicar para coordinar la visita". "Atendido" lo mide el dato (un mensaje humano en el
 * chat después del último del lead), nunca la promesa del asesor por WhatsApp.
 *
 * LOS NIVELES, contados desde el último mensaje del lead EN HORAS HÁBILES (6-23 AR; Kevin,
 * 2/9: "si está durmiendo no es que no quiera contestar" — la noche no corre en contra del
 * asesor: un lead de las 3 am recién "empieza a esperar" a las 6):
 *   2 h  → asesor asignado (sin asesor: director)
 *   5 h  → asesor + director
 *   10 h → asesor ("sigue esperando")
 *   20 h → asesor + director, para que decida (reasignar, tomarlo, dar tiempo)
 * Además, NINGÚN aviso sale fuera de 6-23 AR: fuera de ventana la corrida entera se saltea
 * y el caso madura en la primera corrida de la mañana.
 * Cada nivel una sola vez por caso; si el lead vuelve a escribir después de ser atendido, es un
 * caso nuevo. Sin tope por agencia: si 30 asesores no contestan, se avisa a los 30. El WhatsApp
 * sale con la plantilla nueva si Meta la aprobó; si no, va el email igual. Nunca se saltea.
 */

export type Nivel = 2 | 5 | 10 | 20
export const NIVELES: Array<{ horas: Nivel; director: boolean; plantillaAsesor: "asesor_cliente_esperando" | "asesor_sigue_esperando" }> = [
  { horas: 2, director: false, plantillaAsesor: "asesor_cliente_esperando" },
  { horas: 5, director: true, plantillaAsesor: "asesor_cliente_esperando" },
  { horas: 10, director: false, plantillaAsesor: "asesor_sigue_esperando" },
  { horas: 20, director: true, plantillaAsesor: "asesor_sigue_esperando" },
]
/** Más viejo que esto ya no es "esperando": es un lead perdido que la ficha tiene que resolver. */
export const DIAS_MAXIMOS_ESPERA = 14

/**
 * "El reloj arranca el día que se enciende" (Leonardo, 27/8): un caso cuenta solo si el último
 * mensaje del lead es posterior al encendido de la agencia. Sin fecha de encendido, cuenta todo.
 */
export function casoCuenta(t0ISO: string, activoDesdeISO: string | null | undefined): boolean {
  if (!activoDesdeISO) return true
  return Date.parse(t0ISO) >= Date.parse(activoDesdeISO)
}

type Conv = Pick<Candidato, "id" | "agency_id" | "contact_phone" | "metricas" | "agent_id" | "bot_active" | "last_message_at">

/** ¿Este lead está en manos de un humano (o esperándolo)? */
export function esperandoHumano(c: Pick<Candidato, "bot_active" | "metricas">): boolean {
  const m = (c.metricas ?? {}) as Record<string, unknown>
  return (
    c.bot_active === false ||
    String(m.fue_derivado_a_humano) === "true" ||
    String(m.solicito_hablar_con_humano) === "true" ||
    String(m.etapa) === "handoff"
  )
}

/**
 * Qué nivel toca ahora. Si el reloj se perdió varios (p.ej. arrancó con 6 h de espera), manda
 * SOLO el más alto alcanzado y da los menores por saltados: nadie quiere 3 avisos seguidos.
 */
export function nivelQueToca(horasEsperando: number, enviados: Nivel[]): Nivel | null {
  const alcanzados = NIVELES.filter((n) => horasEsperando >= n.horas).map((n) => n.horas)
  if (!alcanzados.length) return null
  const max = alcanzados[alcanzados.length - 1]
  if (enviados.includes(max)) return null
  // si ya se mandó uno más alto (no debería pasar), no se vuelve atrás
  if (enviados.some((e) => e > max)) return null
  return max
}

export function horasTexto(horas: number): string {
  const h = Math.round(horas)
  if (h < 48) return `${h} ${h === 1 ? "hora" : "horas"}`
  const d = Math.round(h / 24)
  return `${d} días`
}

function primerNombre(p: Pick<PerfilEquipo, "full_name">): string {
  return (p.full_name ?? "").trim().split(/\s+/)[0] || "Hola"
}
function esc(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] as string)
}
function marco(cuerpo: string[], link: string, textoBoton: string, nombreAgencia: string): string {
  return [
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;color:#1a1a1a">`,
    ...cuerpo,
    `<p><a href="${link}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">${esc(textoBoton)}</a></p>`,
    `<p style="color:#888;font-size:13px">— Agente de seguimiento de PRISMA · ${esc(nombreAgencia)}</p>`,
    `</div>`,
  ].join("\n")
}

type Lead = Pick<Candidato, "id" | "contact_phone" | "metricas">

/** Aviso al ASESOR en un nivel de la escalera (2 h, 5 h, 10 h o 20 h). */
export function armarAvisoAsesorEscalera(
  perfil: PerfilEquipo,
  c: Lead,
  info: { nivel: Nivel; horas: number; esAsignado: boolean; contexto?: ContextoLead },
  appUrl: string,
  nombreAgencia: string
): Aviso {
  const cliente = nombreCliente(c)
  const tel = `+${c.contact_phone.replace(/\D/g, "")}`
  const link = linkAlChat(perfil, c.id, appUrl)
  const espera = horasTexto(info.horas)
  const nivel = NIVELES.find((n) => n.horas === info.nivel)!
  const porQueVos = info.esAsignado ? "Este chat está asignado a vos." : "Este chat no tiene asesor asignado, por eso te llega a vos."
  const avisoDirector = nivel.director ? " El director también recibe este aviso." : ""
  const html = marco(
    [
      `<p>Hola ${esc(primerNombre(perfil))},</p>`,
      `<p><strong>Qué pasa:</strong> ${esc(cliente)} (${esc(tel)}) quedó esperando que lo atienda un asesor y lleva <strong>${esc(espera)}</strong> sin respuesta.${esc(avisoDirector)}</p>`,
      ...bloqueContextoHtml(info.contexto),
      `<p>${porQueVos} Si no lo podés tomar, marcá «No lo puedo tomar» en el chat y el director lo reasigna.</p>`,
    ],
    link, "Abrir el chat en PRISMA", nombreAgencia
  )
  const base = { destinatario: perfil, esAsignado: info.esAsignado, link, html }
  if (nivel.plantillaAsesor === "asesor_sigue_esperando") {
    // "Hola {{1}}, {{2}} sigue esperando desde hace {{3}}. Si no lo podés tomar, avisá por acá y lo reasignamos: {{4}} ¡Gracias!"
    return {
      ...base,
      asunto: `${cliente} sigue esperando hace ${espera} — ${nombreAgencia}`,
      plantilla: "asesor_sigue_esperando",
      variables: [primerNombre(perfil), unaLinea(`${cliente} (${tel})${info.contexto?.busca ? `, que busca ${info.contexto.busca}` : ""}`, 300), espera, link],
    }
  }
  // "Hola {{1}}, tenés un cliente esperando tu respuesta en PRISMA: {{2}}. Entrá y respondele desde acá: {{3}} ¡Gracias!"
  return {
    ...base,
    asunto: `${cliente} está esperando hace ${espera} — ${nombreAgencia}`,
    plantilla: "asesor_cliente_esperando",
    variables: [primerNombre(perfil), unaLinea(`${cliente} (${tel}) lleva ${espera} esperando que lo atiendas.${lineaContextoWhatsApp(info.contexto)}${avisoDirector}`, 700), link],
  }
}

/** Aviso al DIRECTOR (5 h y 20 h): la situación, el contexto y qué puede decidir. */
export function armarAvisoDirectorSinRespuesta(
  director: PerfilEquipo,
  c: Lead,
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
  const html = marco(
    [
      `<p>Hola ${esc(primerNombre(director))},</p>`,
      `<p><strong>Qué pasa:</strong> ${esc(situacion)}.</p>`,
      ...bloqueContextoHtml(info.contexto),
      `<p>Decidilo en PRISMA: reasignarlo, tomarlo vos o darle más tiempo al asesor.</p>`,
    ],
    link, "Abrir el chat en PRISMA", nombreAgencia
  )
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
  esperando: number
  atendidos: number
  avisos: number
  simulados: number
  /** true si la corrida no evaluó nada por estar fuera de la ventana 6-23 AR. */
  fueraDeVentana?: boolean
}

const MAX_POR_CORRIDA = 300

export async function correrEscalamiento(
  db: SupabaseClient,
  opts: { appUrl?: string; fetchFn?: typeof fetch; ahoraMs?: number } = {}
): Promise<ResumenEscalamiento> {
  const appUrl = opts.appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://prisma.vakdor.com"
  const ahoraMs = opts.ahoraMs ?? Date.now()
  const resumen: ResumenEscalamiento = { esperando: 0, atendidos: 0, avisos: 0, simulados: 0 }

  // Nada de avisos de madrugada (Kevin, 2/9): fuera de 6-23 AR la corrida entera se saltea.
  // No se pierde nada: el reloj cada 30 min vuelve a pasar, y los niveles se miden en horas
  // hábiles, así que ningún caso "madura" durante la noche.
  if (!dentroDeVentanaEnvio(new Date(ahoraMs))) return { ...resumen, fueraDeVentana: true }

  const { data: configs } = await db.from("seguimiento_config").select("agency_id, modo, activo_desde")
  const { data: agencias } = await db.from("agencies").select("id, name")
  const nombreAgencia = new Map<string, string>((agencias ?? []).map((a) => [a.id, a.name ?? "PRISMA"]))

  for (const config of configs ?? []) {
    if (config.modo === "apagado") continue
    const desde = new Date(ahoraMs - DIAS_MAXIMOS_ESPERA * 24 * 3600e3).toISOString()
    const { data: candidatos } = await db
      .from("wa_conversations")
      .select("id, agency_id, contact_phone, metricas, agent_id, bot_active, last_message_at")
      .eq("agency_id", config.agency_id)
      .eq("opt_out", false)
      .not("funnel_status", "in", "(closed_won,closed_lost)")
      .gt("last_message_at", desde)
      .lt("last_message_at", new Date(ahoraMs - 2 * 3600e3).toISOString()) // nada pasa antes de las 2 h
      .order("last_message_at", { ascending: true })
      .limit(MAX_POR_CORRIDA)

    const { data: directores } = await db.from("profiles").select("id, full_name, role, email, phone")
      .eq("agency_id", config.agency_id).eq("role", "director").eq("estado", "activo").is("deleted_at", null)
      .order("created_at", { ascending: true }).limit(1)
    const director = (directores?.[0] as PerfilEquipo | undefined) ?? null
    const perfiles = new Map<string, PerfilEquipo | null>()
    const perfil = async (id: string) => {
      if (!perfiles.has(id)) {
        const { data } = await db.from("profiles").select("id, full_name, role, email, phone").eq("id", id).eq("estado", "activo").is("deleted_at", null).maybeSingle()
        perfiles.set(id, (data as PerfilEquipo | null) ?? null)
      }
      return perfiles.get(id) ?? null
    }

    for (const c of (candidatos ?? []) as Conv[]) {
      if (!esperandoHumano(c)) continue
      // t0 = último mensaje del lead; atendido = algún mensaje HUMANO después de t0
      const { data: ultimoLead } = await db.from("wa_messages").select("created_at").eq("conversation_id", c.id)
        .eq("role", "lead").order("created_at", { ascending: false }).limit(1).maybeSingle()
      if (!ultimoLead?.created_at || Date.parse(ultimoLead.created_at) < Date.parse(desde)) continue
      const t0 = ultimoLead.created_at
      if (!casoCuenta(t0, config.activo_desde)) continue // anterior al encendido: backlog, no se persigue
      const { data: humano } = await db.from("wa_messages").select("id").eq("conversation_id", c.id)
        .eq("role", "human").gt("created_at", t0).limit(1)
      if (humano?.length) { resumen.atendidos++; continue }
      // Horas HÁBILES (6-23 AR): la noche no cuenta. El prefiltro de arriba usa horas de
      // reloj y solo puede sobre-incluir (hábiles ≤ reloj), nunca dejar afuera un caso maduro.
      const horas = horasHabiles(Date.parse(t0), ahoraMs)
      if (horas < 2) continue
      resumen.esperando++

      // niveles ya mandados PARA ESTE CASO (mismo t0)
      const { data: previos } = await db.from("lead_eventos").select("datos").eq("conversation_id", c.id)
        .in("tipo", ["escalera", "escalera_simulada"]).contains("datos", { t0 })
      const enviados = (previos ?? []).map((e) => Number((e.datos as { nivel?: number })?.nivel)).filter((n) => [2, 5, 10, 20].includes(n)) as Nivel[]
      const nivel = nivelQueToca(horas, enviados)
      if (!nivel) continue
      const def = NIVELES.find((n) => n.horas === nivel)!

      const asesor = c.agent_id ? await perfil(c.agent_id) : null
      const contexto = await contextoDelLead(db, c)
      const agencia = nombreAgencia.get(c.agency_id) ?? "PRISMA"
      const destinos: Array<{ quien: "asesor" | "director"; aviso: Aviso }> = []
      if (asesor) destinos.push({ quien: "asesor", aviso: armarAvisoAsesorEscalera(asesor, c, { nivel, horas, esAsignado: true, contexto }, appUrl, agencia) })
      else if (director) destinos.push({ quien: "director", aviso: armarAvisoAsesorEscalera(director, c, { nivel, horas, esAsignado: false, contexto }, appUrl, agencia) })
      if (def.director && director && asesor) destinos.push({ quien: "director", aviso: armarAvisoDirectorSinRespuesta(director, c, { asesorNombre: asesor.full_name, horas, contexto }, appUrl, agencia) })
      if (!destinos.length) {
        await registrarEvento(db, c.agency_id, c.id, "aviso_sin_destinatario", `Escalera nivel ${nivel} h: no hay asesor ni director activo a quien avisar`, { nivel, t0 })
        continue
      }

      if (config.modo !== "activo") {
        await registrarEvento(db, c.agency_id, c.id, "escalera_simulada",
          `[${config.modo}] nivel ${nivel} h: se habría avisado a ${destinos.map((d) => `${d.quien} ${d.aviso.destinatario.full_name ?? ""}`).join(" y ")} · ${destinos[0].aviso.variables[1]}`,
          { nivel, t0, horas: Math.round(horas), destinos: destinos.map((d) => d.quien) })
        resumen.simulados++
        continue
      }
      const resultados: string[] = []
      for (const d of destinos) {
        const r = await enviarAviso(db, c, d.aviso, agencia, { fetchFn: opts.fetchFn })
        resultados.push(`${d.quien}: email ${r.email}, whatsapp ${r.whatsapp}`)
      }
      await registrarEvento(db, c.agency_id, c.id, "escalera",
        `Nivel ${nivel} h (${horasTexto(horas)} esperando) → ${resultados.join(" · ")}`,
        { nivel, t0, horas: Math.round(horas), destinos: destinos.map((d) => d.quien) })
      resumen.avisos++
    }
  }
  return resumen
}
