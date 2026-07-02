import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { syncApiCosts } from "@/lib/admin-vakdor/finance/sync"

// La sync puede tardar (varias páginas por proveedor). Damos aire.
export const maxDuration = 60
export const dynamic = "force-dynamic"

/**
 * POST /api/admin-vakdor/finance/sync?days=3
 * Sincroniza los costos reales de las cost APIs hacia finance_api_costs.
 * Uso: botón "Sincronizar" del panel (autoriza por cookie admin-vakdor).
 * El cron automático 2×/día vive aparte en /api/cron/finance-sync (usa CRON_SECRET).
 * Por defecto re-sincroniza los últimos 3 días (idempotente) para capturar datos tardíos.
 */
function isCronAuthorized(request: NextRequest): boolean {
  const secret = process.env.FINANCE_CRON_SECRET
  if (!secret) return false
  const header = request.headers.get("authorization") ?? request.headers.get("x-cron-secret") ?? ""
  const token = header.replace(/^Bearer\s+/i, "").trim()
  return token.length > 0 && token === secret
}

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    const auth = await requireAdminVakdor(request)
    if (isNextResponse(auth)) return auth
  }

  const { searchParams } = new URL(request.url)
  // default 3 (re-sync idempotente diario); tope alto para permitir backfill histórico puntual.
  const days = Math.min(Math.max(Number(searchParams.get("days") ?? 3) || 3, 1), 400)
  const to = new Date()
  const from = new Date(to.getTime() - days * 86400 * 1000)

  const results = await syncApiCosts(from, to)
  const totalUsd = results.reduce((s, r) => s + r.costo_usd, 0)

  return NextResponse.json({
    desde: from.toISOString().slice(0, 10),
    hasta: to.toISOString().slice(0, 10),
    total_usd: Number(totalUsd.toFixed(4)),
    results,
  })
}
