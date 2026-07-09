// Fuente: n8n (vn8nv.vakdor.com) — salud + errores de los 6 workflows core.
// Este chequeo server-side solo cuenta y fecha los errores (causa/corrección quedan
// vacías a propósito: requieren inspección manual del payload/execution, no disponible
// en un cron sin sesión).
import { type Semaforo } from "@/lib/admin-vakdor/audit/types"

const BASE = "https://vn8nv.vakdor.com/api/v1"

/** Los 6 workflows core del sistema (nombre exacto en n8n). */
const WORKFLOW_NAMES = [
  "PRISMA",
  "Avisar_Asesor",
  "Seguimiento",
  "Cartera_Propiedades",
  "Conocimiento_Contexto",
  "Gestion_Handoff",
]

interface N8nWorkflowListItem {
  id: string
  name: string
  active: boolean
}

interface N8nExecution {
  id: string
  workflowId: string
  startedAt: string
  stoppedAt: string | null
}

export interface N8nWorkflowStatus {
  estado: Semaforo
  errores: string
  ultimo_error: string
  causa: string
  correccion: string
}

async function n8nGet(path: string): Promise<any> {
  const key = process.env.N8N_API_KEY
  if (!key) throw new Error("Falta N8N_API_KEY")
  const res = await fetch(`${BASE}${path}`, {
    headers: { "X-N8N-API-KEY": key },
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`n8n ${path} -> ${res.status}`)
  return res.json()
}

/** "DD-MM (hace N días)" a partir de la fecha de fin (o inicio) de la ejecución. */
function formatUltimoError(fechaStr: string): string {
  const fecha = new Date(fechaStr)
  const dias = Math.floor((Date.now() - fecha.getTime()) / 86400000)
  const dd = String(fecha.getDate()).padStart(2, "0")
  const mm = String(fecha.getMonth() + 1).padStart(2, "0")
  const hace = dias <= 0 ? "hoy" : dias === 1 ? "hace 1 día" : `hace ${dias} días`
  return `${dd}-${mm} (${hace})`
}

const SIN_DATOS: N8nWorkflowStatus = {
  estado: "gris",
  errores: "no disponible",
  ultimo_error: "no disponible",
  causa: "",
  correccion: "",
}

export async function getN8nHealth(): Promise<{
  vivo: boolean
  errores24h: number
  workflows: Record<string, N8nWorkflowStatus>
  nota: string
  sub: Semaforo
}> {
  try {
    const [wfRes, exRes] = await Promise.all([
      n8nGet("/workflows"),
      n8nGet("/executions?status=error&limit=50"),
    ])
    const wfList: N8nWorkflowListItem[] = wfRes?.data ?? []
    const exList: N8nExecution[] = exRes?.data ?? []
    const vivo = wfList.length > 0

    const hace24hMs = Date.now() - 24 * 3600 * 1000
    let errores24h = 0
    let hayHistoricos = false
    const workflows: Record<string, N8nWorkflowStatus> = {}

    for (const nombre of WORKFLOW_NAMES) {
      const wf = wfList.find((w) => w.name === nombre)
      if (!wf) {
        workflows[nombre] = { ...SIN_DATOS, errores: "workflow no encontrado" }
        continue
      }
      const erroresWf = exList
        .filter((e) => e.workflowId === wf.id)
        .sort((a, b) => new Date(b.stoppedAt ?? b.startedAt).getTime() - new Date(a.stoppedAt ?? a.startedAt).getTime())

      const en24h = erroresWf.filter((e) => new Date(e.stoppedAt ?? e.startedAt).getTime() >= hace24hMs).length
      errores24h += en24h

      let estado: Semaforo
      if (en24h > 0) estado = "rojo"
      else if (erroresWf.length > 0) {
        estado = "amarillo"
        hayHistoricos = true
      } else estado = "verde"

      const ultimo = erroresWf[0]
      workflows[nombre] = {
        estado,
        errores: `${erroresWf.length} errores`,
        ultimo_error: ultimo ? formatUltimoError(ultimo.stoppedAt ?? ultimo.startedAt) : "sin errores recientes",
        causa: "",
        correccion: "",
      }
    }

    const sub: Semaforo = !vivo || errores24h > 0 ? "rojo" : hayHistoricos ? "amarillo" : "verde"

    return {
      vivo,
      errores24h,
      workflows,
      nota: `Errores históricos (${errores24h} en 24h). Si son viejos pueden estar ya corregidos; el chequeo diario lo revalida.`,
      sub,
    }
  } catch {
    const workflows: Record<string, N8nWorkflowStatus> = {}
    for (const nombre of WORKFLOW_NAMES) workflows[nombre] = SIN_DATOS
    return {
      vivo: false,
      errores24h: 0,
      workflows,
      nota: "no disponible",
      sub: "gris",
    }
  }
}
