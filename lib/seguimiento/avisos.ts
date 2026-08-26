import type { SupabaseClient } from "@supabase/supabase-js"
import { registrarEvento } from "./eventos"
import { nombreValido } from "./semilla"
import type { Candidato, ConfigAgencia, DecisionAgente } from "./tipos"

/**
 * Avisos al equipo (Task 14 Step 1b, regla del 25/8): cuando el agente ESCALA, el aviso al
 * asesor sale en el mismo acto, así "estoy hablando con tu asesor para que te contacte" es
 * verdad en el momento en que se dice.
 *
 * Reglas de Leonardo (26/8):
 * - Al asesor ASIGNADO (`wa_conversations.agent_id`); sin asesor → al director.
 * - Email siempre; WhatsApp además solo si el perfil tiene celular (`profiles.phone`).
 * - El link va al chat concreto y se adapta al ROL del destinatario
 *   (`/director/leads-whatsapp/[id]` o `/asesor/leads-whatsapp/[id]`): la ruta del asesor
 *   exige que el chat sea suyo, y él entra como director con otra URL.
 * - El WhatsApp sale desde el número de la agencia con la plantilla UTILITY
 *   `asesor_cliente_esperando` ({{1}} nombre, {{2}} resumen, {{3}} link), y solo si Meta ya
 *   la aprobó en ESA agencia; si no, va el email solo y queda registrado por qué.
 * - En sombra no se manda nada: se registra a quién se HABRÍA avisado.
 */

export interface PerfilEquipo {
  id: string
  full_name: string | null
  role: string
  email: string | null
  phone: string | null
}

export interface Aviso {
  destinatario: PerfilEquipo
  esAsignado: boolean
  link: string
  asunto: string
  html: string
  plantilla: "asesor_cliente_esperando"
  variables: [string, string, string]
}

export type ResultadoCanal =
  | "enviado"
  | "omitido_sin_email"
  | "omitido_sin_celular"
  | "omitido_plantilla_no_aprobada"
  | "omitido_sin_resend"
  | `error_${string}`

const LARGO_MAX_RESUMEN = 220

/** Asignado activo primero; si no hay, el director (el primero activo). Nadie → null. */
export function elegirDestinatario(
  asignado: PerfilEquipo | null,
  directores: PerfilEquipo[]
): { perfil: PerfilEquipo; esAsignado: boolean } | null {
  if (asignado) return { perfil: asignado, esAsignado: true }
  const director = directores[0]
  return director ? { perfil: director, esAsignado: false } : null
}

/** El link al chat concreto, con la URL del rol de quien lo abre. */
export function linkAlChat(perfil: Pick<PerfilEquipo, "role">, conversationId: string, appUrl: string) {
  const base = appUrl.replace(/\/+$/, "")
  return `${base}/${perfil.role === "director" ? "director" : "asesor"}/leads-whatsapp/${conversationId}`
}

/** Solo el nombre de `metricas` (regla 24/8); nunca el del perfil de WhatsApp. */
export function nombreCliente(c: Pick<Candidato, "metricas">): string {
  return nombreValido(c as Candidato) ? String(c.metricas.nombre).trim() : "Un cliente"
}

/** Meta rechaza parámetros con saltos de línea, tabs o 4+ espacios seguidos. Una línea, corta. */
export function unaLinea(texto: string, max = LARGO_MAX_RESUMEN): string {
  const limpio = texto.replace(/\s+/g, " ").trim()
  return limpio.length <= max ? limpio : `${limpio.slice(0, max - 1).trimEnd()}…`
}

function primerNombre(perfil: PerfilEquipo): string {
  return (perfil.full_name ?? "").trim().split(/\s+/)[0] || "Hola"
}

function escaparHtml(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] as string)
}

