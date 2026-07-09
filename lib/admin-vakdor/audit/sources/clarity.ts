// Fuente: Microsoft Clarity (Data Export API) — comportamiento/UX del sitio vakdor.com.
// Puerto de scripts/clarity.mjs. OJO: rate limit real de 10 requests/día por proyecto,
// por eso este chequeo corre 1×/día (colgado del cron diario), nunca en loop.
import { type Semaforo } from "@/lib/admin-vakdor/audit/types"

interface ClarityRow {
  metricName: string
  information: Array<Record<string, unknown>>
}

function primerValor(data: ClarityRow[], metricName: string, campo: string): unknown {
  const row = data.find((m) => m.metricName === metricName)
  return row?.information?.[0]?.[campo]
}

export async function getClarityInsights(): Promise<{ kvs: Record<string, string>; sub: Semaforo }> {
  try {
    const token = process.env.CLARITY_API_KEY
    if (!token) throw new Error("Falta CLARITY_API_KEY")

    const res = await fetch("https://www.clarity.ms/export-data/api/v1/project-live-insights?numOfDays=3", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`clarity -> ${res.status}: ${text.slice(0, 200)}`)
    const data: ClarityRow[] = JSON.parse(text)

    const sesiones = primerValor(data, "Traffic", "totalSessionCount")
    const usuarios = primerValor(data, "Traffic", "distinctUserCount")
    const bots = primerValor(data, "Traffic", "totalBotSessionCount")
    const scroll = primerValor(data, "ScrollDepth", "averageScrollDepth")
    const totalTime = primerValor(data, "EngagementTime", "totalTime")
    const activeTime = primerValor(data, "EngagementTime", "activeTime")
    const rage = primerValor(data, "RageClickCount", "subTotal")
    const dead = primerValor(data, "DeadClickCount", "subTotal")

    const kvs: Record<string, string> = {
      Sesiones: sesiones != null ? `${sesiones} (${usuarios ?? "?"} usuarios)` : "no disponible",
      "Scroll promedio": scroll != null ? `${scroll}%` : "no disponible",
      "Rage/Dead clicks": rage != null || dead != null ? `${rage ?? 0}/${dead ?? 0}` : "no disponible",
      "Tiempo activo": activeTime != null ? `${activeTime}s (de ${totalTime ?? "?"}s)` : "no disponible",
      Bots: bots != null ? String(bots) : "no disponible",
    }

    return { kvs, sub: "amarillo" }
  } catch {
    return {
      kvs: {
        Sesiones: "no disponible",
        "Scroll promedio": "no disponible",
        "Rage/Dead clicks": "no disponible",
        "Tiempo activo": "no disponible",
        Bots: "no disponible",
      },
      sub: "gris",
    }
  }
}
