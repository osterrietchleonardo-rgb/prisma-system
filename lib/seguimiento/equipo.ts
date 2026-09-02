import { linkAlChat, nombreCliente, unaLinea, type Aviso, type PerfilEquipo } from "./avisos"
import type { Candidato } from "./tipos"
import { bloqueContextoHtml, lineaContextoWhatsApp, type ContextoLead } from "./contexto"

export { contextoDesdeMetricas, fechaCortaAR, type ContextoLead } from "./contexto"

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
