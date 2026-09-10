import type { SupabaseClient } from "@supabase/supabase-js"
import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import { MODELO } from "@/lib/admin-vakdor/marketing/claude"
import { BOT_GENERICO, enviarAviso, linkAlChat, nombreCliente, unaLinea, type Aviso, type PerfilEquipo } from "./avisos"
import { registrarEvento } from "./eventos"
import { crearHerramientas } from "./herramientas"
import type { Candidato } from "./tipos"

/** El sistema escribe este marcador con role='internal' al apagarse el bot: NO es una nota del asesor. */
export const MARCADOR_HANDOFF = "⚠️ Handoff activado"

export interface NotaInterna {
  id: string
  content: string
  created_at: string
}

/** La última nota interna REAL del asesor posterior a t0 (excluye el marcador automático). */
export async function notaPosterior(
  db: SupabaseClient,
  conversationId: string,
  t0ISO: string
): Promise<NotaInterna | null> {
  const { data, error } = await db
    .from("wa_messages")
    .select("id, content, created_at")
    .eq("conversation_id", conversationId)
    .eq("role", "internal")
    .not("content", "like", `${MARCADOR_HANDOFF}%`)
    .gt("created_at", t0ISO)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  // Si esta query falla, la feature entera deja de existir sin que nadie se entere:
  // "sin nota" y "no pude leer la nota" son cosas distintas y tienen que quedar a la vista.
  if (error) console.error("[seguimiento] notaPosterior:", error.message)
  return (data as NotaInterna | null) ?? null
}

/** Los formatos reales mezclan "+54 11...", "+549..." y "549...": comparamos los últimos 8 dígitos. */
export function coincideTelefono(a: string, b: string): boolean {
  const da = a.replace(/\D/g, "").slice(-8)
  const db_ = b.replace(/\D/g, "").slice(-8)
  return da.length === 8 && da === db_
}

export interface ActividadTracking {
  type: string
  fecha_actividad: string | null
  propiedad_ref: string | null
}

const DIAS_TRACKING = 14

/**
 * Lo que el veredicto necesita saber del registro en PRISMA:
 * - visita registrada = `visit_scheduled_at` en la conversación O una fila futura en
 *   `scheduled_visits` de la agencia cuyo teléfono coincida (últimos 8 dígitos).
 * - actividades del tracking = `performance_logs` del contacto (vía wa_contacts por
 *   teléfono exacto), últimos 14 días. Sin contacto que matchee: lista vacía.
 */
export async function contextoRegistro(
  db: SupabaseClient,
  c: { agency_id: string; contact_phone: string; visit_scheduled_at: string | null },
  ahoraMs: number
): Promise<{ visitaRegistrada: boolean; actividades: ActividadTracking[] }> {
  // El día es el ARGENTINO, no el UTC: a las 21 de acá en UTC ya es mañana, y con el corte
  // en UTC las visitas de hoy quedaban afuera (el asesor recibía un pedido de registrar
  // algo que ya estaba registrado).
  const hoy = new Date(ahoraMs)
    .toLocaleString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" })
    .slice(0, 10)
  const { data: visitas } = await db
    .from("scheduled_visits")
    .select("telefono, fecha_visita")
    .eq("agency_id", c.agency_id)
    .gte("fecha_visita", hoy)
    .order("fecha_visita", { ascending: true })
    .limit(50)
  const enCalendario = (visitas ?? []).some((v: { telefono: string | null }) =>
    coincideTelefono(String(v.telefono ?? ""), c.contact_phone))
  const visitaRegistrada = Boolean(c.visit_scheduled_at) || enCalendario

  let actividades: ActividadTracking[] = []
  const { data: contacto } = await db
    .from("wa_contacts").select("id")
    .eq("agency_id", c.agency_id).eq("phone", c.contact_phone).maybeSingle()
  if (contacto?.id) {
    const desde = new Date(ahoraMs - DIAS_TRACKING * 24 * 3600e3).toISOString()
    const { data: acts } = await db
      .from("performance_logs")
      .select("type, fecha_actividad, propiedad_ref")
      .eq("wa_contact_id", contacto.id)
      .gte("created_at", desde)
      .limit(20)
    actividades = (acts ?? []) as ActividadTracking[]
  }
  return { visitaRegistrada, actividades }
}

