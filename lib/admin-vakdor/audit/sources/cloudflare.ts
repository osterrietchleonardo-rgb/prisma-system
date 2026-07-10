// Fuente: Cloudflare (API REST) — estado de la zona vakdor.com + conteo de DNS.
import { type Semaforo } from "@/lib/admin-vakdor/audit/types"

export async function getCloudflareHealth(): Promise<{ kvs: Record<string, string>; sub: Semaforo }> {
  try {
    const key = process.env.CLOUDFLARE_API_KEY
    if (!key) throw new Error("Falta CLOUDFLARE_API_KEY")
    const zres = await fetch("https://api.cloudflare.com/client/v4/zones?name=vakdor.com", {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    })
    if (!zres.ok) throw new Error(`Cloudflare ${zres.status}`)
    const zj = await zres.json()
    const zona = (zj.result ?? [])[0]
    if (!zona) return { kvs: { Estado: "zona no encontrada" }, sub: "gris" }

    let dns = "?"
    let proxied = "?"
    try {
      const dres = await fetch(`https://api.cloudflare.com/client/v4/zones/${zona.id}/dns_records?per_page=100`, {
        headers: { Authorization: `Bearer ${key}` },
        cache: "no-store",
      })
      const dj = await dres.json()
      const recs: { proxied?: boolean }[] = dj.result ?? []
      dns = String(recs.length)
      proxied = String(recs.filter((r) => r.proxied).length)
    } catch {}

    const sub: Semaforo = zona.status === "active" && !zona.paused ? "verde" : "rojo"
    return {
      kvs: {
        "Zona vakdor.com": zona.status + (zona.paused ? " (pausada)" : ""),
        "Registros DNS": dns,
        "Proxied": proxied,
      },
      sub,
    }
  } catch {
    return { kvs: { Estado: "no disponible" }, sub: "gris" }
  }
}
