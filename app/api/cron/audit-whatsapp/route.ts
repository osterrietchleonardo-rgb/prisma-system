import { NextResponse } from "next/server"
import { auditarWhatsapp } from "@/lib/admin-vakdor/audit/whatsapp"
import { redactarResumen } from "@/lib/admin-vakdor/audit/narrate"
import { guardarSnapshot } from "@/lib/admin-vakdor/audit/store"

export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization")
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const snaps = await auditarWhatsapp()
    for (const s of snaps) {
      s.resumen = await redactarResumen("WhatsApp", s.metricas, s.semaforo)
      await guardarSnapshot(s)
    }
    return NextResponse.json({
      ok: true,
      filas: snaps.length,
      resumen: snaps.map((s) => ({ scope: s.scope, semaforo: s.semaforo })),
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
