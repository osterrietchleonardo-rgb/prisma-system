import { NextResponse } from "next/server"
import { auditarAgente } from "@/lib/admin-vakdor/audit/agente"
import { guardarSnapshot } from "@/lib/admin-vakdor/audit/store"

export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization")
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const snap = await auditarAgente()
    await guardarSnapshot(snap)
    return NextResponse.json({ ok: true, semaforo: snap.semaforo, muestra: snap.metricas.muestra })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
