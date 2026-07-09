import { getAdminDb } from "@/lib/admin-vakdor/logger"

const COLOR: Record<string, string> = { verde: "#16a34a", amarillo: "#d97706", rojo: "#dc2626", gris: "#6b7280" }
const NOMBRE: Record<string, string> = { whatsapp: "WhatsApp", sistema: "Salud del sistema", redes: "Redes / SEO / Meta" }

interface Item {
  experto: string
  semaforo: string
  resumen: string
  metricas: Record<string, any>
}

/** Último snapshot global por experto (con métricas completas). */
async function ultimosGlobales(): Promise<Item[]> {
  const db = getAdminDb()
  const { data, error } = await db
    .from("audit_snapshots")
    .select("experto, semaforo, resumen, metricas, run_at")
    .eq("scope", "global")
    .order("run_at", { ascending: false })
  if (error) throw new Error(`ultimosGlobales: ${error.message}`)
  const vistos = new Set<string>()
  const out: Item[] = []
  for (const r of data ?? []) {
    if (vistos.has(r.experto)) continue
    vistos.add(r.experto)
    out.push({ experto: r.experto, semaforo: r.semaforo, resumen: r.resumen ?? "", metricas: r.metricas ?? {} })
  }
  return out
}

/** Devuelve los pares [etiqueta, valor] a mostrar por experto. */
function kpisDelExperto(experto: string, m: Record<string, any>): [string, string][] {
  if (experto === "whatsapp") {
    return [
      ["Leads nuevos", `${m.leads_nuevos ?? 0}`],
      ["Conv. activas", `${m.conversaciones_activas ?? 0}`],
      ["Sin responder", `${m.sin_responder_total ?? 0} (${m.sin_responder_6h ?? 0} +6h)`],
      ["Agente ciego", `${m.agente_ciego ?? 0}`],
      ["1ª respuesta", m.primera_respuesta_min_mediana != null ? `${m.primera_respuesta_min_mediana} min` : "—"],
      ["Tasa respuesta", m.tasa_respuesta_pct != null ? `${m.tasa_respuesta_pct}%` : "—"],
      ["Calificados", `${m.calificados ?? 0}`],
      ["Prop. mostradas", `${m.propiedades_mostradas ?? 0}`],
      ["Visitas agendadas", `${m.visitas_agendadas ?? 0}`],
      ["Handoffs", `${m.handoffs ?? 0}`],
      ["Campaña / orgánico", `${m.origen_campana ?? 0} / ${m.origen_organico ?? 0}`],
      ["Reactivaciones", `${m.reactivaciones ?? 0}`],
      ["Enfriados", `${m.enfriados ?? 0}`],
    ]
  }
  if (experto === "sistema" || experto === "redes") {
    // Vienen agrupadas por app/sistema en metricas.grupos → aplanamos con el grupo en la etiqueta.
    const pares: [string, string][] = []
    for (const [grupo, kvs] of Object.entries(m.grupos ?? {})) {
      for (const [k, v] of Object.entries((kvs ?? {}) as Record<string, any>)) {
        pares.push([`${grupo} · ${k}`, String(v)])
      }
    }
    return pares
  }
  return []
}

function tablaKpis(pares: [string, string][]): string {
  if (!pares.length) return ""
  const celdas = pares
    .map(
      ([k, v]) => `
        <td style="padding:6px 10px;border:1px solid #eee;width:50%;vertical-align:top">
          <div style="font-size:10px;color:#999;text-transform:uppercase;letter-spacing:.04em">${k}</div>
          <div style="font-size:14px;color:#111;font-weight:600;margin-top:2px">${v}</div>
        </td>`,
    )
    // 2 columnas por fila
    .reduce<string[]>((filas, celda, i) => {
      if (i % 2 === 0) filas.push(`<tr>${celda}`)
      else filas[filas.length - 1] += `${celda}</tr>`
      return filas
    }, [])
    .map((f) => (f.endsWith("</tr>") ? f : `${f}<td style="border:1px solid #eee"></td></tr>`))
    .join("")
  return `<table style="width:100%;border-collapse:collapse;margin-top:8px">${celdas}</table>`
}

export async function enviarMailMetricas(): Promise<{ enviado: boolean; motivo?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.AUDIT_MAIL_TO ?? process.env.ADMIN_VAKDOR_EMAIL
  const from = process.env.RESEND_FROM ?? "PRISMA <no-reply@vakbot.vakdor.com>"
  if (!apiKey || !to) return { enviado: false, motivo: "falta RESEND_API_KEY o destino (AUDIT_MAIL_TO/ADMIN_VAKDOR_EMAIL)" }

  const items = await ultimosGlobales()
  // Ordenar: rojo primero, luego amarillo, verde, gris.
  const peso: Record<string, number> = { rojo: 0, amarillo: 1, verde: 2, gris: 3 }
  items.sort((a, b) => (peso[a.semaforo] ?? 9) - (peso[b.semaforo] ?? 9))
  const rojos = items.filter((i) => i.semaforo === "rojo").length

  const fecha = new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })
  const bloques = items
    .map(
      (i) => `
      <div style="border-top:1px solid #eee;padding:16px 0">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${COLOR[i.semaforo]}"></span>
          <strong style="font-size:15px;color:#111">${NOMBRE[i.experto] ?? i.experto}</strong>
        </div>
        <div style="font-size:13px;color:#555;margin:6px 0 0;line-height:1.5">${i.resumen || "Sin novedades."}</div>
        ${tablaKpis(kpisDelExperto(i.experto, i.metricas))}
      </div>`,
    )
    .join("")

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;color:#111">
    <h2 style="font-size:16px;margin:0 0 4px">PRISMA · Métricas del ${fecha}</h2>
    <p style="font-size:13px;color:#777;margin:0 0 4px">${rojos ? `${rojos} experto(s) en rojo` : "Todo en orden"}</p>
    ${bloques}
    <p style="font-size:11px;color:#aaa;margin-top:16px">Detalle completo en admin-vakdor → Dashboard.</p>
  </div>`

  const subject = `PRISMA · Métricas ${fecha}${rojos ? ` — ${rojos} en rojo` : ""}`
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html }),
  })
  if (!res.ok) return { enviado: false, motivo: `Resend ${res.status}: ${await res.text()}` }
  return { enviado: true }
}
