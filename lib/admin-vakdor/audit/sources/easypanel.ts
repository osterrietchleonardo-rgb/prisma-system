// Fuente: EasyPanel (panel.vakdor.com) — salud de los servicios core del server.
// Receta verificada (ver scripts/easypanel.mjs y skill vakdor-easypanel): tRPC vía POST,
// body {json: input|null}, respuesta {json: ...}. Auth: Bearer EASYPANEL_API_KEY.
import { type Semaforo } from "@/lib/admin-vakdor/audit/types"

const BASE = "https://panel.vakdor.com/api/trpc"

/** Servicios core a vigilar (se excluye chatwoot a propósito). */
const CORE_SERVICES = ["n8n", "evolution-api", "roomix-worker", "acm-extractor", "redis"]

interface EasypanelService {
  name: string
  type: string
  projectName: string
  enabled: boolean
}

async function trpc(proc: string, input: unknown = null): Promise<any> {
  const token = process.env.EASYPANEL_API_KEY
  if (!token) throw new Error("Falta EASYPANEL_API_KEY")
  const res = await fetch(`${BASE}/${proc}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ json: input }),
    cache: "no-store",
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${proc} -> ${res.status}: ${text.slice(0, 200)}`)
  return JSON.parse(text).json
}

/** Estado de los 5 servicios core de EasyPanel. rojo si alguno está caído/apagado/no encontrado. */
export async function getEasypanelHealth(): Promise<{ servicios: Record<string, string>; sub: Semaforo }> {
  try {
    const data = await trpc("projects.listProjectsAndServices")
    const services: EasypanelService[] = data?.services ?? []
    const servicios: Record<string, string> = {}
    let algunCaido = false

    await Promise.all(
      CORE_SERVICES.map(async (nombre) => {
        const sv = services.find((s) => s.name === nombre)
        if (!sv) {
          servicios[nombre] = "no encontrado"
          algunCaido = true
          return
        }
        if (!sv.enabled) {
          servicios[nombre] = "apagado"
          algunCaido = true
          return
        }
        try {
          const err = await trpc("services.common.getServiceError", {
            projectName: sv.projectName,
            serviceName: sv.name,
          })
          if (err == null) {
            servicios[nombre] = "en línea"
          } else {
            servicios[nombre] = "error"
            algunCaido = true
          }
        } catch {
          servicios[nombre] = "no disponible"
          algunCaido = true
        }
      }),
    )

    return { servicios, sub: algunCaido ? "rojo" : "verde" }
  } catch {
    const servicios: Record<string, string> = {}
    for (const n of CORE_SERVICES) servicios[n] = "no disponible"
    return { servicios, sub: "gris" }
  }
}
