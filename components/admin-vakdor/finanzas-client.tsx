"use client"
import { useEffect, useMemo, useState } from "react"
import DonutChart from "@/components/admin-vakdor/donut-chart"
import FinanceEvolutionChart from "@/components/admin-vakdor/finance-evolution-chart"

// ---------------- tipos ----------------
interface Expense {
  id: string; concepto: string; categoria: string; tipo: "fijo" | "variable"
  monto: number; moneda: "USD" | "ARS"; recurrencia: "mensual" | "anual" | "unico"
  fecha_inicio: string; fecha_fin: string | null; proveedor: string | null; notas: string | null; activo: boolean
}
interface EstadoResultado {
  ventas: number; costoVentas: number; utilidadBruta: number; gastosOperativos: number
  utilidadOperativa: number; gastosFinancieros: number; utilidadAntesImpuestos: number
  impuestos: number; utilidadNeta: number
  detalle: {
    costoVentas: { label: string; monto: number }[]
    gastosOperativos: { label: string; monto: number }[]
  }
}
interface AnalisisIA {
  diagnostico: string; mejoras: string[]; optimizacion_costos: string[]
  proximos_pasos: string[]; riesgos: string[]
}
interface AnalisisGuardado { contenido: AnalisisIA; generated_at: string; modelo: string }
interface Metricas {
  mesSel: string
  fxPeriodo: number | null
  fxFalta: boolean
  kpisUsd: {
    ingresos: number; costosIa: number; gastosFijos: number; gastosVariables: number
    costosTotal: number; mc: number; ebit: number; dol: number | null; margenPct: number | null
  }
  estadoResultado: EstadoResultado
  nAgenciasPagando: number
  providerBreakdown: { proveedor: string; costo_usd: number }[]
  categoriaBreakdown: { categoria: string; monto_usd: number }[]
  evolucion: { mes: string; ingresos_usd: number; costos_usd: number; ebit_usd: number; fx: number | null }[]
  expenses: Expense[]
  fxList: { periodo_mes: string; usd_ars: number }[]
  ultimoAnalisis: AnalisisGuardado | null
}

// ---------------- helpers ----------------
const PROV_LABEL: Record<string, string> = { openai: "OpenAI", anthropic: "Anthropic", google: "Gemini" }
const PROV_COLOR: Record<string, string> = { openai: "#10b981", anthropic: "#B87333", google: "#6366f1" }
const CAT_LABEL: Record<string, string> = { suscripcion: "Suscripción", infraestructura: "Infraestructura", proxy: "Proxy", marketing: "Marketing", sueldos: "Sueldos", impuestos: "Impuestos", financiero: "Financiero", otro: "Otro" }
const CAT_COLORS = ["#6366f1", "#8b5cf6", "#a78bfa", "#B87333", "#e29e6d", "#10b981", "#64748b"]

function mesLabel(mes: string) {
  const [y, m] = mes.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString("es-AR", { month: "short", year: "2-digit" })
}
function ultimosMeses(n: number): string[] {
  const out: string[] = []
  const now = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)
  }
  return out
}

// SVG icon minimal (24x24 stroke)
function Icon({ d, color = "currentColor", size = 16 }: { d: string; color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}
const ICONS = {
  ingresos: "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  costos: "M3 3v18h18M7 14l4-4 4 4 5-6",
  utilidad: "M23 6l-9.5 9.5-5-5L1 18M17 6h6v6",
  margen: "M20 12V8H6a2 2 0 0 1 0-4h12v4M4 6v12a2 2 0 0 0 2 2h14v-4M18 12a2 2 0 0 0 0 4h4v-4z",
  ia: "M12 2a4 4 0 0 0-4 4 4 4 0 0 0-1 7.9M12 2a4 4 0 0 1 4 4 4 4 0 0 1 1 7.9M8 13.9V18a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-4.1",
  palanca: "M3 12h4l3-9 4 18 3-9h4",
  sync: "M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15",
  plus: "M12 5v14M5 12h14",
  trash: "M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6",
  edit: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z",
}

const card: React.CSSProperties = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12 }
const inputStyle: React.CSSProperties = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#fff", fontSize: 12, padding: "7px 9px", outline: "none" }

