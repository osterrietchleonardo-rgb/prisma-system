/**
 * Chat web · La derivación: lo que le llega al equipo cuando el asistente consigue un contacto.
 *
 * La idea de Leonardo (16/9): el chat de la web **no es una bandeja nueva donde el equipo tiene
 * que acordarse de entrar**. Es un embudo hacia WhatsApp, que es donde ya trabajan. Por eso el
 * aviso trae un botón que abre el chat CON EL VISITANTE, con el saludo ya escrito: un toque y
 * están hablando.
 *
 * Todo lo que escribió el visitante se escapa antes de entrar al correo: su nombre y su consulta
 * los escribe un desconocido de internet, y ese texto termina en la casilla del director.
 */

export type ObjetivoDerivacion =
  | "busca_propiedad"
  | "vender_propiedad"
  | "sumarse_equipo"
  | "consulta_empresa"
  | "reclamo"

const QUE_QUIERE: Record<ObjetivoDerivacion, string> = {
  busca_propiedad: "busca una propiedad",
  vender_propiedad: "quiere vender o alquilar su propiedad",
  sumarse_equipo: "quiere sumarse al equipo",
  consulta_empresa: "tiene una consulta",
  reclamo: "trae un reclamo",
}

export interface DatosVisitante {
  nombre?: string
  telefono?: string
  email?: string
  zona?: string
  presupuesto?: string
  detalle?: string
}

export interface OpcionesAviso {
  nombreAgencia: string
  nombreBot: string
  objetivo: ObjetivoDerivacion
  resumen: string
  datos: DatosVisitante
  paginaOrigen: string
}

export interface AvisoDerivacion {
  asunto: string
  html: string
  textoWhatsApp: string
  linkWhatsApp: string | null
}

/** Solo dígitos, y solo si puede ser un teléfono de verdad. */
export function telefonoUsable(entrada: string | null | undefined): string | null {
  const n = String(entrada ?? "").replace(/\D/g, "")
  return n.length >= 10 && n.length <= 15 ? n : null
}

/** El link que abre WhatsApp con el visitante y el saludo ya escrito. */
export function linkWhatsApp(telefono: string | null, saludo: string): string | null {
  if (!telefono) return null
  return `https://wa.me/${telefono}?text=${encodeURIComponent(saludo)}`
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] as string
  )
}

function sinHtml(s: unknown): string {
  return String(s ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

const ES_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type ResultadoEnvio = "enviado" | "sin_destinatario" | "sin_resend" | `error_${number}` | "error_red"

/**
 * El aviso por email. Es el canal que NO depende de que Meta apruebe una plantilla, así que es el
 * primero que funciona: mientras no esté la plantilla, esto es lo único que hace que el lead
 * llegue a una persona.
 *
 * Devuelve siempre un motivo: un lead que no llegó tiene que poder rastrearse, no desaparecer.
 */
export async function enviarDerivacionPorEmail(opts: {
  aviso: AvisoDerivacion
  para: Array<string | null | undefined>
  nombreAgencia: string
  env?: Record<string, string | undefined>
  fetchFn?: typeof fetch
}): Promise<{ resultado: ResultadoEnvio; id: string | null }> {
  const env = opts.env ?? process.env
  const fetchFn = opts.fetchFn ?? fetch

  const destinatarios = [
    ...new Set(
      opts.para
        .map((e) => String(e ?? "").trim().toLowerCase())
        .filter((e) => ES_EMAIL.test(e))
    ),
  ]
  if (!destinatarios.length) return { resultado: "sin_destinatario", id: null }

  const apiKey = env.RESEND_API_KEY
  const from = env.RESEND_FROM
  if (!apiKey || !from) return { resultado: "sin_resend", id: null }
  const direccion = from.match(/<([^>]+)>/)?.[1] ?? from

  try {
    const res = await fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${opts.nombreAgencia} vía PRISMA <${direccion}>`,
        to: destinatarios,
        subject: opts.aviso.asunto,
        html: opts.aviso.html,
      }),
    })
    if (!res.ok) return { resultado: `error_${res.status}` as ResultadoEnvio, id: null }
    const data = (await res.json().catch(() => ({}))) as { id?: string }
    return { resultado: "enviado", id: data?.id ?? null }
  } catch {
    return { resultado: "error_red", id: null }
  }
}

export function armarAvisoDerivacion(o: OpcionesAviso): AvisoDerivacion {
  const nombre = sinHtml(o.datos.nombre).trim() || "Alguien"
  const telefono = telefonoUsable(o.datos.telefono)
  const saludo = `Hola ${nombre !== "Alguien" ? nombre : ""}, soy del equipo de ${o.nombreAgencia}`.replace(/\s+,/, ",")
  const link = linkWhatsApp(telefono, saludo)

  const filas: Array<[string, string | undefined]> = [
    ["Teléfono", o.datos.telefono],
    ["Email", o.datos.email],
    ["Zona", o.datos.zona],
    ["Presupuesto", o.datos.presupuesto],
    ["Detalle", o.datos.detalle],
  ]

  const html = [
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;color:#1a1a1a">`,
    `<p><strong>${esc(nombre)}</strong> ${esc(QUE_QUIERE[o.objetivo])}.</p>`,
    `<p style="background:#f6f6f6;border-left:3px solid #ccc;padding:10px 12px">${esc(sinHtml(o.resumen))}</p>`,
    `<table style="border-collapse:collapse;font-size:14px">`,
    ...filas
      .filter(([, v]) => String(v ?? "").trim())
      .map(
        ([k, v]) =>
          `<tr><td style="padding:3px 12px 3px 0;color:#666">${esc(k)}</td><td style="padding:3px 0">${esc(sinHtml(v))}</td></tr>`
      ),
    `<tr><td style="padding:3px 12px 3px 0;color:#666">Vino de</td><td style="padding:3px 0">${esc(o.paginaOrigen)}</td></tr>`,
    `</table>`,
    link
      ? `<p><a href="${link}" style="display:inline-block;background:#25D366;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Escribirle por WhatsApp</a></p>`
      : `<p style="color:#666">No dejó teléfono. ${o.datos.email ? `Escribile a <a href="mailto:${esc(o.datos.email)}">${esc(o.datos.email)}</a>.` : "Tampoco dejó email."}</p>`,
    `<p style="color:#888;font-size:13px">— ${esc(o.nombreBot)}, el asistente del sitio · ${esc(o.nombreAgencia)}</p>`,
    `</div>`,
  ].join("\n")

  const textoWhatsApp = [
    `${nombre} ${QUE_QUIERE[o.objetivo]}.`,
    sinHtml(o.resumen),
    telefono ? `Tel: +${telefono}` : o.datos.email ? `Email: ${sinHtml(o.datos.email)}` : "Sin datos de contacto.",
    link ? `Escribile: ${link}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 600)

  return {
    asunto: `${nombre} ${QUE_QUIERE[o.objetivo]} — chat de la web`,
    html,
    textoWhatsApp,
    linkWhatsApp: link,
  }
}
