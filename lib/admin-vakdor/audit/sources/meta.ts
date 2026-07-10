// Fuente: Meta Ads (Graph API) — gasto/impresiones de las cuentas publicitarias.
// OJO: requiere que el token (META_API_KEY) tenga scope ads_read y acceso a la cuenta.
import { type Semaforo } from "@/lib/admin-vakdor/audit/types"

const AD_ACCOUNTS = ["583233341182808", "993595732315304"] // Vakdor + Instagram_Ads

export async function getMetaAds(): Promise<{ kvs: Record<string, string>; sub: Semaforo }> {
  try {
    const key = process.env.META_API_KEY
    if (!key) throw new Error("Falta META_API_KEY")

    let gasto = 0
    let impresiones = 0
    let conDatos = false
    let sinPermiso = false

    for (const act of AD_ACCOUNTS) {
      const url = `https://graph.facebook.com/v21.0/act_${act}/insights?fields=spend,impressions&date_preset=last_30d&access_token=${key}`
      const res = await fetch(url, { cache: "no-store" })
      const j = await res.json()
      if (j.error) {
        if (/permission/i.test(j.error.message ?? "")) sinPermiso = true
        continue
      }
      const row = (j.data ?? [])[0]
      if (row) {
        conDatos = true
        gasto += Number(row.spend ?? 0)
        impresiones += Number(row.impressions ?? 0)
      }
    }

    if (sinPermiso && !conDatos) {
      return {
        kvs: { Estado: "token sin permiso ads_read", Nota: "otorgar ads_read + acceso a la cuenta en Business Manager" },
        sub: "gris",
      }
    }
    if (!conDatos) {
      return { kvs: { "Campañas activas": "ninguna con gasto (30d)" }, sub: "gris" }
    }
    return {
      kvs: { "Gasto (30d)": `$${gasto.toFixed(2)}`, "Impresiones (30d)": String(impresiones) },
      sub: gasto > 0 ? "verde" : "gris",
    }
  } catch {
    return { kvs: { Estado: "no disponible" }, sub: "gris" }
  }
}
