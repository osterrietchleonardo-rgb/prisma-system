import { NextResponse } from "next/server"
import { assertCron } from "@/lib/admin-vakdor/cron-auth"
import { auditarAgente } from "@/lib/admin-vakdor/audit/agente"
import { guardarSnapshot } from "@/lib/admin-vakdor/audit/store"

export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function GET(req: Request) {
  const denied = assertCron(req)
  if (denied) return denied
  try {
    const snap = await auditarAgente()
    await guardarSnapshot(snap)
    return NextResponse.json({ ok: true, semaforo: snap.semaforo, muestra: snap.metricas.muestra })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
