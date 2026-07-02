import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"

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

interface Expense {
  id: string
  concepto: string
  categoria: string
  tipo: "fijo" | "variable"
  monto: number
  moneda: "USD" | "ARS"
  recurrencia: "mensual" | "anual" | "unico"
  fecha_inicio: string
  fecha_fin: string | null
  proveedor: string | null
  notas: string | null
  activo: boolean
}

/** Cuánto pesa un gasto en un mes dado (en su propia moneda). 0 si no aplica. */
function gastoDelMes(e: Expense, mes: string): number {
  if (!e.activo) return 0
  const inicio = e.fecha_inicio.slice(0, 7)
  const fin = e.fecha_fin ? e.fecha_fin.slice(0, 7) : null
  if (mes < inicio) return 0
  if (fin && mes > fin) return 0
  if (e.recurrencia === "mensual") return Number(e.monto)
  if (e.recurrencia === "anual") return Number(e.monto) / 12
  if (e.recurrencia === "unico") return inicio === mes ? Number(e.monto) : 0
  return 0
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const { searchParams } = new URL(request.url)
  const now = new Date()
  const mesSel = searchParams.get("mes") || mesKey(now)

  const db = getFreshAdminDb()
  const [costsRes, pagosRes, expensesRes, fxRes] = await Promise.all([
    db.from("finance_api_costs").select("fecha, proveedor, costo_usd"),
    db.from("pagos_agencia").select("monto, moneda, periodo_mes"),
    db.from("finance_expenses").select("*").order("fecha_inicio", { ascending: false }),
    db.from("finance_fx").select("periodo_mes, usd_ars"),
  ])

  const costs = costsRes.data || []
  const pagos = pagosRes.data || []
  const expenses = (expensesRes.data || []) as Expense[]
  const fxRows = fxRes.data || []

  // Mapa de tipo de cambio + fallback al más reciente
  const fxMap = new Map<string, number>()
  fxRows.forEach((f) => fxMap.set(f.periodo_mes, Number(f.usd_ars)))
  const fxSorted = [...fxRows].sort((a, b) => a.periodo_mes.localeCompare(b.periodo_mes))
  const fxLatest = fxSorted.length ? Number(fxSorted[fxSorted.length - 1].usd_ars) : null
  const fxDe = (mes: string): number | null => fxMap.get(mes) ?? fxLatest

  // ---- Cálculo de un mes → todo en USD ----
  function kpisDeMes(mes: string) {
    const fx = fxDe(mes)

    // Ingresos (pagos_agencia) en USD
    let ingresos = 0
    for (const p of pagos) {
      if (p.periodo_mes !== mes) continue
      const monto = Number(p.monto)
      ingresos += p.moneda === "ARS" ? (fx ? monto / fx : 0) : monto
    }

    // Costos de IA (ya en USD)
    const costosIa = costs
      .filter((c) => (c.fecha || "").slice(0, 7) === mes)
      .reduce((s, c) => s + Number(c.costo_usd), 0)

    // Gastos operativos → USD, separados fijo/variable
    let gastosFijos = 0
    let gastosVariables = 0
    for (const e of expenses) {
      const monto = gastoDelMes(e, mes)
      if (!monto) continue
      const usd = e.moneda === "ARS" ? (fx ? monto / fx : 0) : monto
      if (e.tipo === "fijo") gastosFijos += usd
      else gastosVariables += usd
    }

    const costosVariables = costosIa + gastosVariables // COGS variable (escala con el uso)
    const mc = ingresos - costosVariables // margen de contribución
    const ebit = mc - gastosFijos // utilidad operativa (antes de impuestos/intereses)
    const costosTotal = costosIa + gastosVariables + gastosFijos
    const dol = ebit !== 0 ? mc / ebit : null // apalancamiento operativo
    const margenPct = ingresos > 0 ? (ebit / ingresos) * 100 : null

    return { fx, ingresos, costosIa, gastosFijos, gastosVariables, costosVariables, costosTotal, mc, ebit, dol, margenPct }
  }

  const kpis = kpisDeMes(mesSel)

  // Breakdown de costos IA por proveedor (mes seleccionado)
  const provMap = new Map<string, number>()
  costs
    .filter((c) => (c.fecha || "").slice(0, 7) === mesSel)
    .forEach((c) => provMap.set(c.proveedor, (provMap.get(c.proveedor) || 0) + Number(c.costo_usd)))
  const providerBreakdown = [...provMap.entries()].map(([proveedor, costo_usd]) => ({ proveedor, costo_usd }))

  // Breakdown de gastos por categoría (mes seleccionado, en USD)
  const catMap = new Map<string, number>()
  for (const e of expenses) {
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
    const k = kpisDeMes(mes)
    evolucion.push({
      mes,
      ingresos_usd: k.ingresos,
      costos_usd: k.costosTotal,
      ebit_usd: k.ebit,
      fx: k.fx,
    })
  }

  return NextResponse.json({
    mesSel,
    fxPeriodo: kpis.fx,
    fxFalta: kpis.fx === null,
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
    providerBreakdown,
    categoriaBreakdown,
    evolucion,
    expenses,
    fxList: fxSorted,
  })
}
