import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import {
  loadFinanceData,
  kpisDeMes,
  estadoResultadoDeMes,
  ebitdaFclDeMes,
  nAgenciasPagando,
  gastoDelMes,
  CAPEX_CATS,
} from "@/lib/admin-vakdor/finance/metrics"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

// Cliente service-role SIN caché de fetch: Next 14 cachea los GET de supabase-js
// por defecto y congelaba lecturas vacías (los gastos recién agregados no aparecían).
function getFreshAdminDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: "no-store" }) },
    }
  )
}

// 'YYYY-MM' de una fecha
const mesKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`

export async function GET(request: NextRequest) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const { searchParams } = new URL(request.url)
  const now = new Date()
  const mesSel = searchParams.get("mes") || mesKey(now)

  const db = getFreshAdminDb()
  const data = await loadFinanceData(db)
  const { costs, expenses, pagos, fxDe, fxSorted } = data

  // Último análisis IA guardado del mes (para mostrarlo sin re-llamar a la IA).
  const analisisRes = await db.from("finance_ai_analysis").select("*").eq("mes", mesSel).maybeSingle()

  const kpis = kpisDeMes(mesSel, data)

  // Breakdown de costos IA por proveedor (mes seleccionado)
  const provMap = new Map<string, number>()
  costs
    .filter((c) => (c.fecha || "").slice(0, 7) === mesSel)
    .forEach((c) => provMap.set(c.proveedor, (provMap.get(c.proveedor) || 0) + Number(c.costo_usd)))
  const providerBreakdown = [...provMap.entries()].map(([proveedor, costo_usd]) => ({ proveedor, costo_usd }))

  // Breakdown de gastos por categoría (mes seleccionado, en USD)
  const catMap = new Map<string, number>()
  for (const e of expenses) {
    if (CAPEX_CATS.includes(e.categoria)) continue // CAPEX no es gasto operativo
    const monto = gastoDelMes(e, mesSel)
    if (!monto) continue
    const usd = e.moneda === "ARS" ? (kpis.fx ? monto / kpis.fx : 0) : monto
    catMap.set(e.categoria, (catMap.get(e.categoria) || 0) + usd)
  }
  const categoriaBreakdown = [...catMap.entries()].map(([categoria, monto_usd]) => ({ categoria, monto_usd }))

  // Evolución últimos 12 meses
  const evolucion = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const mes = mesKey(d)
    const k = kpisDeMes(mes, data)
    evolucion.push({
      mes,
      ingresos_usd: k.ingresos,
      costos_usd: k.costosTotal,
      ebit_usd: k.ebit,
      fx: k.fx,
    })
  }

  const estadoResultado = estadoResultadoDeMes(mesSel, data)
  const ebitdaFcl = ebitdaFclDeMes(mesSel, data)

  return NextResponse.json({
    mesSel,
    fxPeriodo: kpis.fx,
    fxFalta: kpis.fx === null,
    fxLive: data.fxLive,
    kpisUsd: {
      ingresos: kpis.ingresos,
      costosIa: kpis.costosIa,
      gastosFijos: kpis.gastosFijos,
      gastosVariables: kpis.gastosVariables,
      costosTotal: kpis.costosTotal,
      mc: kpis.mc,
      ebit: kpis.ebit,
      dol: kpis.dol,
      margenPct: kpis.margenPct,
    },
    estadoResultado,
    ebitdaFcl,
    nAgenciasPagando: nAgenciasPagando(mesSel, pagos),
    providerBreakdown,
    categoriaBreakdown,
    evolucion,
    expenses,
    fxList: fxSorted,
    ultimoAnalisis: analisisRes.data
      ? { contenido: analisisRes.data.contenido, generated_at: analisisRes.data.generated_at, modelo: analisisRes.data.modelo }
      : null,
  })
}
