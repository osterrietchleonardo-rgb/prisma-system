// Fuente: Meta Ads (Graph API) — gasto/impresiones de las cuentas publicitarias.
// OJO: requiere que el token (META_API_KEY) tenga scope ads_read y acceso a la cuenta.
import { type Semaforo } from "@/lib/admin-vakdor/audit/types"

const V = "v23.0"

export async function getMetaAds(): Promise<{ kvs: Record<string, string>; sub: Semaforo }> {
  try {
    const key = process.env.META_TOKEN_PERMANENTE ?? process.env.META_API_KEY
    if (!key) throw new Error("Falta META_TOKEN_PERMANENTE")

    // Cuentas a las que el token realmente tiene acceso (no adivinamos ids).
    const accRes = await fetch(
      `https://graph.facebook.com/${V}/me/adaccounts?fields=account_id&limit=50&access_token=${key}`,
      { cache: "no-store" },
    )
    const accJson = await accRes.json()
    if (accJson.error) {
      if (/permission/i.test(accJson.error.message ?? "")) {
        return { kvs: { Estado: "token sin permiso ads_read", Nota: "otorgar ads_read + acceso a la cuenta" }, sub: "gris" }
      }
      throw new Error(accJson.error.message)
    }
    const cuentas: string[] = (accJson.data ?? []).map((a: any) => a.account_id)
    if (!cuentas.length) return { kvs: { Estado: "sin cuentas de ads accesibles" }, sub: "gris" }

    let gasto = 0
    let impresiones = 0
    for (const act of cuentas) {
      const url = `https://graph.facebook.com/${V}/act_${act}/insights?fields=spend,impressions&date_preset=last_30d&access_token=${key}`
      const res = await fetch(url, { cache: "no-store" })
      const j = await res.json()
      const row = (j.data ?? [])[0]
      if (row) {
        gasto += Number(row.spend ?? 0)
        impresiones += Number(row.impressions ?? 0)
      }
    }

    if (gasto === 0 && impresiones === 0) {
      return { kvs: { "Cuentas": String(cuentas.length), "Campañas con gasto (30d)": "ninguna" }, sub: "gris" }
    }
    return {
      kvs: { "Gasto (30d)": `$${gasto.toFixed(2)}`, "Impresiones (30d)": String(impresiones) },
      sub: gasto > 0 ? "verde" : "gris",
    }
  } catch {
    return { kvs: { Estado: "no disponible" }, sub: "gris" }
  }
}