// ---------------- KPI card ----------------
function StatCard({ label, value, sub, color, iconPath, big }: { label: string; value: string; sub?: string; color: string; iconPath: string; big?: boolean }) {
  return (
    <div style={{ ...card, padding: "18px 20px", borderTop: `3px solid ${color}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ color, display: "flex" }}><Icon d={iconPath} color={color} size={16} /></span>
        <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>{label}</span>
      </div>
      <div style={{ fontSize: big ? 26 : 22, fontWeight: 700, color: "#fff", lineHeight: 1.1, letterSpacing: "-0.02em" }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

const EMPTY_FORM = { id: "", concepto: "", categoria: "suscripcion", tipo: "fijo", monto: "", moneda: "USD", recurrencia: "mensual", fecha_inicio: new Date().toISOString().slice(0, 10), proveedor: "" }

export default function FinanzasClient() {
  const [data, setData] = useState<Metricas | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [mesSel, setMesSel] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` })
  const [moneda, setMoneda] = useState<"USD" | "ARS">("USD")
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState("")
  const [analyzing, setAnalyzing] = useState(false)
  const [analisis, setAnalisis] = useState<AnalisisGuardado | null>(null)
  // Simulador de punto de equilibrio: null = usar datos reales; objeto = valores editados.
  const [beOverride, setBeOverride] = useState<{ precio: string; costo: string; fijos: string } | null>(null)

  // form gasto
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<typeof EMPTY_FORM>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // fx editor
  const [fxInput, setFxInput] = useState("")

  async function load(mes: string) {
    setLoading(true)
    try {
      const r = await fetch(`/api/admin-vakdor/finance/metricas?mes=${mes}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Error")
      setData(d); setError("")
      setAnalisis(d.ultimoAnalisis || null)
      setBeOverride(null)
    } catch (e) { setError(e instanceof Error ? e.message : "Error cargando finanzas") }
    setLoading(false)
  }
  useEffect(() => { load(mesSel) }, [mesSel])

  const fx = data?.fxPeriodo ?? null
  const simbolo = moneda === "USD" ? "US$" : "$"

  // convierte un valor USD a la moneda elegida usando un fx dado
  function conv(usd: number, fxUse: number | null = fx): number {
    if (moneda === "USD") return usd
    return fxUse ? usd * fxUse : NaN
  }
  function money(usd: number, fxUse: number | null = fx): string {
    const v = conv(usd, fxUse)
    if (!Number.isFinite(v)) return "—"
    return `${simbolo}${v.toLocaleString("es-AR", { maximumFractionDigits: v >= 100 ? 0 : 2 })}`
  }

  const k = data?.kpisUsd
  const evoData = useMemo(() => (data?.evolucion || []).map((e) => ({
    label: mesLabel(e.mes),
    ingresos: conv(e.ingresos_usd, e.fx),
    costos: conv(e.costos_usd, e.fx),
  })).map((e) => ({ label: e.label, ingresos: Number.isFinite(e.ingresos) ? e.ingresos : 0, costos: Number.isFinite(e.costos) ? e.costos : 0 })), [data, moneda, fx])

  const provDonut = (data?.providerBreakdown || []).map((p) => ({ label: PROV_LABEL[p.proveedor] || p.proveedor, value: Math.round(p.costo_usd * 10000) / 10000, color: PROV_COLOR[p.proveedor] || "#64748b" })).filter((d) => d.value > 0)
  const catDonut = (data?.categoriaBreakdown || []).map((c, i) => ({ label: CAT_LABEL[c.categoria] || c.categoria, value: Math.round(c.monto_usd * 100) / 100, color: CAT_COLORS[i % CAT_COLORS.length] })).filter((d) => d.value > 0)

  // Botón "Actualizar": 1) trae costos de IA, 2) recarga métricas, 3) corre el
  // análisis del experto IA (Gemini). Los tres pasos, en un solo botón.
  async function actualizar() {
    setSyncing(true); setSyncMsg("")
    try {
      // 1) Costos de IA
      const r = await fetch(`/api/admin-vakdor/finance/sync?days=3`, { method: "POST" })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Error")
      const tot = (d.results || []).map((x: { proveedor: string; ok: boolean }) => `${x.proveedor}${x.ok ? "✓" : "✗"}`).join(" ")
      setSyncMsg(`Costos: ${tot} · analizando con IA…`)

      // 2) Recargar métricas / estado de resultado / punto de equilibrio
      await load(mesSel)

      // 3) Análisis del experto IA
      setAnalyzing(true)
      const ra = await fetch(`/api/admin-vakdor/finance/analisis`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mes: mesSel }),
      })
      if (ra.ok) {
        const da = await ra.json()
        setAnalisis({ contenido: da.contenido, generated_at: da.generated_at, modelo: da.modelo })
        setSyncMsg(`Actualizado · análisis IA listo`)
      } else {
        setSyncMsg(`Actualizado · el análisis IA no se pudo generar (los números están al día)`)
      }
    } catch (e) { setSyncMsg(e instanceof Error ? e.message : "Error") }
    setAnalyzing(false)
    setSyncing(false)
  }

  async function saveExpense() {
    if (!form.concepto.trim() || !form.monto) return
    setSaving(true)
    try {
      const method = form.id ? "PATCH" : "POST"
      const r = await fetch(`/api/admin-vakdor/finance/expenses`, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, monto: Number(form.monto) }),
      })
      if (!r.ok) { const d = await r.json(); throw new Error(d.error) }
      setForm(EMPTY_FORM); setShowForm(false); await load(mesSel)
    } catch (e) { alert(e instanceof Error ? e.message : "Error") }
    setSaving(false)
  }
  async function delExpense(id: string) {
    if (!confirm("¿Eliminar este gasto?")) return
    await fetch(`/api/admin-vakdor/finance/expenses?id=${id}`, { method: "DELETE" })
    await load(mesSel)
  }
  function editExpense(e: Expense) {
    setForm({ id: e.id, concepto: e.concepto, categoria: e.categoria, tipo: e.tipo, monto: String(e.monto), moneda: e.moneda, recurrencia: e.recurrencia, fecha_inicio: e.fecha_inicio.slice(0, 10), proveedor: e.proveedor || "" })
    setShowForm(true)
  }
  async function saveFx() {
    const val = Number(fxInput)
    if (!val || val <= 0) return
    await fetch(`/api/admin-vakdor/finance/fx`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ periodo_mes: mesSel, usd_ars: val }) })
    setFxInput(""); await load(mesSel)
  }

  if (loading && !data) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "rgba(255,255,255,0.4)" }}>Cargando finanzas…</div>
  if (error && !data) return <div style={{ padding: 32, color: "#fca5a5" }}>{error}</div>
  if (!data || !k) return null

  const positivo = k.ebit >= 0
  const meses = ultimosMeses(18)

  const er = data.estadoResultado
  const pctV = (v: number) => (er.ventas > 0 ? (v / er.ventas) * 100 : null)

  // ── Punto de equilibrio (en la moneda elegida) ──
  const cv = (usd: number) => { const v = conv(usd); return Number.isFinite(v) ? v : 0 }
  const nAg = data.nAgenciasPagando
  const bePrecioReal = nAg > 0 ? cv(k.ingresos) / nAg : 0
  const beCostoReal = nAg > 0 ? cv(k.costosIa + k.gastosVariables) / nAg : 0
  const beFijosReal = cv(k.gastosFijos)
  const beRound = (v: number) => Math.round(v).toString()
  const bePrecio = beOverride ? Number(beOverride.precio) || 0 : bePrecioReal
  const beCosto = beOverride ? Number(beOverride.costo) || 0 : beCostoReal
  const beFijos = beOverride ? Number(beOverride.fijos) || 0 : beFijosReal
  const beMcUnit = bePrecio - beCosto
  const bePuntoEq = beMcUnit > 0 ? Math.ceil(beFijos / beMcUnit) : null
  const setBe = (field: "precio" | "costo" | "fijos", val: string) => {
    setBeOverride((prev) => {
      const base = prev ?? { precio: beRound(bePrecioReal), costo: beRound(beCostoReal), fijos: beRound(beFijosReal) }
      return { ...base, [field]: val }
    })
  }

  return (
    <div style={{ padding: "28px 32px", minHeight: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>Finanzas</h1>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: "4px 0 0" }}>Costos reales de IA · gastos · márgenes · rentabilidad</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <select value={mesSel} onChange={(e) => setMesSel(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
            {meses.map((m) => <option key={m} value={m} style={{ background: "#0f1220" }}>{mesLabel(m)}</option>)}
          </select>
          <div style={{ display: "flex", background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: 3, border: "1px solid rgba(255,255,255,0.08)" }}>
            {(["USD", "ARS"] as const).map((mo) => (
              <button key={mo} onClick={() => setMoneda(mo)} style={{
                padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                background: moneda === mo ? "#B87333" : "transparent", color: moneda === mo ? "#fff" : "rgba(255,255,255,0.5)", transition: "all 0.15s",
              }}>{mo}</button>
            ))}
          </div>
          <button onClick={actualizar} disabled={syncing} title="Trae costos de IA, recalcula y corre el análisis del experto IA" style={{
            display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 8, cursor: syncing ? "wait" : "pointer",
            background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", color: "#a5b4fc", fontSize: 12, fontWeight: 600, transition: "all 0.15s",
          }}>
            <span style={{ display: "flex", animation: syncing ? "spin 1s linear infinite" : "none" }}><Icon d={ICONS.sync} color="#a5b4fc" size={14} /></span>
            {syncing ? (analyzing ? "Analizando…" : "Actualizando…") : "Actualizar"}
          </button>
        </div>
      </div>
      {syncMsg && <div style={{ marginBottom: 16, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{syncMsg}</div>}

      {/* Aviso FX faltante en ARS */}
      {moneda === "ARS" && data.fxFalta && (
        <div style={{ ...card, padding: "12px 16px", marginBottom: 16, borderColor: "rgba(245,158,11,0.3)", background: "rgba(245,158,11,0.08)", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ color: "#fbbf24", fontSize: 13 }}>⚠ No cargaste el tipo de cambio de {mesLabel(mesSel)}. Cargalo para ver los montos en pesos:</span>
          <input placeholder="USD→ARS (ej. 1250)" value={fxInput} onChange={(e) => setFxInput(e.target.value)} style={{ ...inputStyle, width: 140 }} />
          <button onClick={saveFx} style={{ ...inputStyle, cursor: "pointer", background: "#B87333", border: "none", fontWeight: 600 }}>Guardar</button>
        </div>
      )}

      {/* KPIs fila 1 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 14 }}>
        <StatCard label="Ingresos" value={money(k.ingresos)} sub={mesLabel(mesSel)} color="#B87333" iconPath={ICONS.ingresos} big />
        <StatCard label="Costos totales" value={money(k.costosTotal)} sub={`IA ${money(k.costosIa)} + gastos`} color="#ef4444" iconPath={ICONS.costos} big />
        <StatCard label="Utilidad (EBIT)" value={money(k.ebit)} sub={positivo ? "operación en verde" : "en rojo"} color={positivo ? "#10b981" : "#ef4444"} iconPath={ICONS.utilidad} big />
        <StatCard label="Margen neto" value={k.margenPct != null ? `${k.margenPct.toFixed(1)}%` : "—"} sub="EBIT / ingresos" color="#6366f1" iconPath={ICONS.margen} big />
      </div>
      {/* KPIs fila 2 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 26 }}>
        <StatCard label="Costos de IA (APIs)" value={money(k.costosIa)} sub="OpenAI · Anthropic · Gemini" color="#8b5cf6" iconPath={ICONS.ia} />
        <StatCard label="Gastos fijos" value={money(k.gastosFijos)} sub="suscripciones, infra…" color="#64748b" iconPath={ICONS.costos} />
        <StatCard label="Margen de contribución" value={money(k.mc)} sub="ingresos − costos variables" color="#10b981" iconPath={ICONS.margen} />
        <StatCard label="Apalancamiento operativo" value={k.dol != null ? `${k.dol.toFixed(2)}×` : "—"} sub="MC / EBIT" color="#e29e6d" iconPath={ICONS.palanca} />
      </div>

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 26 }}>
        <div style={{ ...card, padding: 20 }}>
          <h3 style={{ color: "#fff", fontSize: 14, fontWeight: 600, margin: "0 0 4px" }}>Evolución · Ingresos vs Costos</h3>
          <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, margin: "0 0 12px" }}>Últimos 12 meses · {moneda}</p>
          <FinanceEvolutionChart data={evoData} simbolo={simbolo} height={230} />
        </div>
        <div style={{ ...card, padding: 20 }}>
          <h3 style={{ color: "#fff", fontSize: 14, fontWeight: 600, margin: "0 0 16px" }}>Costo de IA por proveedor</h3>
          {provDonut.length ? <DonutChart data={provDonut} size={170} /> : <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", paddingTop: 40, fontSize: 13 }}>Sin costos este mes</div>}
        </div>
      </div>

      {/* P&L breakdown + categorías */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16, marginBottom: 26 }}>
        <div style={{ ...card, padding: 22 }}>
          <h3 style={{ color: "#fff", fontSize: 14, fontWeight: 600, margin: "0 0 16px" }}>Estado de Resultado · {mesLabel(mesSel)}</h3>
          <PnLRow label="Ventas" value={money(er.ventas)} bold />
          <PnLRow label="− Costo de ventas" value={money(er.costoVentas)} neg />
          {er.detalle.costoVentas.map((d) => (
            <PnLSub key={`cv-${d.label}`} label={d.label} value={money(d.monto)} />
          ))}
          <PnLRow label="= Utilidad bruta" value={money(er.utilidadBruta)} sep bold pct={pctV(er.utilidadBruta)} color={er.utilidadBruta >= 0 ? "#10b981" : "#ef4444"} />
          <PnLRow label="− Gastos operativos" value={money(er.gastosOperativos)} neg />
          {er.detalle.gastosOperativos.map((d) => (
            <PnLSub key={`go-${d.label}`} label={d.label} value={money(d.monto)} />
          ))}
          <PnLRow label="= Utilidad operativa" value={money(er.utilidadOperativa)} sep bold pct={pctV(er.utilidadOperativa)} color={er.utilidadOperativa >= 0 ? "#10b981" : "#ef4444"} />
          <PnLRow label="− Gastos financieros" value={money(er.gastosFinancieros)} neg />
          <PnLRow label="= Utilidad antes de impuestos" value={money(er.utilidadAntesImpuestos)} sep bold pct={pctV(er.utilidadAntesImpuestos)} color={er.utilidadAntesImpuestos >= 0 ? "#10b981" : "#ef4444"} />
          <PnLRow label="− Impuestos" value={money(er.impuestos)} neg />
          <PnLRow label="= Utilidad neta" value={money(er.utilidadNeta)} sep bold pct={pctV(er.utilidadNeta)} color={er.utilidadNeta >= 0 ? "#10b981" : "#ef4444"} />
        </div>
        <div style={{ ...card, padding: 20 }}>
          <h3 style={{ color: "#fff", fontSize: 14, fontWeight: 600, margin: "0 0 16px" }}>Gastos por categoría</h3>
          {catDonut.length ? <DonutChart data={catDonut} size={170} /> : <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", paddingTop: 40, fontSize: 13 }}>Sin gastos cargados</div>}
        </div>
      </div>

      {/* Punto de equilibrio */}
      <div style={{ ...card, padding: 22, marginBottom: 26 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
          <h3 style={{ color: "#fff", fontSize: 14, fontWeight: 600, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <Icon d={ICONS.palanca} color="#B87333" size={16} /> Punto de equilibrio
          </h3>
          {beOverride && (
            <button onClick={() => setBeOverride(null)} style={{ background: "none", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 7, color: "rgba(255,255,255,0.6)", fontSize: 11, padding: "5px 10px", cursor: "pointer" }}>
              Restablecer con datos reales
            </button>
          )}
        </div>
        <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, margin: "0 0 16px" }}>
          Una unidad = una agencia que paga. Prellenado con datos reales de {mesLabel(mesSel)} · editá para simular. {nAg > 0 ? `${nAg} agencia${nAg !== 1 ? "s" : ""} con pago este mes` : "sin agencias con pago este mes"}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
          <div>
            <label style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, display: "block", marginBottom: 5 }}>Precio / agencia ({moneda})</label>
            <input type="number" min={0} value={beOverride ? beOverride.precio : beRound(bePrecioReal)} onChange={(e) => setBe("precio", e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, display: "block", marginBottom: 5 }}>Costo variable / agencia ({moneda})</label>
            <input type="number" min={0} value={beOverride ? beOverride.costo : beRound(beCostoReal)} onChange={(e) => setBe("costo", e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, display: "block", marginBottom: 5 }}>Gastos fijos ({moneda})</label>
            <input type="number" min={0} value={beOverride ? beOverride.fijos : beRound(beFijosReal)} onChange={(e) => setBe("fijos", e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, display: "block", marginBottom: 5 }}>Margen contribución / agencia</label>
            <div style={{ color: beMcUnit > 0 ? "#10b981" : "#ef4444", fontSize: 20, fontWeight: 700 }}>{simbolo}{beMcUnit.toLocaleString("es-AR", { maximumFractionDigits: 0 })}</div>
          </div>
          <div>
            <label style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, display: "block", marginBottom: 5 }}>Punto de equilibrio</label>
            <div style={{ color: "#B87333", fontSize: 20, fontWeight: 700 }}>{bePuntoEq != null ? `${bePuntoEq} agencia${bePuntoEq !== 1 ? "s" : ""}` : "—"}</div>
          </div>
        </div>
        {beMcUnit <= 0 && (
          <div style={{ marginTop: 14, color: "#fbbf24", fontSize: 12 }}>⚠ Con estos números no hay punto de equilibrio: el precio no cubre el costo variable por agencia.</div>
        )}
      </div>

      {/* Análisis del experto (IA) */}
      <div style={{ ...card, padding: 22, marginBottom: 26 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
          <h3 style={{ color: "#fff", fontSize: 14, fontWeight: 600, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <Icon d={ICONS.ia} color="#8b5cf6" size={16} /> Análisis del experto (IA)
          </h3>
          {analisis && (
            <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>
              {analisis.modelo} · {new Date(analisis.generated_at).toLocaleString("es-AR")}
            </span>
          )}
        </div>
        {analyzing ? (
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, padding: "16px 0" }}>Analizando con IA…</div>
        ) : !analisis ? (
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, padding: "16px 0" }}>
            Apretá <b style={{ color: "rgba(255,255,255,0.7)" }}>Actualizar</b> para generar el análisis del experto sobre este mes.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 14, marginTop: 10 }}>
            <div style={{ color: "rgba(255,255,255,0.78)", fontSize: 13, lineHeight: 1.55 }}>{analisis.contenido.diagnostico}</div>
            <AnalisisLista titulo="Mejoras" items={analisis.contenido.mejoras} color="#10b981" />
            <AnalisisLista titulo="Optimización de costos" items={analisis.contenido.optimizacion_costos} color="#B87333" />
            <AnalisisLista titulo="Próximos pasos" items={analisis.contenido.proximos_pasos} color="#6366f1" />
            <AnalisisLista titulo="Riesgos" items={analisis.contenido.riesgos} color="#ef4444" />
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10.5, marginTop: 2 }}>Generado por IA — revisá antes de decidir.</div>
          </div>
        )}
      </div>

      {/* Tabla de gastos */}
      <div style={{ ...card, padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ color: "#fff", fontSize: 14, fontWeight: 600, margin: 0 }}>Gastos fijos y variables</h3>
          <button onClick={() => { setForm(EMPTY_FORM); setShowForm(!showForm) }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 7, cursor: "pointer", background: "#B87333", border: "none", color: "#fff", fontSize: 12, fontWeight: 600 }}>
            <Icon d={ICONS.plus} color="#fff" size={14} /> Agregar gasto
          </button>
        </div>

        {showForm && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, marginBottom: 16, padding: 14, background: "rgba(255,255,255,0.03)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.07)" }}>
            <input placeholder="Concepto" value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })} style={{ ...inputStyle, gridColumn: "span 2" }} />
            <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} style={{ ...inputStyle, cursor: "pointer" }}>
              {Object.entries(CAT_LABEL).map(([k, v]) => <option key={k} value={k} style={{ background: "#0f1220" }}>{v}</option>)}
            </select>
            <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} style={{ ...inputStyle, cursor: "pointer" }}>
              <option value="fijo" style={{ background: "#0f1220" }}>Fijo</option>
              <option value="variable" style={{ background: "#0f1220" }}>Variable</option>
            </select>
            <select value={form.recurrencia} onChange={(e) => setForm({ ...form, recurrencia: e.target.value })} style={{ ...inputStyle, cursor: "pointer" }}>
              <option value="mensual" style={{ background: "#0f1220" }}>Mensual</option>
              <option value="anual" style={{ background: "#0f1220" }}>Anual</option>
              <option value="unico" style={{ background: "#0f1220" }}>Único</option>
            </select>
            <input type="number" placeholder="Monto" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} style={inputStyle} />
            <select value={form.moneda} onChange={(e) => setForm({ ...form, moneda: e.target.value })} style={{ ...inputStyle, cursor: "pointer" }}>
              <option value="USD" style={{ background: "#0f1220" }}>USD</option>
              <option value="ARS" style={{ background: "#0f1220" }}>ARS</option>
            </select>
            <input type="date" value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} style={inputStyle} />
            <input placeholder="Proveedor (opc.)" value={form.proveedor} onChange={(e) => setForm({ ...form, proveedor: e.target.value })} style={{ ...inputStyle, gridColumn: "span 2" }} />
            <button onClick={saveExpense} disabled={saving} style={{ ...inputStyle, cursor: "pointer", background: "#10b981", border: "none", fontWeight: 600 }}>{saving ? "Guardando…" : form.id ? "Guardar cambios" : "Agregar"}</button>
          </div>
        )}

        {data.expenses.length === 0 ? (
          <div style={{ color: "rgba(255,255,255,0.3)", textAlign: "center", padding: 24, fontSize: 13 }}>Sin gastos cargados. Agregá tus suscripciones y costos fijos.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ color: "rgba(255,255,255,0.4)", textAlign: "left" }}>
                  {["Concepto", "Categoría", "Tipo", "Recurrencia", "Monto", "Desde", "", ""].map((h, i) => (
                    <th key={i} style={{ padding: "8px 10px", fontWeight: 500, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.expenses.map((e) => (
                  <tr key={e.id} style={{ color: "rgba(255,255,255,0.8)", opacity: e.activo ? 1 : 0.4 }}>
                    <td style={{ padding: "10px", borderBottom: "1px solid rgba(255,255,255,0.04)", fontWeight: 500 }}>{e.concepto}{e.proveedor && <span style={{ color: "rgba(255,255,255,0.35)" }}> · {e.proveedor}</span>}</td>
                    <td style={{ padding: "10px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>{CAT_LABEL[e.categoria] || e.categoria}</td>
                    <td style={{ padding: "10px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}><span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 11, background: e.tipo === "fijo" ? "rgba(100,116,139,0.2)" : "rgba(184,115,51,0.2)", color: e.tipo === "fijo" ? "#94a3b8" : "#e29e6d" }}>{e.tipo}</span></td>
                    <td style={{ padding: "10px", borderBottom: "1px solid rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)" }}>{e.recurrencia}</td>
                    <td style={{ padding: "10px", borderBottom: "1px solid rgba(255,255,255,0.04)", fontWeight: 600 }}>{e.moneda === "USD" ? "US$" : "$"}{Number(e.monto).toLocaleString("es-AR")}</td>
                    <td style={{ padding: "10px", borderBottom: "1px solid rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)" }}>{e.fecha_inicio.slice(0, 7)}</td>
                    <td style={{ padding: "10px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}><button onClick={() => editExpense(e)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.4)", display: "flex" }}><Icon d={ICONS.edit} size={15} /></button></td>
                    <td style={{ padding: "10px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}><button onClick={() => delExpense(e.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(239,68,68,0.6)", display: "flex" }}><Icon d={ICONS.trash} size={15} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function PnLRow({ label, value, neg, bold, sep, color, pct }: { label: string; value: string; neg?: boolean; bold?: boolean; sep?: boolean; color?: string; pct?: number | null }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderTop: sep ? "1px solid rgba(255,255,255,0.1)" : "none", marginTop: sep ? 4 : 0 }}>
      <span style={{ fontSize: 13, color: bold ? "#fff" : "rgba(255,255,255,0.55)", fontWeight: bold ? 600 : 400 }}>{label}</span>
      <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        {pct != null && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: 500 }}>{pct.toFixed(0)}% s/ventas</span>}
        <span style={{ fontSize: bold ? 15 : 13, fontWeight: bold ? 700 : 500, color: color || (neg ? "rgba(255,255,255,0.7)" : "#fff") }}>{value}</span>
      </span>
    </div>
  )
}

function PnLSub({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0 3px 16px" }}>
      <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.4)" }}>· {label}</span>
      <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.5)" }}>{value}</span>
    </div>
  )
}

function AnalisisLista({ titulo, items, color }: { titulo: string; items?: string[]; color: string }) {
  if (!items || items.length === 0) return null
  return (
    <div>
      <div style={{ color, fontSize: 12, fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>{titulo}</div>
      <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 5 }}>
        {items.map((it, i) => (
          <li key={i} style={{ color: "rgba(255,255,255,0.7)", fontSize: 12.5, lineHeight: 1.5 }}>{it}</li>
        ))}
      </ul>
    </div>
  )
}
