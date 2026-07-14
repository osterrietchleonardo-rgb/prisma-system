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
export interface WcRow { periodo_mes: string; tipo: string; monto: number; moneda: string }

export interface FinanceData {
  costs: CostRow[]
  pagos: PagoRow[]
  expenses: FinanceExpense[]
  workingCapital: WcRow[]
  fxDe: (mes: string) => number | null
}

// Mapa fijo categoría → renglón del Estado de Resultado clásico.
// Los costos de IA (finance_api_costs) SIEMPRE van a Costo de ventas.
const COGS_CATS = ["infraestructura", "proxy"]
// La Depreciación/Amortización es gasto operativo (baja el EBIT); EBITDA la re-suma.
const OPEX_CATS = ["sueldos", "marketing", "suscripcion", "otro", "depreciacion"]
const FIN_CATS = ["financiero"]
const TAX_CATS = ["impuestos"]
// Depreciación/Amortización (para volver a sumarla en EBITDA).
const DA_CATS = ["depreciacion"]
// CAPEX = inversión, NO gasto del Estado de Resultado. Se excluye del EBIT y de las
// tortas; solo impacta el Flujo de Caja Libre.
export const CAPEX_CATS = ["capex"]

// Signo del capital de trabajo (WC = activos operativos − pasivos operativos).
// + inmoviliza caja (si sube, resta al FCL) · − libera caja (si sube, suma al FCL).
const WC_SIGN: Record<string, number> = { por_cobrar: 1, prepago: 1, por_pagar: -1, anticipo_cliente: -1 }

/** Mes anterior en formato 'YYYY-MM'. */
function prevMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number)
  const d = new Date(y, m - 2, 1) // m-1 = mes actual (0-index); −1 más = mes anterior
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

/** Saldo de capital de trabajo del mes, en USD (con signo por partida). */
function wcTotalUsd(mes: string, wc: WcRow[], fxDe: (m: string) => number | null): number {
  const fx = fxDe(mes)
  let total = 0
  for (const r of wc) {
    if (r.periodo_mes !== mes) continue
    const usd = r.moneda === "ARS" ? (fx ? Number(r.monto) / fx : 0) : Number(r.monto)
    total += (WC_SIGN[r.tipo] ?? 0) * usd
  }
  return total
}

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

const CAT_LABELS: Record<string, string> = {
  infraestructura: "Infraestructura", proxy: "Proxy",
  sueldos: "Sueldos", marketing: "Marketing", suscripcion: "Suscripción", otro: "Otro",
  financiero: "Financiero", impuestos: "Impuestos",
}

/** Desglose (label + monto USD) por categoría, solo las que suman > 0. */
function detalleCategorias(expenses: FinanceExpense[], mes: string, cats: string[], fx: number | null): EstadoResultadoLinea[] {
  return cats
    .map((c) => ({ label: CAT_LABELS[c] || c, monto: gastosUsdPorCategorias(expenses, mes, [c], fx) }))
    .filter((x) => x.monto > 0)
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
    if (CAPEX_CATS.includes(e.categoria)) continue // CAPEX no es gasto operativo
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

export interface EstadoResultadoLinea { label: string; monto: number }

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
  // Desglose de los renglones compuestos (para mostrarlos abiertos en la UI).
  detalle: {
    costoVentas: EstadoResultadoLinea[]
    gastosOperativos: EstadoResultadoLinea[]
  }
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

  const detalle = {
    costoVentas: [
      ...(costosIa > 0 ? [{ label: "Costos de IA", monto: costosIa }] : []),
      ...detalleCategorias(expenses, mes, COGS_CATS, fx),
    ],
    gastosOperativos: detalleCategorias(expenses, mes, OPEX_CATS, fx),
  }

  return {
    ventas, costoVentas, utilidadBruta, gastosOperativos, utilidadOperativa,
    gastosFinancieros, utilidadAntesImpuestos, impuestos, utilidadNeta,
    detalle,
  }
}

export interface EbitdaFcl {
  ventas: number
  utilidadOperativa: number
  depreciacionAmortizacion: number
  ebitda: number
  impuestos: number
  capex: number
  // Δ capital de trabajo del mes = saldo(mes) − saldo(mes anterior), calculado desde
  // finance_working_capital. Con su signo, un Δ positivo RESTA caja al FCL.
  deltaCapitalTrabajo: number
  // FCL final = EBITDA − impuestos − CAPEX − Δ capital de trabajo.
  fcl: number
  // ¿Hay saldos cargados en el mes anterior? (si no, el Δ arranca desde 0 vs vacío).
  wcTieneMesPrevio: boolean
}

/** EBITDA y Flujo de Caja Libre del mes (todo en USD). */
export function ebitdaFclDeMes(mes: string, data: FinanceData): EbitdaFcl {
  const er = estadoResultadoDeMes(mes, data)
  const fx = data.fxDe(mes)
  const depreciacionAmortizacion = gastosUsdPorCategorias(data.expenses, mes, DA_CATS, fx)
  const capex = gastosUsdPorCategorias(data.expenses, mes, CAPEX_CATS, fx)
  const ebitda = er.utilidadOperativa + depreciacionAmortizacion

  // Δ capital de trabajo: saldo del mes menos el del mes anterior.
  const prev = prevMes(mes)
  const wcAhora = wcTotalUsd(mes, data.workingCapital, data.fxDe)
  const wcAntes = wcTotalUsd(prev, data.workingCapital, data.fxDe)
  const deltaCapitalTrabajo = wcAhora - wcAntes
  const wcTieneMesPrevio = data.workingCapital.some((r) => r.periodo_mes === prev)

  const fcl = ebitda - er.impuestos - capex - deltaCapitalTrabajo
  return {
    ventas: er.ventas,
    utilidadOperativa: er.utilidadOperativa,
    depreciacionAmortizacion,
    ebitda,
    impuestos: er.impuestos,
    capex,
    deltaCapitalTrabajo,
    fcl,
    wcTieneMesPrevio,
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
  const [costsRes, pagosRes, expensesRes, fxRes, wcRes] = await Promise.all([
    db.from("finance_api_costs").select("fecha, proveedor, costo_usd"),
    db.from("pagos_agencia").select("monto, moneda, periodo_mes, agencia_id"),
    db.from("finance_expenses").select("*").order("fecha_inicio", { ascending: false }),
    db.from("finance_fx").select("periodo_mes, usd_ars"),
    db.from("finance_working_capital").select("periodo_mes, tipo, monto, moneda"),
  ])

  const costs = (costsRes.data || []) as CostRow[]
  const pagos = (pagosRes.data || []) as PagoRow[]
  const expenses = (expensesRes.data || []) as FinanceExpense[]
  const workingCapital = (wcRes.data || []) as WcRow[]
  const fxRows = (fxRes.data || []) as { periodo_mes: string; usd_ars: number }[]

  const fxMap = new Map<string, number>()
  fxRows.forEach((f) => fxMap.set(f.periodo_mes, Number(f.usd_ars)))
  const fxSorted = [...fxRows].sort((a, b) => a.periodo_mes.localeCompare(b.periodo_mes))
  const fxLatest = fxSorted.length ? Number(fxSorted[fxSorted.length - 1].usd_ars) : null
  const fxDe = (mes: string): number | null => fxMap.get(mes) ?? fxLatest

  return { costs, pagos, expenses, workingCapital, fxDe, fxSorted }
}