export const VeredictoNotaSchema = z.object({
  atendido: z.boolean(),
  pedir_registro_chat: z.boolean(),
  pedir_registro_visita: z.boolean(),
  pedir_registro_actividad: z.boolean(),
  razon: z.string().min(1),
})
export type VeredictoNota = z.infer<typeof VeredictoNotaSchema>
export type LlamarVeredicto = (semilla: string) => Promise<VeredictoNota>

/**
 * Decisión de Leonardo (4/9): la nota NO se interpreta con reglas — la lee la IA.
 * Ajuste del 10/9 (queja de Carmen): con el prompt anterior la IA rechazaba las notas cortas
 * («Ya hablé», «Respondido», «Estoy yo en contacto») por "ambiguas" y usaba la falta de visita en
 * el calendario para no dar por atendido: 6 de 7 rechazos en 10 días eran una asesora diciendo
 * que ya lo tenía, y la escalera seguía hasta el director. La nota vive DENTRO del chat de ese
 * cliente: "ya hablé" es con él. Atender y registrar son dos cosas distintas.
 */
const PROMPT_NOTA = `Sos el intérprete de notas internas del agente de seguimiento de una inmobiliaria argentina. El sistema escala avisos cuando un cliente queda esperando a un asesor; una nota interna del asesor puede indicar que en realidad ya lo está atendiendo por otro canal. Leé la nota y la conversación y emití un veredicto honesto:
- atendido: true si la nota dice que el asesor ya está en contacto con ESTE cliente o ya se ocupó de lo que esperaba: lo llamó, hablaron, le respondió, coordinó una visita, le está resolviendo algo, o pide explícitamente que no se le dé seguimiento. La nota está escrita DENTRO del chat de este cliente: una nota corta como «ya hablé», «respondido», «estoy en contacto», «ya se habló» o «lo llamé» se refiere a él aunque no lo nombre, y CUENTA como atención. No exijas que diga con quién, cuándo, por dónde ni qué acordaron: eso se pide aparte como registro.
- atendido: false SOLO si la nota no habla de contacto con el cliente: un recordatorio, un detalle de la propiedad («ojo que pregunta por cochera»), un comentario («es una gran oferta», «buen perfil»), una pregunta al equipo, o un texto redactado como mensaje para el cliente que quedó en la nota y el cliente nunca recibió.
- Que no haya visita en el calendario ni actividades en el tracking NUNCA baja atendido: eso solo enciende los pedidos de registro.
- pedir_registro_chat: true si la gestión ocurrió fuera de PRISMA (teléfono, presencial, otro WhatsApp) o la nota no dice por dónde, y después de la nota no hay un mensaje del equipo al cliente en el chat que confirme lo acordado.
- pedir_registro_visita: true SOLO si la nota o la conversación mencionan una visita coordinada Y el dato dice que NO está registrada en el calendario.
- pedir_registro_actividad: true SOLO si la gestión que cuenta la nota no aparece reflejada en las actividades del tracking (mirá tipo, fecha y propiedad de cada actividad contra lo que la nota cuenta y la propiedad consultada).
- razon: una o dos frases en castellano citando la nota; la puede leer el asesor.
La escalera existe para que ningún cliente quede sin atender, pero la palabra del asesor vale: si dice que ya lo tiene, se le cree y se le pide el registro. Rechazar esa nota manda más avisos, con copia al director, a alguien que ya está atendiendo.`

const HERRAMIENTA_VEREDICTO = {
  name: "emitir_veredicto",
  description: "Emití tu veredicto sobre la nota interna.",
  input_schema: {
    type: "object",
    properties: {
      atendido: { type: "boolean" },
      pedir_registro_chat: { type: "boolean" },
      pedir_registro_visita: { type: "boolean" },
      pedir_registro_actividad: { type: "boolean" },
      razon: { type: "string" },
    },
    required: ["atendido", "pedir_registro_chat", "pedir_registro_visita", "pedir_registro_actividad", "razon"],
    additionalProperties: false,
  },
} as const

