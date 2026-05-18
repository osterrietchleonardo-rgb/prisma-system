"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Sparkles, History, TrendingUp, Calendar, DollarSign, BarChart2, Users, ChevronDown } from "lucide-react"
import { format, startOfMonth, endOfMonth, subDays, subMonths, startOfDay, endOfDay } from "date-fns"
import { es } from "date-fns/locale"
import { toast } from "sonner"
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from "recharts"

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface AiCredits {
  credits_total: number
  credits_used: number
  period_start?: string
  period_end?: string
}

interface Transaction {
  id: string
  created_at: string
  feature: string
  credits_consumed: number
  user_id?: string
  usd_cost?: number
  input_tokens?: number
  output_tokens?: number
  profiles: { full_name: string; email: string } | null
}

type DatePreset = "period" | "7d" | "30d" | "3m" | "custom"
type ChartView = "user" | "module"

interface AgencyMember {
  id: string
  full_name: string
  email: string
  role: string
}


// ─── Metadata de módulos ──────────────────────────────────────────────────────
const MODULES: Record<string, { name: string; icon: string; color: string }> = {
  marketing_ia:  { name: "Marketing IA",  icon: "📣", color: "#6366f1" },
  contratos_ia:  { name: "Contratos IA",  icon: "📄", color: "#8b5cf6" },
  tutor_ia:      { name: "Tutor IA",      icon: "🎓", color: "#06b6d4" },
  consultor_ia:  { name: "Consultor IA",  icon: "🏠", color: "#10b981" },
  documentos_ia: { name: "Documentos IA", icon: "📚", color: "#f59e0b" },
}
const MODULE_COLORS = ["#6366f1","#8b5cf6","#06b6d4","#10b981","#f59e0b","#ef4444"]

// ─── Helpers ──────────────────────────────────────────────────────────────────
function realCost(tx: Transaction) {
  return {
    tokens: (tx.input_tokens ?? 0) + (tx.output_tokens ?? 0),
    usd: tx.usd_cost ?? 0,
  }
}

/** Muestra 6 decimales si el valor es menor a $0.001 para no perder micro-costos */
function fmtUsd(v: number): string {
  if (v === 0) return "$0.000000"
  if (v < 0.001) return `$${v.toFixed(6)}`
  if (v < 0.01)  return `$${v.toFixed(5)}`
  return `$${v.toFixed(4)}`
}


