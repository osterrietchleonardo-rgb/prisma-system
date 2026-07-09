import { getAdminDb } from "@/lib/admin-vakdor/logger"

export interface SnapRow {
  experto: string
  scope: string
  semaforo: string
  resumen: string
  metricas: Record<string, any>
  run_at: string
}

export async function leerSnapshots(): Promise<{ whatsapp: SnapRow[]; sistema: SnapRow | null; redes: SnapRow | null }> {
  const db = getAdminDb()
  const { data, error } = await db
    .from("audit_snapshots")
    .select("experto, scope, semaforo, resumen, metricas, run_at")
    .order("run_at", { ascending: false })
    .limit(200)
  if (error) throw new Error(`leerSnapshots: ${error.message}`)

  const visto = new Set<string>()
  const whatsapp: SnapRow[] = []
  let sistema: SnapRow | null = null
  let redes: SnapRow | null = null
  for (const r of (data ?? []) as SnapRow[]) {
    const key = `${r.experto}:${r.scope}`
    if (visto.has(key)) continue
    visto.add(key)
    if (r.experto === "whatsapp") whatsapp.push(r)
    else if (r.experto === "sistema" && !sistema) sistema = r
    else if (r.experto === "redes" && !redes) redes = r
  }
  return { whatsapp, sistema, redes }
}