export function semillaVeredicto(input: {
  nota: NotaInterna
  mensajes: string
  visitaRegistrada: boolean
  actividades: ActividadTracking[]
  propiedadInteres: string | null
  ahoraISO: string
}): string {
  const acts = input.actividades.length
    ? input.actividades.map((a) => `  - ${a.type} · ${a.fecha_actividad ?? "sin fecha"} · ${a.propiedad_ref ?? "sin propiedad"}`).join("\n")
    : "  (ninguna)"
  return [
    `Fecha y hora actual (Argentina): ${input.ahoraISO}`,
    `NOTA INTERNA del asesor (el cliente NO la ve): «${input.nota.content}»`,
    `Propiedad de interés del cliente según sus datos: ${input.propiedadInteres ?? "(sin dato)"}`,
    `Visita registrada en el calendario de PRISMA: ${input.visitaRegistrada ? "SÍ" : "NO"}`,
    `Actividades del asesor en el tracking para este cliente (últimos 14 días):\n${acts}`,
    `Conversación real ([internal] son notas del equipo; el cliente no las ve):\n${input.mensajes}`,
    `Emití tu veredicto con emitir_veredicto.`,
  ].join("\n\n")
}

/**
 * Un solo cliente para toda la corrida (perezoso: se arma la primera vez que hace falta).
 * `timeout` es lo que impide que una llamada colgada frene la barrida entera, y un solo
 * reintento alcanza: si la IA no contesta, la escalera sigue como siempre.
 */
let clienteAnthropic: Anthropic | null = null
function anthropic(): Anthropic {
  if (!clienteAnthropic) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY")
    clienteAnthropic = new Anthropic({ apiKey, timeout: 20_000, maxRetries: 1 })
  }
  return clienteAnthropic
}

/** Una sola llamada, tool forzado, sin thinking (incompatible con tool_choice forzado). */
export function crearLlamadaVeredicto(): LlamarVeredicto {
  return async (semilla) => {
    const res = await anthropic().messages.create({
      model: MODELO,
      max_tokens: 1000,
      system: PROMPT_NOTA,
      tools: [HERRAMIENTA_VEREDICTO] as unknown as Anthropic.Messages.ToolUnion[],
      tool_choice: { type: "tool", name: "emitir_veredicto" },
      messages: [{ role: "user", content: semilla }],
    })
    const uso = res.content.find((b) => b.type === "tool_use")
    if (!uso || uso.type !== "tool_use") throw new Error("la IA no emitió veredicto")
    return VeredictoNotaSchema.parse(uso.input)
  }
}

function primerNombre(p: Pick<PerfilEquipo, "full_name">): string {
  return (p.full_name ?? "").trim().split(/\s+/)[0] || "Hola"
}
function esc(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] as string)
}

/**
 * UN solo aviso por nota (regla de Leonardo, 4/9): reconoce la gestión, avisa que la
 * escalera se frenó, y pide SOLO los registros que faltan. Tono de ayuda, jamás un reto.
 */
