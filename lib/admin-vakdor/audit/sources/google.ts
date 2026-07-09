// Fuente: Google Analytics 4 (tráfico) + Google Search Console (búsqueda orgánica) de vakdor.com.
import { getGoogleAccessToken } from "@/lib/admin-vakdor/finance/google-auth"
import { type Semaforo } from "@/lib/admin-vakdor/audit/types"

const GA_PROPERTY_ID = "526455345"
const GSC_SITE_URL = "https://www.vakdor.com/"

const GA_SIN_DATOS = { Usuarios: "no disponible", Sesiones: "no disponible", "Páginas vistas": "no disponible", "Usuarios nuevos": "no disponible" }
const GSC_SIN_DATOS = { Clicks: "no disponible", Impresiones: "no disponible", Posición: "no disponible" }

async function getGa(): Promise<{ ga: Record<string, string>; subGa: Semaforo }> {
  try {
    const token = await getGoogleAccessToken("https://www.googleapis.com/auth/analytics.readonly")
    const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${GA_PROPERTY_ID}:runReport`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
        metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "screenPageViews" }, { name: "newUsers" }],
      }),
      cache: "no-store",
    })
    if (!res.ok) throw new Error(`GA -> ${res.status}`)
    const data = await res.json()
    const vals: string[] = data?.rows?.[0]?.metricValues?.map((m: { value: string }) => m.value) ?? []
    const [activeUsers, sessions, pageviews, newUsers] = vals
    const usuarios = Number(activeUsers ?? 0)

    return {
      ga: {
        Usuarios: activeUsers ?? "0",
        Sesiones: sessions ?? "0",
        "Páginas vistas": pageviews ?? "0",
        "Usuarios nuevos": newUsers ?? "0",
      },
      subGa: usuarios > 0 ? "amarillo" : "gris",
    }
  } catch {
    return { ga: GA_SIN_DATOS, subGa: "gris" }
  }
}

async function getGsc(): Promise<{ gsc: Record<string, string>; subGsc: Semaforo }> {
  try {
    const token = await getGoogleAccessToken("https://www.googleapis.com/auth/webmasters.readonly")
    const end = new Date(Date.now() - 86400000) // ayer (GSC no tiene datos de hoy)
    const start = new Date(Date.now() - 8 * 86400000)
    const iso = (d: Date) => d.toISOString().slice(0, 10)
    const res = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_SITE_URL)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: iso(start), endDate: iso(end) }),
        cache: "no-store",
      },
    )
    if (!res.ok) throw new Error(`GSC -> ${res.status}`)
    const data = await res.json()
    const row = data?.rows?.[0] ?? { clicks: 0, impressions: 0, position: 0 }
    const clicks = Number(row.clicks ?? 0)

    return {
      gsc: {
        Clicks: String(row.clicks ?? 0),
        Impresiones: String(row.impressions ?? 0),
        Posición: row.position != null ? row.position.toFixed(1) : "no disponible",
      },
      subGsc: clicks > 0 ? "amarillo" : "rojo",
    }
  } catch {
    return { gsc: GSC_SIN_DATOS, subGsc: "gris" }
  }
}

export async function getGoogleTraffic(): Promise<{
  ga: Record<string, string>
  gsc: Record<string, string>
  subGa: Semaforo
  subGsc: Semaforo
}> {
  const [{ ga, subGa }, { gsc, subGsc }] = await Promise.all([getGa(), getGsc()])
  return { ga, gsc, subGa, subGsc }
}
