import { BUCKETS, type AgentRow, type SignalRow, type WeeklyReport } from "./types"

const AZUL = "#131A2D"
const COBRE = "#B57E3B"
const BORDE = "#e1e8ed"
const GRIS = "#888"

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)
}

/** Un número grande con su etiqueta, para la fila de resumen. */
function kpi(valor: string, etiqueta: string): string {
  return `<td style="padding:14px 8px;text-align:center;border:1px solid ${BORDE};background:#fafbfc">
    <div style="font-size:26px;font-weight:700;color:${AZUL};line-height:1">${valor}</div>
    <div style="font-size:11px;color:${GRIS};text-transform:uppercase;letter-spacing:.05em;margin-top:6px">${etiqueta}</div>
  </td>`
}

function seccion(titulo: string, bajada: string, cuerpo: string): string {
  return `<div style="margin:28px 0 0">
    <div style="font-size:12px;color:${COBRE};font-weight:700;text-transform:uppercase;letter-spacing:.08em">${titulo}</div>
    <div style="font-size:13px;color:${GRIS};margin:4px 0 12px;line-height:1.5">${bajada}</div>
    ${cuerpo}
  </div>`
}

function tabla(encabezados: string[], filas: string[][]): string {
  const th = encabezados
    .map(
      (h, i) =>
        `<th style="padding:8px 6px;font-size:11px;color:${GRIS};text-transform:uppercase;letter-spacing:.04em;border-bottom:2px solid ${BORDE};text-align:${i === 0 ? "left" : "center"}">${h}</th>`,
    )
    .join("")

  const tr = filas
    .map((f, idx) => {
      const esTotal = idx === filas.length - 1
      const fondo = esTotal ? "#fafbfc" : "#fff"
      const peso = esTotal ? "700" : "400"
      const tds = f
        .map(
          (v, i) =>
            `<td style="padding:8px 6px;font-size:13px;color:${AZUL};font-weight:${peso};border-bottom:1px solid ${BORDE};text-align:${i === 0 ? "left" : "center"}">${v}</td>`,
        )
        .join("")
      return `<tr style="background:${fondo}">${tds}</tr>`
    })
    .join("")

  return `<table style="width:100%;border-collapse:collapse"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`
}

function filasAgente(rows: AgentRow[]): string[][] {
  return rows.map((r) => [
    esc(r.agent),
    String(r.total),
    r.pct === null ? "—" : `${r.pct}%`,
    ...BUCKETS.map((b) => String(r.buckets[b])),
  ])
}

function filasSenal(rows: SignalRow[]): string[][] {
  return rows.map((r) => [
    esc(r.agent),
    String(r.total),
    String(r.chat),
    String(r.visita),
    String(r.email),
    String(r.sinRastro),
  ])
}

const NO_DISPONIBLE = `<div style="padding:14px;border:1px dashed ${BORDE};border-radius:8px;font-size:13px;color:${GRIS}">
  No se pudo leer el registro de emails esta semana. Los handoffs de arriba no dependen de esto y son correctos.
</div>`

