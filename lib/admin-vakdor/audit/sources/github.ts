// Fuente: GitHub Actions del repo prisma-system — último run de cada workflow.
import { type Semaforo } from "@/lib/admin-vakdor/audit/types"

const REPO = "osterrietchleonardo-rgb/prisma-system"

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

interface GhWorkflowRun {
  name: string
  conclusion: string | null
  status: string
  created_at: string
}

function formatFecha(iso: string): string {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, "0")
  return `${dd}-${MESES[d.getMonth()]}`
}

function formatEstado(conclusion: string | null, status: string): string {
  if (conclusion === "success") return "ok"
  if (conclusion === "failure") return "falló"
  if (conclusion) return conclusion
  return status === "in_progress" || status === "queued" ? "en curso" : "sin datos"
}

export async function getGithubActions(): Promise<{ runs: Record<string, string>; sub: Semaforo }> {
  try {
    const token = process.env.GH_TOKEN
    if (!token) throw new Error("Falta GH_TOKEN")
    const res = await fetch(`https://api.github.com/repos/${REPO}/actions/runs?per_page=25`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
      cache: "no-store",
    })
    if (!res.ok) throw new Error(`github actions -> ${res.status}`)
    const data = await res.json()
    const runsList: GhWorkflowRun[] = data?.workflow_runs ?? []

    // Agrupar por nombre de workflow, quedarse con el más reciente por created_at.
    const ultimoPorWorkflow = new Map<string, GhWorkflowRun>()
    for (const run of runsList) {
      const actual = ultimoPorWorkflow.get(run.name)
      if (!actual || new Date(run.created_at).getTime() > new Date(actual.created_at).getTime()) {
        ultimoPorWorkflow.set(run.name, run)
      }
    }

    const runs: Record<string, string> = {}
    let algunaFalla = false
    for (const [nombre, run] of ultimoPorWorkflow) {
      const estado = formatEstado(run.conclusion, run.status)
      if (run.conclusion === "failure") algunaFalla = true
      runs[nombre] = `${estado} · ${formatFecha(run.created_at)}`
    }

    return { runs, sub: algunaFalla ? "rojo" : "verde" }
  } catch {
    return { runs: { "GitHub Actions": "no disponible" }, sub: "gris" }
  }
}