function SkeletonCard() {
  return (
    <Card className="border-accent/10 bg-card/30 backdrop-blur-md">
      <CardHeader className="pb-2"><div className="h-3 w-28 bg-accent/10 rounded animate-pulse" /></CardHeader>
      <CardContent><div className="h-8 w-20 bg-accent/10 rounded animate-pulse mb-2" /><div className="h-2 w-32 bg-accent/10 rounded animate-pulse" /></CardContent>
    </Card>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function AiCreditsDashboard({ agencyId }: { agencyId: string }) {
  const [credits, setCredits]             = useState<AiCredits | null>(null)
  const [transactions, setTransactions]   = useState<Transaction[]>([])
  const [loading, setLoading]             = useState(true)
  const [preset, setPreset]               = useState<DatePreset>("period")
  const [customFrom, setCustomFrom]       = useState("")
  const [customTo, setCustomTo]           = useState("")
  const [chartView, setChartView]         = useState<ChartView>("module")
  const [members, setMembers]             = useState<AgencyMember[]>([])
  const [filterModules, setFilterModules] = useState<string[]>([]) // empty = all
  const [filterUser, setFilterUser]       = useState<string>("all")
  const supabase = createClient()


  // ─── Resolver rango de fechas ──────────────────────────────────────────────
  const resolveRange = useCallback((credits: AiCredits | null): { from: string; to: string } => {
    const now = new Date()
    if (preset === "7d")  return { from: startOfDay(subDays(now, 6)).toISOString(), to: endOfDay(now).toISOString() }
    if (preset === "30d") return { from: startOfDay(subDays(now, 29)).toISOString(), to: endOfDay(now).toISOString() }
    if (preset === "3m")  return { from: startOfDay(subMonths(now, 3)).toISOString(), to: endOfDay(now).toISOString() }
    if (preset === "custom" && customFrom && customTo) return { from: startOfDay(new Date(customFrom)).toISOString(), to: endOfDay(new Date(customTo)).toISOString() }
    return { from: credits?.period_start ?? startOfMonth(now).toISOString(), to: credits?.period_end ?? endOfMonth(now).toISOString() }
  }, [preset, customFrom, customTo])

  // ─── Fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!agencyId) return
    setLoading(true)
    try {
      const { data: cData } = await supabase
        .from("agency_ai_credits")
        .select("credits_total,credits_used,period_start,period_end")
        .eq("agency_id", agencyId)
        .maybeSingle()

      const creditsData = cData ?? { credits_total: 10000, credits_used: 0, period_start: startOfMonth(new Date()).toISOString(), period_end: endOfMonth(new Date()).toISOString() }
      setCredits(creditsData)

      const { from, to } = resolveRange(creditsData)

      const { data: txData, error: txError } = await supabase
        .from("ai_credit_transactions")
        .select("id,created_at,feature,credits_consumed,usd_cost,input_tokens,output_tokens,user_id,profiles(full_name,email)")
        .eq("agency_id", agencyId)
        .gte("created_at", from)
        .lte("created_at", to)
        .order("created_at", { ascending: false })
        .limit(500)

      if (txError) throw txError
      setTransactions((txData ?? []) as unknown as Transaction[])
    } catch (e: any) {
      toast.error("Error al cargar datos: " + e.message)
    } finally {
      setLoading(false)
    }
  }, [agencyId, resolveRange])

  // ─── Fetch de integrantes de la agencia ───────────────────────────────────
  useEffect(() => {
    if (!agencyId) return
    supabase
      .from("profiles")
      .select("id,full_name,email,role")
      .eq("agency_id", agencyId)
      .then(({ data }) => setMembers((data ?? []) as AgencyMember[]))
  }, [agencyId])

  useEffect(() => { fetchData() }, [fetchData])


  // ─── Métricas (solo datos reales) ──────────────────────────────────────────
  const { totalTokens, totalUsd } = transactions.reduce((acc, tx) => {
    const { tokens, usd } = realCost(tx)
    return { totalTokens: acc.totalTokens + tokens, totalUsd: acc.totalUsd + usd }
  }, { totalTokens: 0, totalUsd: 0 })

  const remaining = credits ? credits.credits_total - credits.credits_used : 0
  const percentage = credits ? Math.min(100, (credits.credits_used / credits.credits_total) * 100) : 0
  const isDanger = percentage > 95
  const isWarning = percentage > 80

  // ─── Agrupación por módulo ─────────────────────────────────────────────────
  const moduleStats = transactions.reduce((acc, tx) => {
    if (!acc[tx.feature]) acc[tx.feature] = { credits: 0, tokens: 0, usd: 0 }
    const { tokens, usd } = realCost(tx)
    acc[tx.feature].credits += tx.credits_consumed
    acc[tx.feature].tokens  += tokens
    acc[tx.feature].usd     += usd
    return acc
  }, {} as Record<string, { credits: number; tokens: number; usd: number }>)

  // ─── Agrupación para tabla por user+módulo ─────────────────────────────────
  const tableGroups = transactions.reduce((acc, tx) => {
    const key = `${tx.feature}::${tx.user_id ?? "sistema"}`
    if (!acc[key]) acc[key] = { feature: tx.feature, user: tx.profiles, total_credits: 0, total_tokens: 0, total_usd: 0, last_activity: tx.created_at, count: 0 }
    const { tokens, usd } = realCost(tx)
    acc[key].total_credits += tx.credits_consumed
    acc[key].total_tokens  += tokens
    acc[key].total_usd     += usd
    acc[key].count         += 1
    if (new Date(tx.created_at) > new Date(acc[key].last_activity)) acc[key].last_activity = tx.created_at
    return acc
  }, {} as Record<string, any>)
  const sortedGroups = Object.entries(tableGroups).sort((a, b) => new Date(b[1].last_activity).getTime() - new Date(a[1].last_activity).getTime())

  // ─── Datos para gráfico filtrado ────────────────────────────────────────────
  const chartTxs = transactions.filter(tx => {
    const moduleOk = filterModules.length === 0 || filterModules.includes(tx.feature)
    const userOk   = filterUser === "all" || tx.user_id === filterUser
    return moduleOk && userOk
  })

  const chartDataMap: Record<string, Record<string, number>> = {}
  const chartKeys = new Set<string>()

  chartTxs.forEach(tx => {
    const day = format(new Date(tx.created_at), "dd/MM", { locale: es })
    if (!chartDataMap[day]) chartDataMap[day] = {}
    const key = chartView === "module"
      ? (MODULES[tx.feature]?.name ?? tx.feature)
      : (tx.profiles?.full_name ?? "Sistema")
    chartKeys.add(key)
    chartDataMap[day][key] = (chartDataMap[day][key] ?? 0) + (tx.usd_cost ?? 0)
  })

  const daysSorted = Array.from(new Set(
    [...chartTxs]
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map(tx => format(new Date(tx.created_at), "dd/MM", { locale: es }))
  ))

  const chartData = daysSorted.map(day => ({ day, ...chartDataMap[day] }))
  const chartKeysList = Array.from(chartKeys)


  // ─── Render ────────────────────────────────────────────────────────────────
  const { from: rangeFrom, to: rangeTo } = resolveRange(credits)

  return (
    <div className="space-y-6">

      {/* ── Filtros de fecha ─────────────────────────────────────────────── */}
      <Card className="border-accent/10 bg-card/30 backdrop-blur-md">
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Período:
            </span>
            {([
              ["period", "Período activo"],
              ["7d", "Últimos 7 días"],
              ["30d", "Últimos 30 días"],
              ["3m", "Últimos 3 meses"],
              ["custom", "Personalizado"],
            ] as [DatePreset, string][]).map(([p, label]) => (
              <Button
                key={p}
                size="sm"
                variant={preset === p ? "default" : "outline"}
                className={`text-xs h-7 ${preset === p ? "bg-accent text-white" : "border-accent/20 text-muted-foreground"}`}
                onClick={() => setPreset(p)}
              >
                {label}
              </Button>
            ))}
            {preset === "custom" && (
              <div className="flex items-center gap-2 ml-2">
                <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                  className="text-xs h-7 px-2 rounded border border-accent/20 bg-background text-foreground" />
                <span className="text-xs text-muted-foreground">→</span>
                <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                  className="text-xs h-7 px-2 rounded border border-accent/20 bg-background text-foreground" />
                <Button size="sm" className="h-7 text-xs bg-accent" onClick={fetchData}>Aplicar</Button>
              </div>
            )}
            {!loading && (
              <span className="ml-auto text-[11px] text-muted-foreground">
                {format(new Date(rangeFrom), "d MMM yyyy", { locale: es })} — {format(new Date(rangeTo), "d MMM yyyy", { locale: es })}
                {" · "}<span className="text-foreground font-semibold">{transactions.length}</span> operaciones
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Tarjetas resumen ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {loading ? <><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /></> : (<>
          <Card className="border-accent/10 bg-card/30 backdrop-blur-md relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10"><Sparkles className="w-24 h-24" /></div>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Créditos Disponibles</CardTitle></CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{remaining.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">de {credits?.credits_total.toLocaleString()} totales</p>
            </CardContent>
          </Card>

          <Card className="border-accent/10 bg-card/30 backdrop-blur-md">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Consumo del Período</CardTitle></CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${isDanger ? "text-destructive" : isWarning ? "text-yellow-500" : ""}`}>
                {percentage.toFixed(1)}%
              </div>
              <Progress value={percentage} className="h-2 mt-3" />
              <p className="text-[11px] text-muted-foreground mt-1.5">{credits?.credits_used?.toLocaleString()} créditos usados</p>
            </CardContent>
          </Card>

          <Card className="border-accent/10 bg-card/30 backdrop-blur-md relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10"><DollarSign className="w-24 h-24 text-emerald-500" /></div>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Consumo Real (USD)</CardTitle></CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-emerald-500">{fmtUsd(totalUsd)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                <span className="font-mono text-foreground font-semibold">{totalTokens.toLocaleString()}</span> tokens reales
              </p>
            </CardContent>
          </Card>

          <Card className="border-accent/10 bg-card/30 backdrop-blur-md">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Módulos Activos</CardTitle></CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{Object.keys(moduleStats).length}</div>
              <p className="text-xs text-muted-foreground mt-1">de {Object.keys(MODULES).length} disponibles</p>
            </CardContent>
          </Card>
        </>)}
      </div>

      {/* ── Cards por módulo ─────────────────────────────────────────────── */}
      {!loading && Object.keys(moduleStats).length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {Object.entries(moduleStats).map(([feature, data]) => {
            const mod = MODULES[feature]
            return (
              <Card key={feature} className="border-accent/10 bg-accent/5">
                <CardContent className="pt-4 pb-3">
                  <p className="text-lg mb-1">{mod?.icon ?? "⚡"}</p>
                  <p className="text-xs text-muted-foreground font-bold uppercase tracking-wide">{mod?.name ?? feature}</p>
                  <p className="text-base font-bold mt-1">{data.credits.toLocaleString()} <span className="text-[10px] font-normal text-muted-foreground">créditos</span></p>
                  <p className="text-[11px] font-mono text-emerald-400 mt-0.5">{fmtUsd(data.usd)}</p>
                  <p className="text-[10px] text-muted-foreground">{data.tokens.toLocaleString()} tkn</p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ── Gráfico de evolución ─────────────────────────────────────────── */}
      <Card className="border-accent/10 bg-card/30 backdrop-blur-md">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="flex items-center gap-2"><BarChart2 className="h-5 w-5 text-accent" /> Evolución de Consumo USD</CardTitle>
            <CardDescription>Costo real en USD por día — solo operaciones con datos registrados</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {/* Toggle módulo/asesor */}
            <Button size="sm" variant={chartView === "module" ? "default" : "outline"}
              className={`text-xs h-7 ${chartView === "module" ? "bg-accent text-white" : "border-accent/20"}`}
              onClick={() => setChartView("module")}>
              Por Módulo
            </Button>
            <Button size="sm" variant={chartView === "user" ? "default" : "outline"}
              className={`text-xs h-7 ${chartView === "user" ? "bg-accent text-white" : "border-accent/20"}`}
              onClick={() => setChartView("user")}>
              <Users className="w-3 h-3 mr-1" /> Por Asesor
            </Button>

            <div className="w-px h-5 bg-accent/10 mx-1" />

            {/* Filtro módulo */}
            <select
              value={filterModules.length === 1 ? filterModules[0] : "all"}
              onChange={e => setFilterModules(e.target.value === "all" ? [] : [e.target.value])}
              className="text-xs h-7 px-2 rounded border border-accent/20 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-accent/40"
            >
              <option value="all">Todos los módulos</option>
              {Object.entries(MODULES).map(([k, m]) => (
                <option key={k} value={k}>{m.icon} {m.name}</option>
              ))}
            </select>

            {/* Filtro integrante */}
            <select
              value={filterUser}
              onChange={e => setFilterUser(e.target.value)}
              className="text-xs h-7 px-2 rounded border border-accent/20 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-accent/40"
            >
              <option value="all">Todos los integrantes</option>
              {members.map(m => (
                <option key={m.id} value={m.id}>
                  {m.full_name} ({m.role === "director" ? "Director" : "Asesor"})
                </option>
              ))}
            </select>
          </div>

        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-64 flex items-center justify-center"><div className="h-32 w-full bg-accent/5 rounded animate-pulse" /></div>
          ) : chartData.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-muted-foreground gap-2">
              <TrendingUp className="w-8 h-8 opacity-20" />
              <p className="text-sm">Sin datos reales de costo en este período.</p>
              <p className="text-xs opacity-60">Los datos aparecerán a medida que se usen las funciones de IA.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tickFormatter={(v) => v === 0 ? "$0" : v < 0.001 ? `$${v.toFixed(5)}` : `$${v.toFixed(4)}`} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={70} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--accent)/0.2)", borderRadius: "8px", fontSize: 12 }}
                  formatter={(value: number, name: string) => [fmtUsd(value), name]}
                />

                <Legend wrapperStyle={{ fontSize: 11 }} />
                {chartKeysList.map((key, i) => (
                  <Line key={key} type="monotone" dataKey={key} stroke={MODULE_COLORS[i % MODULE_COLORS.length]}
                    strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Tabla de auditoría ───────────────────────────────────────────── */}
      <Card className="border-accent/10 bg-card/30 backdrop-blur-md">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="flex items-center gap-2"><History className="h-5 w-5 text-accent" /> Historial de Uso (Auditoría)</CardTitle>
            <CardDescription>Solo se muestran operaciones con tokens y costo USD registrados por la API.</CardDescription>
          </div>
          {!loading && totalUsd > 0 && (
            <div className="text-right hidden sm:block">
              <p className="text-xs text-muted-foreground">Total período</p>
              <p className="text-lg font-bold text-emerald-500">{fmtUsd(totalUsd)} USD</p>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-accent/10 bg-background/50 overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[640px]">
              <thead className="bg-accent/5 text-muted-foreground text-xs uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Asesor / Usuario</th>
                  <th className="px-4 py-3">Módulo IA</th>
                  <th className="px-4 py-3 text-right">Tokens (in/out)</th>
                  <th className="px-4 py-3 text-right">Costo USD</th>
                  <th className="px-4 py-3 text-right">Créditos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-accent/10">
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-3 bg-accent/10 rounded animate-pulse" style={{ width: `${60 + j * 5}%` }} /></td>
                    ))}</tr>
                  ))
                ) : sortedGroups.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <TrendingUp className="w-8 h-8 opacity-30" />
                      <p className="text-sm">Sin consumo registrado en este período.</p>
                    </div>
                  </td></tr>
                ) : (
                  sortedGroups.map(([key, data]) => {
                    const mod = MODULES[data.feature]
                    const inputTk  = transactions.filter(tx => `${tx.feature}::${tx.user_id ?? "sistema"}` === key).reduce((s, tx) => s + (tx.input_tokens ?? 0), 0)
                    const outputTk = transactions.filter(tx => `${tx.feature}::${tx.user_id ?? "sistema"}` === key).reduce((s, tx) => s + (tx.output_tokens ?? 0), 0)
                    return (
                      <tr key={key} className="hover:bg-accent/5 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-[10px] text-muted-foreground mb-0.5">Último uso</div>
                          <div className="font-medium text-xs">{format(new Date(data.last_activity), "d MMM, HH:mm", { locale: es })}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-sm">{data.user?.full_name ?? "Sistema Automático"}</div>
                          <div className="text-xs text-muted-foreground">{data.user?.email ?? "—"}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="bg-background border-accent/20 text-accent text-xs">
                              {mod?.icon ?? "⚡"} {mod?.name ?? data.feature}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">({data.count} ops)</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs">
                          {data.total_tokens > 0 ? (
                            <span>
                              <span className="text-blue-400">{inputTk.toLocaleString()}</span>
                              <span className="text-muted-foreground mx-0.5">/</span>
                              <span className="text-purple-400">{outputTk.toLocaleString()}</span>
                            </span>
                          ) : <span className="text-muted-foreground text-[10px]">sin datos</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sm font-medium">
                          {data.total_usd > 0
                            ? <span className="text-emerald-500">{fmtUsd(data.total_usd)}</span>
                            : <span className="text-muted-foreground text-[10px]">sin datos</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sm font-medium text-destructive">
                          -{data.total_credits}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
              {!loading && sortedGroups.length > 0 && (
                <tfoot className="bg-accent/5 border-t border-accent/10">
                  <tr>
                    <td colSpan={3} className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase">Totales reales</td>
                    <td className="px-4 py-2 text-right font-mono text-xs font-bold">{totalTokens.toLocaleString()} tkn</td>
                    <td className="px-4 py-2 text-right font-mono text-xs font-bold text-emerald-500">{fmtUsd(totalUsd)}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs font-bold text-destructive">-{credits?.credits_used ?? 0}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
