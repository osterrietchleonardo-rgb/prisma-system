// Orquestador Experto 2 — Salud del sistema: junta EasyPanel + n8n + GitHub Actions +
// dead-letters en un solo snapshot global. El jsonb respeta EXACTO las claves que ya
// lee components/admin-vakdor/audit-section.tsx (grupos, n8n_workflows, n8n_nota, sub_semaforos).
import { getAdminDb } from "@/lib/admin-vakdor/logger"
import { peorSemaforo, type AuditSnapshot, type Semaforo } from "./types"
import { getEasypanelHealth } from "./sources/easypanel"
import { getN8nHealth } from "./sources/n8n"
import { diagnosticarN8n } from "./sources/n8n-diagnose"
import { getGithubActions } from "./sources/github"
import { getVercelHealth } from "./sources/vercel"
import { getCloudflareHealth } from "./sources/cloudflare"
import { getSupabaseAdvisors } from "./sources/supabase-advisors"

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
  const [easypanel, n8n, github, vercel, cloudflare, supabase, deadLetters] = await Promise.all([
    getEasypanelHealth(),
    getN8nHealth(),
    getGithubActions(),
    getVercelHealth(),
    getCloudflareHealth(),
    getSupabaseAdvisors(),
    contarDeadLetters(),
  ])

  // Diagnóstico de los errores de n8n (causa + corrección) vía Gemini, y merge en los workflows.
  const diag = await diagnosticarN8n(n8n.ultimoErrorId)
  const n8nWorkflows = { ...n8n.workflows }
  for (const [nombre, d] of Object.entries(diag)) {
    if (n8nWorkflows[nombre]) n8nWorkflows[nombre] = { ...n8nWorkflows[nombre], causa: d.causa, correccion: d.correccion }
  }

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
    "Supabase": supabase.kvs,
    "GitHub Actions": github.runs,
    "Vercel": vercel.kvs,
    "Cloudflare": cloudflare.kvs,
  }

  const sub_semaforos: Record<string, Semaforo> = {
    easypanel: easypanel.sub,
    n8n: n8n.sub,
    github: github.sub,
    vercel: vercel.sub,
    cloudflare: cloudflare.sub,
    supabase: supabase.sub,
  }

  const semaforo = peorSemaforo(Object.values(sub_semaforos))

  return {
    experto: "sistema",
    scope: "global",
    semaforo,
    resumen: "", // lo completa el endpoint con narrate
    metricas: {
      grupos,
      n8n_workflows: n8nWorkflows,
      n8n_nota: n8n.nota,
      sub_semaforos,
    },
  }
}