export function armarAvisoRegistro(
  perfil: PerfilEquipo,
  c: { id: string; contact_phone: string; metricas: Record<string, unknown> },
  nota: NotaInterna,
  v: VeredictoNota,
  appUrl: string,
  nombreAgencia: string,
  nombreBot: string = BOT_GENERICO
): Aviso {
  const cliente = nombreCliente(c)
  const tel = `+${c.contact_phone.replace(/\D/g, "")}`
  const link = linkAlChat(perfil, c.id, appUrl)
  const pedidos: string[] = []
  if (v.pedir_registro_chat)
    pedidos.push("Lo que hablaron por teléfono no quedó en PRISMA. Mandale al cliente desde el <strong>chat de PRISMA</strong> un mensaje confirmando lo acordado (día y hora de la visita, lo que le prometiste).")
  if (v.pedir_registro_visita)
    pedidos.push("La visita que mencionás no figura en el <strong>calendario</strong> de PRISMA: cargala, así los recordatorios al cliente salen solos.")
  if (v.pedir_registro_actividad)
    pedidos.push("Registrá la gestión en el <strong>tracking</strong> (la actividad con este cliente y la propiedad).")
  const html = [
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;color:#1a1a1a">`,
    `<p>Hola ${esc(primerNombre(perfil))},</p>`,
    `<p>Vimos tu nota sobre <strong>${esc(cliente)}</strong> (${esc(tel)}): <em>«${esc(unaLinea(nota.content, 200))}»</em></p>`,
    `<p>Perfecto que ya lo estés atendiendo — los avisos de "cliente esperando" se frenaron para este caso.</p>`,
    // Leonardo, 10/9: al grano — es para que quede registrado y el bot (con el nombre de la agencia,
    // nunca a mano) tenga contexto para seguir mejor al cliente. Antes: "para que nada se pierda".
    pedidos.length ? `<p>Para que quede registrado y ${esc(nombreBot)} tenga contexto para dar un mejor seguimiento al cliente:</p><ul>${pedidos.map((p) => `<li>${p}</li>`).join("")}</ul>` : "",
    `<p><a href="${link}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Abrir el chat en PRISMA</a></p>`,
    `<p style="color:#888;font-size:13px">— Agente de seguimiento de PRISMA · ${esc(nombreAgencia)}</p>`,
    `</div>`,
  ].filter(Boolean).join("\n")
  const queRegistrar = [
    v.pedir_registro_chat ? "un mensaje al cliente desde el chat" : null,
    v.pedir_registro_visita ? "la visita en el calendario" : null,
    v.pedir_registro_actividad ? "la actividad en el tracking" : null,
  ].filter(Boolean).join(", ")
  return {
    destinatario: perfil,
    esAsignado: true,
    link,
    asunto: `${cliente}: gestión anotada — falta el registro en PRISMA — ${nombreAgencia}`,
    html,
    plantilla: "asesor_registro_pendiente",
    // {{2}} de la plantilla `asesor_registro_pendiente`: la plantilla es neutra (se presenta como
    // PRISMA y da el link); acá va lo del caso y el porqué, con el nombre del bot de la agencia,
    // así cambiar el texto no requiere que Meta vuelva a aprobar nada (Leonardo, 10/9).
    variables: [primerNombre(perfil), unaLinea(`Vimos tu nota interna sobre ${cliente} (${tel}) y entendemos que ya lo estás atendiendo, así que frenamos los avisos de cliente esperando por este caso. Falta registrar en PRISMA: ${queRegistrar || "nada, está todo al día"}. Así queda registrado y ${nombreBot} tiene contexto para dar un mejor seguimiento al cliente.`, 700), link],
  }
}

/**
 * La nota NO alcanzó (Carmen, 10/9): la asesora dejó «Ya hablé», la IA la rechazó y nadie se lo
 * dijo; el siguiente aviso (con copia al director) le pedía "dejá una nota interna", que era lo que
 * ya había hecho. Ahora se le cuenta qué faltó y qué escribir para frenar los avisos. UNA vez por
 * nota (el marcador `nota_evaluada` por nota_id es el que lo garantiza). Misma plantilla neutra.
 */
