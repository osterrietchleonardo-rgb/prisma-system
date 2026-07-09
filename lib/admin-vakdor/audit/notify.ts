import { getAdminDb } from "@/lib/admin-vakdor/logger"

const COLOR: Record<string, string> = { verde: "#16a34a", amarillo: "#d97706", rojo: "#dc2626", gris: "#6b7280" }

/** Último snapshot global por experto. */
async function ultimosGlobales() {
  const db = getAdminDb()
  const { data, error } = await db
    .from("audit_snapshots")
    .select("experto, semaforo, resumen, run_at")
    .eq("scope", "global")
    .order("run_at", { ascending: false })
  if (error) throw new Error(`ultimosGlobales: ${error.message}`)
  const vistos = new Set<string>()
  const out: { experto: string; semaforo: string; resumen: string }[] = []
  for (const r of data ?? []) {
    if (vistos.has(r.experto)) continue
    vistos.add(r.experto)
    out.push({ experto: r.experto, semaforo: r.semaforo, resumen: r.resumen ?? "" })
  }
  return out
}

const NOMBRE: Record<string, string> = { whatsapp: "WhatsApp", sistema: "Salud del sistema", redes: "Redes / SEO / Meta" }

export async function enviarMailMetricas(): Promise<{ enviado: boolean; motivo?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.AUDIT_MAIL_TO ?? process.env.ADMIN_VAKDOR_EMAIL
  const from = process.env.RESEND_FROM ?? "PRISMA <no-reply@vakbot.vakdor.com>"
  if (!apiKey || !to) return { enviado: false, motivo: "falta RESEND_API_KEY o destino (AUDIT_MAIL_TO/ADMIN_VAKDOR_EMAIL)" }

  const items = await ultimosGlobales()
  // Ordenar: rojo primero, luego amarillo, luego verde.
  const peso: Record<string, number> = { rojo: 0, amarillo: 1, verde: 2, gris: 3 }
  items.sort((a, b) => (peso[a.semaforo] ?? 9) - (peso[b.semaforo] ?? 9))
  const rojos = items.filter((i) => i.semaforo === "rojo").length

  const fecha = new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })
  const filas = items
    .map(
      (i) => `
      <tr>
        <td style="padding:12px 0;border-top:1px solid #eee;vertical-align:top;width:24px">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${COLOR[i.semaforo]}"></span>
        </td>
        <td style="padding:12px 0;border-top:1px solid #eee">
          <strong style="font-size:14px;color:#111">${NOMBRE[i.experto] ?? i.experto}</strong>
          <div style="font-size:13px;color:#555;margin-top:4px;line-height:1.5">${i.resumen || "Sin novedades."}</div>
        </td>
      </tr>`,
    )
    .join("")

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#111">
    <h2 style="font-size:16px;margin:0 0 4px">PRISMA · Métricas del ${fecha}</h2>
    <p style="font-size:13px;color:#777;margin:0 0 12px">${rojos ? `${rojos} experto(s) en rojo` : "Todo en orden"}</p>
    <table style="width:100%;border-collapse:collapse">${filas}</table>
    <p style="font-size:11px;color:#aaa;margin-top:16px">Detalle completo en admin-vakdor → Métricas.</p>
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
