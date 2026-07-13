// Cálculo de métricas financieras (admin-vakdor).
// Las funciones de cómputo son PURAS: reciben las filas ya leídas de la BD.
// `loadFinanceData` es el único punto que toca la base (recibe el client).
// Se usa desde la ruta de métricas y desde el endpoint de análisis IA, para que
// ambos partan EXACTAMENTE de los mismos números.

export interface FinanceExpense {
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

export interface CostRow { fecha: string; proveedor: string; costo_usd: number }
export interface PagoRow { monto: number; moneda: string; periodo_mes: string; agencia_id?: string }

export interface FinanceData {
  costs: CostRow[]
  pagos: PagoRow[]
  expenses: FinanceExpense[]
  fxDe: (mes: string) => number | null
}

// Mapa fijo categoría → renglón del Estado de Resultado clásico.
// Los costos de IA (finance_api_costs) SIEMPRE van a Costo de ventas.
const COGS_CATS = ["infraestructura", "proxy"]
const OPEX_CATS = ["sueldos", "marketing", "suscripcion", "otro"]
const FIN_CATS = ["financiero"]
const TAX_CATS = ["impuestos"]

/** Cuánto pesa un gasto en un mes dado (en su propia moneda). 0 si no aplica. */
export function gastoDelMes(e: FinanceExpense, mes: string): number {
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

/** Suma en USD del mes de los gastos de un conjunto de categorías. */
function gastosUsdPorCategorias(expenses: FinanceExpense[], mes: string, cats: string[], fx: number | null): number {
  let total = 0
  for (const e of expenses) {
    if (!cats.includes(e.categoria)) continue
    const monto = gastoDelMes(e, mes)
    if (!monto) continue
    total += e.moneda === "ARS" ? (fx ? monto / fx : 0) : monto
  }
  return total
}

/** KPIs del mes → todo en USD (idéntico al cálculo histórico de la ruta). */
export function kpisDeMes(mes: string, { costs, pagos, expenses, fxDe }: FinanceData) {
  const fx = fxDe(mes)

  let ingresos = 0
  for (const p of pagos) {
    if (p.periodo_mes !== mes) continue
    const monto = Number(p.monto)
    ingresos += p.moneda === "ARS" ? (fx ? monto / fx : 0) : monto
  }

  const costosIa = costs
    .filter((c) => (c.fecha || "").slice(0, 7) === mes)
    .reduce((s, c) => s + Number(c.costo_usd), 0)

  let gastosFijos = 0
  let gastosVariables = 0
  for (const e of expenses) {
    const monto = gastoDelMes(e, mes)
    if (!monto) continue
    const usd = e.moneda === "ARS" ? (fx ? monto / fx : 0) : monto
    if (e.tipo === "fijo") gastosFijos += usd
    else gastosVariables += usd
  }

  const costosVariables = costosIa + gastosVariables
  const mc = ingresos - costosVariables
  const ebit = mc - gastosFijos
  const costosTotal = costosIa + gastosVariables + gastosFijos
  const dol = ebit !== 0 ? mc / ebit : null
  const margenPct = ingresos > 0 ? (ebit / ingresos) * 100 : null

  return { fx, ingresos, costosIa, gastosFijos, gastosVariables, costosVariables, costosTotal, mc, ebit, dol, margenPct }
}

export interface EstadoResultado {
  ventas: number
  costoVentas: number
  utilidadBruta: number
  gastosOperativos: number
  utilidadOperativa: number
  gastosFinancieros: number
  utilidadAntesImpuestos: number
  impuestos: number
  utilidadNeta: number
}

/** Estado de Resultado clásico del mes (todo en USD). */
export function estadoResultadoDeMes(mes: string, data: FinanceData): EstadoResultado {
  const { costs, pagos, expenses, fxDe } = data
  const fx = fxDe(mes)

  let ventas = 0
  for (const p of pagos) {
    if (p.periodo_mes !== mes) continue
    const monto = Number(p.monto)
    ventas += p.moneda === "ARS" ? (fx ? monto / fx : 0) : monto
  }

  const costosIa = costs
    .filter((c) => (c.fecha || "").slice(0, 7) === mes)
    .reduce((s, c) => s + Number(c.costo_usd), 0)

  const costoVentas = costosIa + gastosUsdPorCategorias(expenses, mes, COGS_CATS, fx)
  const utilidadBruta = ventas - costoVentas
  const gastosOperativos = gastosUsdPorCategorias(expenses, mes, OPEX_CATS, fx)
  const utilidadOperativa = utilidadBruta - gastosOperativos
  const gastosFinancieros = gastosUsdPorCategorias(expenses, mes, FIN_CATS, fx)
  const utilidadAntesImpuestos = utilidadOperativa - gastosFinancieros
  const impuestos = gastosUsdPorCategorias(expenses, mes, TAX_CATS, fx)
  const utilidadNeta = utilidadAntesImpuestos - impuestos

  return {
    ventas, costoVentas, utilidadBruta, gastosOperativos, utilidadOperativa,
    gastosFinancieros, utilidadAntesImpuestos, impuestos, utilidadNeta,
  }
}

/** Cantidad de agencias distintas con un pago en el mes. */
export function nAgenciasPagando(mes: string, pagos: PagoRow[]): number {
  const set = new Set<string>()
  for (const p of pagos) {
    if (p.periodo_mes === mes && p.agencia_id) set.add(p.agencia_id)
  }
  return set.size
}

/** Lee las 4 tablas de finanzas y arma FinanceData + fxSorted (para fxList). */
export async function loadFinanceData(db: any): Promise<FinanceData & { fxSorted: { periodo_mes: string; usd_ars: number }[] }> {
  const [costsRes, pagosRes, expensesRes, fxRes] = await Promise.all([
    db.from("finance_api_costs").select("fecha, proveedor, costo_usd"),
    db.from("pagos_agencia").select("monto, moneda, periodo_mes, agencia_id"),
    db.from("finance_expenses").select("*").order("fecha_inicio", { ascending: false }),
    db.from("finance_fx").select("periodo_mes, usd_ars"),
  ])

  const costs = (costsRes.data || []) as CostRow[]
  const pagos = (pagosRes.data || []) as PagoRow[]
  const expenses = (expensesRes.data || []) as FinanceExpense[]
  const fxRows = (fxRes.data || []) as { periodo_mes: string; usd_ars: number }[]

  const fxMap = new Map<string, number>()
  fxRows.forEach((f) => fxMap.set(f.periodo_mes, Number(f.usd_ars)))
  const fxSorted = [...fxRows].sort((a, b) => a.periodo_mes.localeCompare(b.periodo_mes))
  const fxLatest = fxSorted.length ? Number(fxSorted[fxSorted.length - 1].usd_ars) : null
  const fxDe = (mes: string): number | null => fxMap.get(mes) ?? fxLatest

  return { costs, pagos, expenses, fxDe, fxSorted }
}