export function armarAvisoNotaInsuficiente(
  perfil: PerfilEquipo,
  c: { id: string; contact_phone: string; metricas: Record<string, unknown> },
  nota: NotaInterna,
  v: VeredictoNota,
  appUrl: string,
  nombreAgencia: string,
  nombreBot: string = BOT_GENERICO
): Aviso {
  const cliente = nombreCliente(c)
  const tel = `+${c.contact_phone.replace(/\D/g, "")}`
  const link = linkAlChat(perfil, c.id, appUrl)
  const html = [
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;color:#1a1a1a">`,
    `<p>Hola ${esc(primerNombre(perfil))},</p>`,
    `<p>Vimos tu nota sobre <strong>${esc(cliente)}</strong> (${esc(tel)}): <em>«${esc(unaLinea(nota.content, 200))}»</em></p>`,
    `<p>Por lo que dice, no pudimos confirmar que ya lo estés atendiendo, así que los avisos de "cliente esperando" siguen para este caso. Motivo: ${esc(v.razon)}</p>`,
    `<p>Si ya hablaste con el cliente, cualquiera de estas dos frena los avisos y hace que quede registrado y ${esc(nombreBot)} tenga contexto para dar un mejor seguimiento al cliente:</p><ul>`,
    `<li>Mandale desde el <strong>chat de PRISMA</strong> un mensaje confirmando lo que acordaron.</li>`,
    `<li>Dejá una <strong>nota interna</strong> que diga que ya hablaste con el cliente y qué quedó pendiente.</li>`,
    `</ul>`,
    `<p><a href="${link}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Abrir el chat en PRISMA</a></p>`,
    `<p style="color:#888;font-size:13px">— Agente de seguimiento de PRISMA · ${esc(nombreAgencia)}</p>`,
    `</div>`,
  ].join("\n")
  // {{2}} de `asesor_registro_pendiente` (tope 700): la nota se recorta a lo que queda después del
  // texto fijo, así una nota larga nunca rompe el envío.
  const fijo = (n: string) =>
    `Vimos tu nota interna sobre ${cliente} (${tel}): «${n}». No nos quedó claro que ya lo estés atendiendo, así que los avisos de cliente esperando siguen para este caso. Si ya hablaste con el cliente, escribile desde el chat de PRISMA confirmando lo acordado, o dejá una nota que diga que ya hablaste y qué quedó pendiente. Así queda registrado y ${nombreBot} tiene contexto para dar un mejor seguimiento al cliente.`
  const margen = 700 - fijo("").length
  return {
    destinatario: perfil,
    esAsignado: true,
    link,
    asunto: `${cliente}: leímos tu nota, pero los avisos siguen — ${nombreAgencia}`,
    html,
    plantilla: "asesor_registro_pendiente",
    variables: [primerNombre(perfil), fijo(unaLinea(nota.content, Math.max(20, margen))), link],
  }
}

export type ResultadoNota =
  | "sin_nota" | "escalera_sigue" | "atendido_sin_aviso"
  | "atendido_avisado" | "atendido_simulado"
  | "no_atendido_avisado" | "no_atendido_simulado" | "error_ia"

/**
 * El caso tiene nota → la IA decide. Una evaluación por nota (evento `nota_evaluada`
 * con nota_id); si la IA falla, la escalera sigue como hoy (evento `nota_error`):
 * un aviso de más molesta menos que un cliente perdido.
 */