/** Pura: arma email + WhatsApp del aviso de escalada. */
export function armarAvisoEscalar(
  perfil: PerfilEquipo,
  esAsignado: boolean,
  c: Pick<Candidato, "id" | "contact_phone" | "metricas">,
  d: Pick<DecisionAgente, "razon" | "evidencia" | "frase_cierre" | "plantilla">,
  appUrl: string,
  nombreAgencia: string
): Aviso {
  const cliente = nombreCliente(c)
  const link = linkAlChat(perfil, c.id, appUrl)
  const resumen = unaLinea(`${cliente} (+${c.contact_phone.replace(/\D/g, "")}): ${d.razon}`)
  const porQueVos = esAsignado
    ? "Este chat está asignado a vos."
    : "Este chat no tiene asesor asignado, por eso te llega a vos."
  const leDijimos = d.frase_cierre && d.plantilla === "seg_pendiente"
    ? `<p>Al cliente se le dijo que estamos hablando con el asesor responsable para que lo contacte a la brevedad: <em>“${escaparHtml(d.frase_cierre)}”</em></p>`
    : ""
  const html = [
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;color:#1a1a1a">`,
    `<p>Hola ${escaparHtml(primerNombre(perfil))},</p>`,
    `<p><strong>${escaparHtml(cliente)}</strong> (+${escaparHtml(c.contact_phone.replace(/\D/g, ""))}) está esperando tu respuesta.</p>`,
    `<p><strong>Qué pasa:</strong> ${escaparHtml(d.razon)}</p>`,
    `<p style="color:#555"><strong>El dato:</strong> ${escaparHtml(d.evidencia)}</p>`,
    leDijimos,
    `<p>${porQueVos}</p>`,
    `<p><a href="${link}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Abrir el chat en PRISMA</a></p>`,
    `<p style="color:#888;font-size:13px">— Agente de seguimiento de PRISMA · ${escaparHtml(nombreAgencia)}</p>`,
    `</div>`,
  ]
    .filter(Boolean)
    .join("\n")
  return {
    destinatario: perfil,
    esAsignado,
    link,
    asunto: `${cliente} está esperando tu respuesta — ${nombreAgencia}`,
    html,
    plantilla: "asesor_cliente_esperando",
    variables: [primerNombre(perfil), resumen, link],
  }
}

const COLUMNAS_PERFIL = "id, full_name, role, email, phone"

/** Lee el asesor asignado (activo) y los directores activos de la agencia. */
export async function resolverDestinatario(
  db: SupabaseClient,
  c: Pick<Candidato, "agency_id" | "agent_id">
): Promise<{ perfil: PerfilEquipo; esAsignado: boolean } | null> {
  let asignado: PerfilEquipo | null = null
  if (c.agent_id) {
    const { data } = await db
      .from("profiles")
      .select(COLUMNAS_PERFIL)
      .eq("id", c.agent_id)
      .eq("estado", "activo")
      .is("deleted_at", null)
      .maybeSingle()
    asignado = (data as PerfilEquipo | null) ?? null
  }
  const { data: directores } = await db
    .from("profiles")
    .select(COLUMNAS_PERFIL)
    .eq("agency_id", c.agency_id)
    .eq("role", "director")
    .eq("estado", "activo")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
  return elegirDestinatario(asignado, (directores ?? []) as PerfilEquipo[])
}

/** Ya se le avisó a alguien del equipo por esta conversación en las últimas `horas`. */
export async function yaAvisadoReciente(db: SupabaseClient, conversationId: string, horas = 24) {
  const { data } = await db
    .from("interacciones_canal")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("direccion", "salida")
    .in("destinatario", ["asesor", "director"])
    .gte("ts", new Date(Date.now() - horas * 3600e3).toISOString())
    .limit(1)
  return Boolean(data?.length)
}

type FetchFn = typeof fetch

/** Email por Resend, con el nombre de la agencia como remitente visible. */
async function enviarEmail(
  aviso: Aviso,
  nombreAgencia: string,
  fetchFn: FetchFn
): Promise<{ resultado: ResultadoCanal; resendId: string | null }> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM
  if (!apiKey || !from) return { resultado: "omitido_sin_resend", resendId: null }
  if (!aviso.destinatario.email) return { resultado: "omitido_sin_email", resendId: null }
  const direccion = from.match(/<([^>]+)>/)?.[1] ?? from
  const res = await fetchFn("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${nombreAgencia} vía PRISMA <${direccion}>`,
      to: [aviso.destinatario.email],
      subject: aviso.asunto,
      html: aviso.html,
    }),
  })
  if (!res.ok) return { resultado: `error_resend_${res.status}`, resendId: null }
  const data = await res.json().catch(() => ({}))
  return { resultado: "enviado", resendId: data?.id ?? null }
}

