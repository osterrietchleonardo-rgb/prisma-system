// Orquestador Experto 2 — Salud del sistema: junta EasyPanel + n8n + GitHub Actions +
// dead-letters en un solo snapshot global. El jsonb respeta EXACTO las claves que ya
// lee components/admin-vakdor/audit-section.tsx (grupos, n8n_workflows, n8n_nota, sub_semaforos).
import { getAdminDb } from "@/lib/admin-vakdor/logger"
import { peorSemaforo, type AuditSnapshot, type Semaforo } from "./types"
import { getEasypanelHealth } from "./sources/easypanel"
import { getN8nHealth } from "./sources/n8n"
import { getGithubActions } from "./sources/github"

const NO_CONSULTADO = { Estado: "no consultado (Fase 2)" }

/** Mensajes pendientes en la cola muerta de n8n (webhooks que nunca entraron a memoria). */
async function contarDeadLetters(): Promise<number | null> {
  try {
    const db = getAdminDb()
    const { count, error } = await db
      .from("wa_n8n_dead_letter")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending")
    if (error) throw new Error(error.message)
    return count ?? 0
  } catch {
    return null // no rompe la corrida; se muestra "no disponible"
  }
}

/** Snapshot global de salud del sistema (scope "global"). */
export async function auditarSistema(): Promise<AuditSnapshot> {
  const [easypanel, n8n, github, deadLetters] = await Promise.all([
    getEasypanelHealth(),
    getN8nHealth(),
    getGithubActions(),
    contarDeadLetters(),
  ])

  const grupos: Record<string, Record<string, string>> = {
    "n8n": {
      "Contenedor": easypanel.servicios["n8n"] ?? "no disponible",
      "API": n8n.vivo ? "activo" : "caído",
      "Errores 24h": String(n8n.errores24h),
      "Dead-letters pendientes": deadLetters !== null ? String(deadLetters) : "no disponible",
    },
    "evolution-api": { "Contenedor": easypanel.servicios["evolution-api"] ?? "no disponible" },
    "roomix-worker": { "Contenedor": easypanel.servicios["roomix-worker"] ?? "no disponible" },
    "acm-extractor": { "Contenedor": easypanel.servicios["acm-extractor"] ?? "no disponible" },
    "redis": { "Contenedor": easypanel.servicios["redis"] ?? "no disponible" },
    "Supabase": { ...NO_CONSULTADO },
    "GitHub Actions": github.runs,
    "Vercel": { ...NO_CONSULTADO },
    "Cloudflare": { ...NO_CONSULTADO },
  }

  const sub_semaforos: Record<string, Semaforo> = {
    easypanel: easypanel.sub,
    n8n: n8n.sub,
    github: github.sub,
  }

  const semaforo = peorSemaforo(Object.values(sub_semaforos))

  return {
    experto: "sistema",
    scope: "global",
    semaforo,
    resumen: "", // lo completa el endpoint con narrate
    metricas: {
      grupos,
      n8n_workflows: n8n.workflows,
      n8n_nota: n8n.nota,
      sub_semaforos,
    },
  }
}
