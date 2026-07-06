import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { getAdminDb } from "@/lib/admin-vakdor/logger"

/**
 * GET /api/admin-vakdor/dashboard/credit-analytics?agency_id=<uuid>
 *
 * Retorna analytics de créditos IA para una agencia (o todas).
 * Auth: JWT admin-vakdor (service-role).
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const db = getAdminDb()
  const agencyId = request.nextUrl.searchParams.get("agency_id")

  // ── Lista de agencias activas (para el selector) ──────────────────────────
  const { data: agencies } = await db
    .from("agencies")
    .select("id, name, estado")
    .or("estado.eq.activo,estado.is.null")
    .order("name")

  if (!agencyId) {
    return NextResponse.json({ agencies: agencies || [], featureCosts: [], userRanking: [], creditConfig: null })
  }

  // ── Credit config de la agencia ───────────────────────────────────────────
  const [creditConfigRes, asesorCountRes] = await Promise.all([
    db.from("agency_ai_credits").select("*").eq("agency_id", agencyId).maybeSingle(),
    db.from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("agency_id", agencyId)
      .eq("role", "asesor")
      .eq("estado", "activo"),
  ])

  const creditConfig = creditConfigRes.data
  const numAsesores = asesorCountRes.count ?? 0

  // ── Transacciones con join a profiles y agencies ──────────────────────────
  const { data: transactions } = await db
    .from("ai_credit_transactions")
    .select("user_id, feature, credits_consumed, usd_cost, input_tokens, output_tokens, created_at")
    .eq("agency_id", agencyId)
    .order("created_at", { ascending: false })

  // ── Usuarios de la agencia ────────────────────────────────────────────────
  const { data: profiles } = await db
    .from("profiles")
    .select("id, full_name, email, role, estado")
    .eq("agency_id", agencyId)
    .order("full_name")

  const agencyName = (agencies || []).find(a => a.id === agencyId)?.name || "Desconocida"
  const txs = transactions || []
  const profs = profiles || []

  // ── Costo por feature ─────────────────────────────────────────────────────
  const featureMap: Record<string, { usos: number; credits: number; usd: number; inputTokens: number; outputTokens: number }> = {}
  for (const t of txs) {
    const f = t.feature || "general"
    if (!featureMap[f]) featureMap[f] = { usos: 0, credits: 0, usd: 0, inputTokens: 0, outputTokens: 0 }
    featureMap[f].usos += 1
    featureMap[f].credits += t.credits_consumed ?? 0
    featureMap[f].usd += Number(t.usd_cost ?? 0)
    featureMap[f].inputTokens += t.input_tokens ?? 0
    featureMap[f].outputTokens += t.output_tokens ?? 0
  }
  const featureCosts = Object.entries(featureMap)
    .map(([feature, d]) => ({ feature, ...d, usdPerCredit: d.credits > 0 ? d.usd / d.credits : 0 }))
    .sort((a, b) => b.credits - a.credits)

  // ── Ranking por usuario ───────────────────────────────────────────────────
  const userMap: Record<string, { full_name: string; email: string; role: string; credits: number; usd: number; featureBreakdown: Record<string, number> }> = {}
  for (const t of txs) {
    if (!userMap[t.user_id]) {
      const prof = profs.find(p => p.id === t.user_id)
      userMap[t.user_id] = {
        full_name: prof?.full_name || "Desconocido",
        email: prof?.email || "",
        role: prof?.role || "asesor",
        credits: 0,
        usd: 0,
        featureBreakdown: {},
      }
    }
    userMap[t.user_id].credits += t.credits_consumed ?? 0
    userMap[t.user_id].usd += Number(t.usd_cost ?? 0)
    const feat = t.feature || "general"
    userMap[t.user_id].featureBreakdown[feat] = (userMap[t.user_id].featureBreakdown[feat] || 0) + (t.credits_consumed ?? 0)
  }

  const userRanking = Object.values(userMap)
    .map(u => ({
      ...u,
      agency_name: agencyName,
      features: Object.entries(u.featureBreakdown)
        .sort(([, a], [, b]) => b - a)
        .map(([f, c]) => `${f}(${c})`)
        .join(", "),
    }))
    .sort((a, b) => b.credits - a.credits)

  // ── Usuarios sin consumo ──────────────────────────────────────────────────
  const usersWithUsage = new Set(txs.map(t => t.user_id))
  const inactiveCount = profs.filter(p => !usersWithUsage.has(p.id)).length

  return NextResponse.json({
    agencies: agencies || [],
    featureCosts,
    userRanking,
    creditConfig: creditConfig
      ? {
          credits_total: creditConfig.credits_total ?? 0,
          credits_director: creditConfig.credits_director ?? 0,
          credits_asesores: creditConfig.credits_asesores ?? 0,
          credits_used: creditConfig.credits_used ?? 0,
        }
      : null,
    meta: {
      agencyName,
      numAsesores,
      totalUsers: profs.length,
      activeUsers: usersWithUsage.size,
      inactiveUsers: inactiveCount,
      totalCreditsUsed: txs.reduce((s, t) => s + (t.credits_consumed ?? 0), 0),
      totalUsd: txs.reduce((s, t) => s + Number(t.usd_cost ?? 0), 0),
    },
  })
}
