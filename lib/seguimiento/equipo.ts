import { linkAlChat, nombreCliente, unaLinea, type Aviso, type PerfilEquipo } from "./avisos"
import type { Candidato } from "./tipos"

/**
 * Reasignación y aprobaciones (fase 2, primera pieza). Reglas de Leonardo (26/8):
 * - El asesor NO reasigna: solo "Lo tomo" o "No lo puedo tomar" (justificación obligatoria).
 *   Al no poder, se le saca la asignación (deja de ver el chat) y el pedido llega al
 *   director, que decide: lo toma él o lo reasigna.
 * - Al reasignar, el asesor nuevo recibe email + WhatsApp con el detalle y el link al chat,
 *   donde están los botones "Lo tomo" / "No lo puedo tomar".
 * - Si la ventana de 24 h del cliente ya cerró, el director puede mandarle una plantilla
 *   para reabrir la conversación; si el cliente contesta, lo toma el asesor nuevo.
 * - El asesor puede marcar el lead como perdido si no contesta más (justificación).
 * Este archivo es la parte PURA (testeable); las escrituras viven en app/actions/equipo.ts.
 */

export const HORAS_VENTANA_META = 24
export const JUSTIFICACION_MIN = 10
export const HORAS_VENCE_APROBACION = 48
export const HORAS_RESPUESTA_ASESOR = 24

/** Meta solo acepta texto libre si el cliente escribió en las últimas 24 h. */
export function ventanaCerrada(ultimoMensajeDelLeadISO: string | null, ahora: Date = new Date()): boolean {
  if (!ultimoMensajeDelLeadISO) return true
  const t = Date.parse(ultimoMensajeDelLeadISO)
  if (Number.isNaN(t)) return true
  return ahora.getTime() - t > HORAS_VENTANA_META * 3600e3
}

/** Devuelve el mensaje de error, o null si la justificación sirve. */
export function validarJustificacion(j: string | null | undefined): string | null {
  const limpio = (j ?? "").replace(/\s+/g, " ").trim()
  if (limpio.length < JUSTIFICACION_MIN)
    return `Contá el motivo con un poco más de detalle (mínimo ${JUSTIFICACION_MIN} letras).`
  if (limpio.length > 500) return "El motivo es demasiado largo (máximo 500 letras)."
  return null
}

function primerNombre(perfil: Pick<PerfilEquipo, "full_name">): string {
  return (perfil.full_name ?? "").trim().split(/\s+/)[0] || "Hola"
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] as string)
}

function marco(cuerpo: string[], nombreAgencia: string): string {
  return [
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;color:#1a1a1a">`,
    ...cuerpo,
    `<p style="color:#888;font-size:13px">— Agente de seguimiento de PRISMA · ${esc(nombreAgencia)}</p>`,
    `</div>`,
  ].join("\n")
}

function boton(href: string, texto: string): string {
  return `<p><a href="${href}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">${esc(texto)}</a></p>`
}

type Conv = Pick<Candidato, "id" | "contact_phone" | "metricas">

/** Lo que el asesor necesita saber del lead antes de abrir el chat (regla de Leonardo 27/8). */
export interface ContextoLead {
  /** Qué busca, armado desde `metricas` (null si no hay datos). */
  busca: string | null
  /** Último mensaje del cliente, ya con fecha en hora argentina. */
  ultimoMensaje: { texto: string; fechaAR: string } | null
}

function val(m: Record<string, unknown>, k: string): string | null {
  const v = m[k]
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s && s.toLowerCase() !== "null" && s.toLowerCase() !== "undefined" ? s : null
}

/** "alquiler, departamento 2 amb en Caballito, hasta USD 120000, urgencia alta" */
export function contextoDesdeMetricas(metricas: Record<string, unknown> | null | undefined): string | null {
  const m = metricas ?? {}
  const partes: string[] = []
  const operacion = val(m, "tipo_operacion")
  const tipo = val(m, "tipo_propiedad")
  const amb = val(m, "ambientes_buscados")
  const zona = val(m, "zona") ?? val(m, "barrio_consultado")
  const tipoAmb = [tipo, amb ? `${amb} amb` : null].filter(Boolean).join(" ")
  const que = [operacion, tipoAmb || null].filter(Boolean).join(", ")
  if (que || zona) partes.push([que || null, zona ? `en ${zona}` : null].filter(Boolean).join(" "))
  const moneda = val(m, "moneda_presupuesto") ?? ""
  const min = val(m, "presupuesto_min")
  const max = val(m, "presupuesto_max")
  const plata = (t: string) => t.replace(/\s+/g, " ").trim()
  if (min && max) partes.push(plata(`presupuesto ${moneda} ${min} a ${max}`))
  else if (max) partes.push(plata(`hasta ${moneda} ${max}`))
  else if (min) partes.push(plata(`desde ${moneda} ${min}`))
  const prop = val(m, "propiedad_interes") ?? val(m, "propiedad_consultada")
  if (prop) partes.push(`propiedad de interés: ${prop}`)
  const urgencia = val(m, "urgencia")
  if (urgencia) partes.push(`urgencia ${urgencia}`)
  const nec = val(m, "necesidades")
  if (nec) partes.push(nec)
  if (!partes.length) return null
  return unaLinea(partes.join(", "), 300)
}

function lineaContextoWhatsApp(ctx: ContextoLead | undefined): string {
  if (!ctx) return ""
  const p: string[] = []
  if (ctx.busca) p.push(`Busca: ${ctx.busca}.`)
  if (ctx.ultimoMensaje) p.push(`Último mensaje del cliente (${ctx.ultimoMensaje.fechaAR}): «${unaLinea(ctx.ultimoMensaje.texto, 140)}».`)
  return p.length ? ` ${p.join(" ")}` : ""
}

