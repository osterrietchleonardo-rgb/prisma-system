import { NextResponse } from "next/server"
import { enviarMailMetricas } from "@/lib/admin-vakdor/audit/notify"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization")
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  // Guard: sólo manda mail en la corrida de las 10 UTC (07:00 AR). ?force=1 para probar.
  const { searchParams } = new URL(req.url)
  const force = searchParams.get("force") === "1"
  const horaUtc = new Date().getUTCHours()
  if (!force && horaUtc !== 10) {
    return NextResponse.json({ ok: true, enviado: false, motivo: `corrida ${horaUtc}h UTC, no es la del mail` })
  }
  const r = await enviarMailMetricas()
  return NextResponse.json({ ok: true, ...r })
}
