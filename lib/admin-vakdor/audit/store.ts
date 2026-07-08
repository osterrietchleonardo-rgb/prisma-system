import { getAdminDb } from "@/lib/admin-vakdor/logger"
import type { AuditSnapshot } from "./types"

/** Inserta un snapshot nuevo (se guarda historial; la página lee el último por experto+scope). */
export async function guardarSnapshot(snap: AuditSnapshot): Promise<void> {
  const db = getAdminDb()
  const { error } = await db.from("audit_snapshots").insert({
    experto: snap.experto,
    scope: snap.scope,
    semaforo: snap.semaforo,
    resumen: snap.resumen,
    metricas: snap.metricas,
    run_at: new Date().toISOString(),
  })
  if (error) throw new Error(`guardarSnapshot(${snap.experto}/${snap.scope}): ${error.message}`)
}
