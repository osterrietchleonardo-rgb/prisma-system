import { NextResponse } from "next/server"
import { assertCron } from "@/lib/admin-vakdor/cron-auth"
import { syncApiCosts } from "@/lib/admin-vakdor/finance/sync"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * GET /api/cron/finance-sync?days=7
 * Sincroniza los costos reales (OpenAI + Anthropic + Gemini) hacia finance_api_costs.
 * Mismo patrón que los demás crons: autoriza con el CRON_SECRET ya existente.
 * Lo dispara el workflow tokko-sync.yml (2×/día). days=7 por defecto para cubrir el
 * lag del export de Google y la finalización de costos de los proveedores (upsert idempotente).
 */
export async function GET(req: Request) {
  const denied = assertCron(req)
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const days = Math.min(Math.max(Number(searchParams.get("days") ?? 7) || 7, 1), 400)
  const to = new Date()
  const from = new Date(to.getTime() - days * 86400 * 1000)

  const results = await syncApiCosts(from, to)
  const totalUsd = results.reduce((s, r) => s + r.costo_usd, 0)

  return NextResponse.json({
    ok: true,
    desde: from.toISOString().slice(0, 10),
    hasta: to.toISOString().slice(0, 10),
    total_usd: Number(totalUsd.toFixed(4)),
    results,
  })
}