function bloqueContextoHtml(ctx: ContextoLead | undefined): string[] {
  if (!ctx) return []
  const out: string[] = []
  if (ctx.busca) out.push(`<p><strong>Qué busca:</strong> ${esc(ctx.busca)}</p>`)
  if (ctx.ultimoMensaje)
    out.push(`<p><strong>Último mensaje del cliente</strong> (${esc(ctx.ultimoMensaje.fechaAR)}):<br><em>“${esc(unaLinea(ctx.ultimoMensaje.texto, 400))}”</em></p>`)
  if (!out.length) out.push(`<p style="color:#555">Todavía no hay datos capturados de este cliente: leé el chat.</p>`)
  return out
}

/** Aviso al asesor al que le asignaron (o reasignaron) un chat. */
export function armarAvisoAsignacion(
  perfil: PerfilEquipo,
  c: Conv,
  opts: { porQuien: string; motivo: string | null; contexto?: ContextoLead },
  appUrl: string,
  nombreAgencia: string
): Aviso {
  const cliente = nombreCliente(c)
  const tel = `+${c.contact_phone.replace(/\D/g, "")}`
  const link = linkAlChat(perfil, c.id, appUrl)
  const motivo = (opts.motivo ?? "").trim()
  // El comentario del director va con su etiqueta: los dos puntos solos no se entendían (27/8)
  const resumen = unaLinea(
    `${opts.porQuien} te asignó el chat de ${cliente} (${tel}).${lineaContextoWhatsApp(opts.contexto)}${motivo ? ` Comentario de ${opts.porQuien}: «${motivo}».` : ""}`,
    700
  )
  const html = marco(
    [
      `<p>Hola ${esc(primerNombre(perfil))},</p>`,
      `<p><strong>${esc(opts.porQuien)}</strong> te asignó el chat de <strong>${esc(cliente)}</strong> (${esc(tel)}).</p>`,
      ...bloqueContextoHtml(opts.contexto),
      motivo ? `<p style="border-left:3px solid #111;padding-left:10px"><strong>Comentario de ${esc(opts.porQuien)}:</strong> ${esc(motivo)}</p>` : "",
      `<p>Cuando lo abras vas a poder marcar <strong>«Lo tomo»</strong> o <strong>«No lo puedo tomar»</strong> (con el motivo, para que el director lo reasigne).</p>`,
      boton(link, "Abrir el chat en PRISMA"),
    ].filter(Boolean),
    nombreAgencia
  )
  return {
    destinatario: perfil,
    esAsignado: true,
    link,
    asunto: `Te asignaron el chat de ${cliente} — ${nombreAgencia}`,
    html,
    plantilla: "asesor_cliente_esperando",
    variables: [primerNombre(perfil), resumen, link],
  }
}

/** Aviso al director: un asesor no puede tomar un chat y hay que decidir. */
export function armarAvisoPedidoAlDirector(
  director: PerfilEquipo,
  c: Conv,
  pedido: { asesorNombre: string; justificacion: string; contexto?: ContextoLead },
  appUrl: string,
  nombreAgencia: string
): Aviso {
  const cliente = nombreCliente(c)
  const tel = `+${c.contact_phone.replace(/\D/g, "")}`
  const link = `${appUrl.replace(/\/+$/, "")}/director/aprobaciones`
  const que = unaLinea(`reasignar el chat de ${cliente} (${tel}). Motivo de ${pedido.asesorNombre}: «${pedido.justificacion.trim()}».${lineaContextoWhatsApp(pedido.contexto)}`, 700)
  const html = marco(
    [
      `<p>Hola ${esc(primerNombre(director))},</p>`,
      `<p><strong>${esc(pedido.asesorNombre)}</strong> no puede tomar el chat de <strong>${esc(cliente)}</strong> (${esc(tel)}) y lo soltó.</p>`,
      `<p style="border-left:3px solid #111;padding-left:10px"><strong>Motivo de ${esc(pedido.asesorNombre)}:</strong> ${esc(pedido.justificacion.trim())}</p>`,
      ...bloqueContextoHtml(pedido.contexto),
      `<p>El cliente quedó sin asesor. Decidilo en PRISMA: tomarlo vos o reasignarlo a otro asesor.</p>`,
      boton(link, "Ver aprobaciones pendientes"),
      `<p style="color:#555">El chat: <a href="${linkAlChat(director, c.id, appUrl)}">${linkAlChat(director, c.id, appUrl)}</a></p>`,
    ],
    nombreAgencia
  )
  return {
    destinatario: director,
    esAsignado: false,
    link,
    asunto: `${pedido.asesorNombre} no puede tomar a ${cliente} — decidilo en PRISMA`,
    html,
    plantilla: "director_aprobacion_pendiente",
    variables: [primerNombre(director), que, link],
  }
}

/** La frase que va en {{2}} de `seg_pendiente` para reabrir la conversación con el cliente. */
export function fraseReapertura(nombreAsesor: string): string {
  const nombre = (nombreAsesor ?? "").trim().split(/\s+/)[0] || "un asesor"
  return `Tu consulta ahora la sigue ${nombre}, que te escribe a la brevedad.`
}

/** Vencimiento de un compromiso "responder en 24 h", o 24 h más si ya existe. */
export function venceEn(desde: Date, horas = HORAS_RESPUESTA_ASESOR): string {
  return new Date(desde.getTime() + horas * 3600e3).toISOString()
}

/** "26/8 12:37" en hora argentina, para citar el último mensaje del cliente. */
export function fechaCortaAR(iso: string): string {
  const d = new Date(iso)
  const dia = d.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "numeric", month: "numeric" })
  const hora = d.toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hour12: false })
  return `${dia} ${hora}`
}