/** Plantilla por el canal de la agencia (Evolution o Meta directo), como hace /api/whatsapp/dispatch. */
async function enviarPlantillaEquipo(
  db: SupabaseClient,
  agencyId: string,
  aviso: Aviso,
  fetchFn: FetchFn
): Promise<{ resultado: ResultadoCanal; wamid: string | null; plantilla: string | null; respuesta?: unknown }> {
  const telefono = aviso.destinatario.phone?.replace(/\D/g, "")
  if (!telefono) return { resultado: "omitido_sin_celular", wamid: null, plantilla: null }

  const prefix = `ag${agencyId.replace(/-/g, "").substring(0, 6)}`
  const nombrePlantilla = `${prefix}_${aviso.plantilla}`
  const { data: tpl } = await db
    .from("wa_templates")
    .select("status")
    .eq("agency_id", agencyId)
    .eq("template_name", nombrePlantilla)
    .maybeSingle()
  if (tpl?.status !== "APPROVED")
    return { resultado: "omitido_plantilla_no_aprobada", wamid: null, plantilla: nombrePlantilla }

  const { data: inst } = await db
    .from("whatsapp_instances")
    .select("integration_type, evo_instance_name, phone_number_id, token")
    .eq("agency_id", agencyId)
    .maybeSingle()
  if (!inst) return { resultado: "error_sin_instancia", wamid: null, plantilla: nombrePlantilla }

  const parametros = aviso.variables.map((v) => ({ type: "text", text: v }))
  // Meta directo PRIMERO: es el camino de las campañas, el único con entrega verificada (26/8).
  // Evolution `sendTemplate` respondió 200 sin id y el mensaje nunca llegó (prueba de las 12:45).
  if (inst.phone_number_id && inst.token) {
    const res = await fetchFn(`https://graph.facebook.com/v20.0/${inst.phone_number_id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${inst.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: telefono,
        type: "template",
        template: {
          name: nombrePlantilla,
          language: { code: "es_AR" },
          components: [{ type: "body", parameters: parametros }],
        },
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok)
      return { resultado: `error_meta_${res.status}`, wamid: null, plantilla: nombrePlantilla, respuesta: data }
    const wamid = data?.messages?.[0]?.id ?? null
    return { resultado: "enviado", wamid, plantilla: nombrePlantilla, respuesta: wamid ? undefined : data }
  }
  if (inst.integration_type === "evolution" && inst.evo_instance_name) {
    const url = process.env.EVOLUTION_API_URL
    const key = process.env.EVOLUTION_API_KEY
    if (!url || !key) return { resultado: "error_evolution_sin_config", wamid: null, plantilla: nombrePlantilla }
    const res = await fetchFn(`${url}/message/sendTemplate/${inst.evo_instance_name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key },
      body: JSON.stringify({
        number: telefono,
        name: nombrePlantilla,
        language: "es_AR",
        variables: [{ type: "body", parameters: parametros }],
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { resultado: `error_evolution_${res.status}`, wamid: null, plantilla: nombrePlantilla }
    const wamid = data?.key?.id ?? data?.messageId ?? data?.messages?.[0]?.id ?? null
    return { resultado: "enviado", wamid, plantilla: nombrePlantilla, respuesta: wamid ? undefined : data }
  }
  return { resultado: "error_sin_canal", wamid: null, plantilla: nombrePlantilla }
}

/**
 * Manda el aviso por los dos canales y deja TODO registrado en `interacciones_canal`
 * (lo que salió y lo que no, con el motivo) y en `lead_eventos`.
 */
export async function enviarAviso(
  db: SupabaseClient,
  c: Pick<Candidato, "id" | "agency_id">,
  aviso: Aviso,
  nombreAgencia: string,
  opts: { decisionId?: string | null; prueba?: boolean; fetchFn?: FetchFn } = {}
): Promise<{ email: ResultadoCanal; whatsapp: ResultadoCanal }> {
  const fetchFn = opts.fetchFn ?? fetch
  const rol = aviso.destinatario.role === "director" ? "director" : "asesor"
  const metaBase = {
    perfil_id: aviso.destinatario.id,
    decision_id: opts.decisionId ?? null,
    es_asignado: aviso.esAsignado,
    prueba: Boolean(opts.prueba),
  }

  let email: ResultadoCanal
  let resendId: string | null = null
  try {
    ;({ resultado: email, resendId } = await enviarEmail(aviso, nombreAgencia, fetchFn))
  } catch (e) {
    email = `error_${String(e).slice(0, 80)}`
  }
  await db.from("interacciones_canal").insert({
    agency_id: c.agency_id,
    conversation_id: c.id,
    destinatario: rol,
    destinatario_ref: aviso.destinatario.email ?? aviso.destinatario.id,
    canal: "email",
    direccion: "salida",
    asunto: aviso.asunto,
    contenido: aviso.html,
    metadata: { ...metaBase, resultado: email, resend_id: resendId },
  })

  let wa: Awaited<ReturnType<typeof enviarPlantillaEquipo>>
  try {
    wa = await enviarPlantillaEquipo(db, c.agency_id, aviso, fetchFn)
  } catch (e) {
    wa = { resultado: `error_${String(e).slice(0, 80)}`, wamid: null, plantilla: null }
  }
  await db.from("interacciones_canal").insert({
    agency_id: c.agency_id,
    conversation_id: c.id,
    destinatario: rol,
    destinatario_ref: aviso.destinatario.phone ?? aviso.destinatario.id,
    canal: "whatsapp",
    direccion: "salida",
    asunto: aviso.plantilla,
    contenido: aviso.variables.join(" | "),
    wamid: wa.wamid,
    metadata: {
      ...metaBase,
      resultado: wa.resultado,
      plantilla: wa.plantilla,
      variables: aviso.variables,
      ...(wa.respuesta ? { respuesta_cruda: JSON.stringify(wa.respuesta).slice(0, 400) } : {}),
    },
  })

  await registrarEvento(
    db,
    c.agency_id,
    c.id,
    "aviso_equipo",
    `Aviso al ${rol} ${aviso.destinatario.full_name ?? aviso.destinatario.id}: email ${email}, whatsapp ${wa.resultado}`,
    { ...metaBase, email, whatsapp: wa.resultado, wamid: wa.wamid }
  )
  return { email, whatsapp: wa.resultado }
}

/**
 * Lo que llama el runner cuando la decisión es `escalar`. En sombra registra a quién se
 * habría avisado; en activo manda (una vez por conversación cada 24 h).
 */
export async function avisarPorEscalar(
  db: SupabaseClient,
  c: Candidato,
  d: DecisionAgente,
  config: Pick<ConfigAgencia, "modo">,
  decisionId: string | null,
  nombreAgencia: string,
  appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://prisma.vakdor.com",
  fetchFn: FetchFn = fetch
): Promise<string> {
  const destino = await resolverDestinatario(db, c)
  if (!destino) {
    await registrarEvento(db, c.agency_id, c.id, "aviso_sin_destinatario",
      "Escalada sin nadie a quien avisar: la agencia no tiene asesor asignado ni director activo")
    return "sin_destinatario"
  }
  const aviso = armarAvisoEscalar(destino.perfil, destino.esAsignado, c, d, appUrl, nombreAgencia)
  const quien = `${destino.perfil.role} ${destino.perfil.full_name ?? destino.perfil.id}${destino.esAsignado ? " (asignado)" : " (sin asesor asignado)"}`
  if (config.modo !== "activo") {
    await registrarEvento(db, c.agency_id, c.id, "aviso_simulado",
      `[${config.modo}] se habría avisado al ${quien}: email ${destino.perfil.email ? "sí" : "no tiene"}, whatsapp ${destino.perfil.phone ? "sí" : "sin celular"}`,
      { perfil_id: destino.perfil.id, es_asignado: destino.esAsignado, link: aviso.link, asunto: aviso.asunto })
    return "simulado"
  }
  if (await yaAvisadoReciente(db, c.id)) {
    await registrarEvento(db, c.agency_id, c.id, "aviso_omitido_reciente",
      `Ya se avisó por este chat en las últimas 24 h; no se repite`)
    return "omitido_reciente"
  }
  const r = await enviarAviso(db, c, aviso, nombreAgencia, { decisionId, fetchFn })
  return `email:${r.email} whatsapp:${r.whatsapp}`
}
