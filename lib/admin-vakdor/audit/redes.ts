// Orquestador Experto 3 — Redes / SEO / Meta: junta Buffer (orgánico) + Clarity (UX) +
// Google Analytics/Search Console en un solo snapshot global. El jsonb respeta EXACTO
// las claves que ya lee components/admin-vakdor/audit-section.tsx (grupos, sub_semaforos).
import { peorSemaforo, type AuditSnapshot, type Semaforo } from "./types"
import { getBufferMetrics } from "./sources/buffer"
import { getClarityInsights } from "./sources/clarity"
import { getGoogleTraffic } from "./sources/google"
import { getMetaAds } from "./sources/meta"

/** Snapshot global de redes/SEO (scope "global"). */
export async function auditarRedes(): Promise<AuditSnapshot> {
  const [buffer, clarity, google, meta] = await Promise.all([
    getBufferMetrics(),
    getClarityInsights(),
    getGoogleTraffic(),
    getMetaAds(),
  ])

  const grupos: Record<string, Record<string, string>> = {
    ...buffer.grupos,
    "Meta Ads": meta.kvs,
    "Google Analytics (7d)": google.ga,
    "Search Console (7d)": google.gsc,
    "Clarity (3d)": clarity.kvs,
  }

  const sub_semaforos: Record<string, Semaforo> = {
    buffer: buffer.sub,
    clarity: clarity.sub,
    google_analytics: google.subGa,
    search_console: google.subGsc,
    meta: meta.sub,
  }

  const semaforo = peorSemaforo(Object.values(sub_semaforos))

  return {
    experto: "redes",
    scope: "global",
    semaforo,
    resumen: "", // lo completa el endpoint con narrate
    metricas: { grupos, sub_semaforos },
  }
}
