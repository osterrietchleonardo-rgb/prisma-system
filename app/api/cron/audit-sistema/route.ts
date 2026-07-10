import { NextResponse } from "next/server"
import { assertCron } from "@/lib/admin-vakdor/cron-auth"
import { auditarSistema } from "@/lib/admin-vakdor/audit/sistema"
import { redactarResumen } from "@/lib/admin-vakdor/audit/narrate"
import { guardarSnapshot } from "@/lib/admin-vakdor/audit/store"

export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function GET(req: Request) {
  const denied = assertCron(req)
  if (denied) return denied
  try {
    const s = await auditarSistema()
    s.resumen = await redactarResumen("Salud del sistema", s.metricas, s.semaforo)
    await guardarSnapshot(s)
    return NextResponse.json({ ok: true, semaforo: s.semaforo })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