export function renderReport(r: WeeklyReport): { subject: string; html: string } {
  const totalHandoffs = r.handoffs.rows.at(-1)
  const pct = totalHandoffs?.pct
  const sinAtender = totalHandoffs?.buckets["sin atender"] ?? 0

  // Si Resend respondió bien pero no trajo ni un aviso habiendo handoffs, lo más probable
  // es que hayan cambiado el asunto en n8n y las secciones B y C se hayan ido a cero en
  // silencio. Se avisa en vez de mostrar ceros como si fueran reales.
  const sospechaDeAsuntos = r.resendOk && r.handoffs.total > 0 && r.visitas.total === 0 && r.links.total === 0

  const resumen = `<table style="width:100%;border-collapse:collapse;margin-top:18px"><tr>
    ${kpi(String(r.consultas), "Consultas")}
    ${kpi(String(r.handoffs.total), "Handoffs")}
    ${kpi(r.resendOk ? String(r.visitas.total) : "—", "Visitas")}
    ${kpi(pct === null || pct === undefined ? "—" : `${pct}%`, "Atendidos")}
    ${kpi(`${r.pipeline.cargados}/${r.pipeline.derivados}`, "En pipeline")}
  </tr></table>`

  const secHandoffs = seccion(
    "A · Handoffs",
    `El bot derivó ${r.handoffs.total} conversación(es) a un asesor. La tabla muestra en cuánto tiempo alguien de la inmobiliaria escribió en el chat.`,
    tabla(["Asesor", "Derivados", "% atendido", ...BUCKETS], filasAgente(r.handoffs.rows)),
  )

  const bajadaSenales =
    "Después de este aviso el bot sigue conversando, así que el asesor puede haber respondido por su celular. Por eso se muestran las tres señales por separado: escribió en el chat, quedó la visita cargada, o abrió el email."

  const secVisitas = seccion(
    "B · Coordinación de visita",
    r.resendOk
      ? `${r.visitas.total} cliente(s) dieron su disponibilidad y se avisó por email al asesor. ${bajadaSenales}`
      : "Derivaciones por coordinación de visita.",
    r.resendOk
      ? tabla(["Asesor", "Avisos", "Chat", "Visita", "Email", "Sin rastro"], filasSenal(r.visitas.rows))
      : NO_DISPONIBLE,
  )

  const secLinks = seccion(
    "C · Consultas por link",
    r.resendOk
      ? `${r.links.total} consulta(s) por una propiedad puntual, avisadas por email al asesor.`
      : "Consultas por link de propiedad.",
    r.resendOk
      ? tabla(["Asesor", "Avisos", "Chat", "Visita", "Email", "Sin rastro"], filasSenal(r.links.rows))
      : NO_DISPONIBLE,
  )

  const cuerpoPipeline = r.pipeline.rows.length
    ? tabla(
        ["Etapa", "Leads"],
        [
          ...r.pipeline.rows.map((f) => [esc(f.stage), String(f.count)]),
          ["TOTAL CARGADOS", String(r.pipeline.cargados)],
        ],
      )
    : `<div style="padding:14px;border-left:4px solid ${COBRE};background:#fafbfc;border-radius:8px;font-size:14px;color:${AZUL}">
        Ninguno de los ${r.pipeline.derivados} leads derivados esta semana tiene una actividad cargada en Tracking Performance.
      </div>`

  const secPipeline = seccion(
    "D · Pipeline de Tracking Performance",
    `De los ${r.pipeline.derivados} lead(s) que el sistema derivó esta semana, ${r.pipeline.cargados} tienen una actividad cargada en el tablero.`,
    cuerpoPipeline,
  )

  const html = `<div style="background:#f4f7f9;padding:24px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">
  <div style="max-width:680px;margin:0 auto;background:#fff;border:1px solid ${BORDE};border-radius:16px;overflow:hidden">
    <div style="background:${AZUL};padding:26px 28px">
      <div style="color:#fff;font-size:20px;font-weight:700;letter-spacing:2px">PRISMA<span style="color:${COBRE}"> IA</span></div>
      <div style="color:#fff;font-size:15px;margin-top:10px">${esc(r.agencyName)}</div>
      <div style="color:${COBRE};font-size:13px;margin-top:2px">Semana del ${r.window.label}</div>
    </div>
    <div style="padding:24px 28px">
      ${resumen}
      ${secHandoffs}
      ${secVisitas}
      ${secLinks}
      ${secPipeline}
      <div style="margin-top:28px;padding-top:14px;border-top:1px solid ${BORDE};font-size:11px;color:${GRIS};line-height:1.6">
        Consultas = conversaciones nuevas en las que el cliente escribió al menos una vez.
        "Atendido" = alguien de la inmobiliaria escribió en el chat después de la derivación.
        ${sinAtender ? `<br><strong style="color:${AZUL}">${sinAtender} handoff(s) siguen sin respuesta.</strong>` : ""}
        ${sospechaDeAsuntos ? `<br><strong style="color:#c62828">Revisar: hubo ${r.handoffs.total} handoff(s) pero no se leyó ningún aviso de visita ni de consulta por link. Puede que haya cambiado el asunto de esos emails.</strong>` : ""}
      </div>
    </div>
  </div>
</div>`

  const subject = `PRISMA · ${r.agencyName} — semana del ${r.window.label}${sinAtender ? ` · ${sinAtender} sin atender` : ""}`
  return { subject, html }
}
