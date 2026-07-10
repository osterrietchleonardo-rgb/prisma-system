// Fuente: Vercel (API REST) — estado del último deploy de producción de prisma-system.
import { type Semaforo } from "@/lib/admin-vakdor/audit/types"

const PROJECT_ID = "prj_98Cal5VQTyib00DYVlDAr1Whh2mx"
const TEAM_ID = "team_88bZNTOjwQuh47yOrwnMiTjV"

export async function getVercelHealth(): Promise<{ kvs: Record<string, string>; sub: Semaforo }> {
  try {
    const key = process.env.VERCEL_API_KEY
    if (!key) throw new Error("Falta VERCEL_API_KEY")
    const url = `https://api.vercel.com/v6/deployments?projectId=${PROJECT_ID}&teamId=${TEAM_ID}&target=production&limit=10`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" })
    if (!res.ok) throw new Error(`Vercel ${res.status}`)
    const j = await res.json()
    const deps: { state: string; created: number }[] = j.deployments ?? []
    if (!deps.length) return { kvs: { Estado: "sin deploys" }, sub: "gris" }

    const ultimo = deps[0]
    const fallidos = deps.filter((d) => d.state === "ERROR" || d.state === "CANCELED").length
    const fecha = new Date(ultimo.created).toISOString().slice(0, 10)
    const sub: Semaforo = ultimo.state === "READY" ? (fallidos > 0 ? "amarillo" : "verde") : "rojo"

    return {
      kvs: {
        "Último deploy prod": ultimo.state === "READY" ? "READY" : ultimo.state,
        "Fecha": fecha,
        "Fallidos (últimos 10)": String(fallidos),
      },
      sub,
    }
  } catch {
    return { kvs: { Estado: "no disponible" }, sub: "gris" }
  }
}
