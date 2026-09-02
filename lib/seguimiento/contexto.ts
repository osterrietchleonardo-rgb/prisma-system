import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * El contexto del lead que va en TODOS los avisos al equipo (regla de Leonardo, 27/8: "me gusta
 * más esta versión para todos los avisos, que tenga un poco más de valor y contexto"):
 * qué busca (desde `metricas`, lo que capturó el bot) y su último mensaje con fecha argentina.
 * Sin datos, lo dice: nunca inventa.
 */
export interface ContextoLead {
  /** Qué busca, armado desde `metricas` (null si no hay datos). */
  busca: string | null
  /** Último mensaje del cliente, ya con fecha en hora argentina. */
  ultimoMensaje: { texto: string; fechaAR: string } | null
}

const LARGO_MAX = 300

export function unaLineaCorta(texto: string, max = LARGO_MAX): string {
  const limpio = texto.replace(/\s+/g, " ").trim()
  return limpio.length <= max ? limpio : `${limpio.slice(0, max - 1).trimEnd()}…`
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
  return unaLineaCorta(partes.join(", "), LARGO_MAX)
}

/** "26/8 12:37" en hora argentina, para citar el último mensaje del cliente. */
export function fechaCortaAR(iso: string): string {
  const d = new Date(iso)
  const dia = d.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "numeric", month: "numeric" })
  const hora = d.toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hour12: false })
  return `${dia} ${hora}`
}

/** La frase que va dentro del parámetro de la plantilla de WhatsApp (una línea, con espacio inicial). */
export function lineaContextoWhatsApp(ctx: ContextoLead | undefined): string {
  if (!ctx) return ""
  const p: string[] = []
  if (ctx.busca) p.push(`Busca: ${ctx.busca}.`)
  if (ctx.ultimoMensaje) p.push(`Último mensaje del cliente (${ctx.ultimoMensaje.fechaAR}): «${unaLineaCorta(ctx.ultimoMensaje.texto, 140)}».`)
  return p.length ? ` ${p.join(" ")}` : ""
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] as string)
}

/** Las secciones del email. Sin datos, lo dice. */
export function bloqueContextoHtml(ctx: ContextoLead | undefined): string[] {
  if (!ctx) return []
  const out: string[] = []
  if (ctx.busca) out.push(`<p><strong>Qué busca:</strong> ${esc(ctx.busca)}</p>`)
  if (ctx.ultimoMensaje)
    out.push(`<p><strong>Último mensaje del cliente</strong> (${esc(ctx.ultimoMensaje.fechaAR)}):<br><em>“${esc(unaLineaCorta(ctx.ultimoMensaje.texto, 400))}”</em></p>`)
  if (!out.length) out.push(`<p style="color:#555">Todavía no hay datos capturados de este cliente: leé el chat.</p>`)
  return out
}

/** Lee el último mensaje del cliente y arma el contexto. Lo usan el runner y las acciones. */
export async function contextoDelLead(
  db: SupabaseClient,
  c: { id: string; metricas: Record<string, unknown> | null | undefined }
): Promise<ContextoLead> {
  const { data: ultimo } = await db
    .from("wa_messages").select("content, created_at").eq("conversation_id", c.id).eq("role", "lead")
    .order("created_at", { ascending: false }).limit(1).maybeSingle()
  return {
    busca: contextoDesdeMetricas(c.metricas),
    ultimoMensaje: ultimo?.content && ultimo?.created_at
      ? { texto: String(ultimo.content), fechaAR: fechaCortaAR(ultimo.created_at) }
      : null,
  }
}