export async function procesarNotaDelCaso(
  db: SupabaseClient,
  c: Pick<Candidato, "id" | "agency_id" | "contact_phone" | "metricas" | "visit_scheduled_at">,
  t0: string,
  opts: {
    modo: string
    asesor: PerfilEquipo | null
    appUrl: string
    nombreAgencia: string
    /** Nombre del agente IA de la agencia (whatsapp_ai_settings.bot_name); sin él, el genérico. */
    nombreBot?: string
    ahoraMs: number
    fetchFn?: typeof fetch
    llamar?: LlamarVeredicto
    enviar?: typeof enviarAviso
  }
): Promise<ResultadoNota> {
  const nota = await notaPosterior(db, c.id, t0)
  if (!nota) return "sin_nota"

  // "Atendido" es PEGAJOSO para el caso, no para la nota: si ya hubo un veredicto atendido
  // con este mismo t0, una segunda nota inofensiva ("ojo, pregunta por cochera") no puede
  // re-armar la escalera y disparar el nivel más alto pendiente.
  const { data: yaAtendido } = await db
    .from("lead_eventos").select("datos")
    .eq("conversation_id", c.id).eq("tipo", "nota_evaluada")
    .contains("datos", { t0, atendido: true }).limit(1)
  if (yaAtendido?.length) return "atendido_sin_aviso"

  const { data: previa } = await db
    .from("lead_eventos").select("datos")
    .eq("conversation_id", c.id).eq("tipo", "nota_evaluada")
    .contains("datos", { nota_id: nota.id })
    .order("ts", { ascending: false }).limit(1).maybeSingle()
  if (previa?.datos) return (previa.datos as { atendido?: boolean }).atendido ? "atendido_sin_aviso" : "escalera_sigue"

  const registro = await contextoRegistro(db, c, opts.ahoraMs)
  const mensajes = await crearHerramientas(db, c as Candidato).leer_mensajes({ cantidad: 30 })
  const propiedadInteres =
    String(c.metricas?.propiedad_interes ?? c.metricas?.propiedad_consultada ?? "").trim() || null
  const ahoraISO = new Date(opts.ahoraMs).toLocaleString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).slice(0, 16)

  let veredicto: VeredictoNota
  try {
    veredicto = await (opts.llamar ?? crearLlamadaVeredicto())(
      semillaVeredicto({ nota, mensajes, ...registro, propiedadInteres, ahoraISO })
    )
  } catch (e) {
    await registrarEvento(db, c.agency_id, c.id, "nota_error",
      `La IA no pudo evaluar la nota interna; la escalera sigue como siempre: ${String(e).slice(0, 150)}`,
      { nota_id: nota.id, t0 })
    return "error_ia"
  }

  // El marcador va INLINE y chequeado (no por registrarEvento, que traga el error): es lo
  // único que evita re-evaluar y re-avisar en cada barrida. Si no se pudo guardar, no se
  // manda nada — mejor un aviso que no sale que el mismo mail cada 30 minutos. Pero un
  // caso NO atendido sigue escalando igual: el marcador fallido nunca frena la escalera.
  const { error: errMarca } = await db.from("lead_eventos").insert({
    agency_id: c.agency_id,
    conversation_id: c.id,
    tipo: "nota_evaluada",
    actor: "agente_seguimiento",
    descripcion: veredicto.atendido
      ? `Nota del asesor leída: el cliente ya está atendido, la escalera se frena — ${veredicto.razon}`
      : `Nota del asesor leída: no indica atención, la escalera sigue — ${veredicto.razon}`,
    datos: { nota_id: nota.id, t0, ...veredicto },
  })
  if (errMarca) {
    console.error("[seguimiento] nota_evaluada no se pudo registrar:", errMarca.message)
    return veredicto.atendido ? "atendido_sin_aviso" : "escalera_sigue"
  }

  if (!veredicto.atendido) {
    // La escalera sigue igual; lo nuevo es que el asesor se entera de que su nota no alcanzó
    // y de qué escribir. Sin asesor asignado no hay a quién contárselo.
    if (!opts.asesor) return "escalera_sigue"
    const aviso = armarAvisoNotaInsuficiente(opts.asesor, c, nota, veredicto, opts.appUrl, opts.nombreAgencia, opts.nombreBot ?? BOT_GENERICO)
    if (opts.modo !== "activo") {
      await registrarEvento(db, c.agency_id, c.id, "aviso_nota_simulado",
        `[${opts.modo}] se le habría avisado al asesor ${opts.asesor.full_name ?? ""} que su nota no alcanzó para frenar la escalera`,
        { nota_id: nota.id, asunto: aviso.asunto })
      return "no_atendido_simulado"
    }
    await (opts.enviar ?? enviarAviso)(db, c as never, aviso, opts.nombreAgencia, { fetchFn: opts.fetchFn })
    return "no_atendido_avisado"
  }
  const hayPedidos = veredicto.pedir_registro_chat || veredicto.pedir_registro_visita || veredicto.pedir_registro_actividad
  if (!hayPedidos || !opts.asesor) return "atendido_sin_aviso"

  const aviso = armarAvisoRegistro(opts.asesor, c, nota, veredicto, opts.appUrl, opts.nombreAgencia, opts.nombreBot ?? BOT_GENERICO)
  if (opts.modo !== "activo") {
    await registrarEvento(db, c.agency_id, c.id, "aviso_registro_simulado",
      `[${opts.modo}] se le habría pedido al asesor ${opts.asesor.full_name ?? ""} registrar la gestión en PRISMA`,
      { nota_id: nota.id, asunto: aviso.asunto })
    return "atendido_simulado"
  }
  await (opts.enviar ?? enviarAviso)(db, c as never, aviso, opts.nombreAgencia, { fetchFn: opts.fetchFn })
  return "atendido_avisado"
}
