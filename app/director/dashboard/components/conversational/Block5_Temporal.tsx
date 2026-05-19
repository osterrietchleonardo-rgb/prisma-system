"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useMemo } from "react"

interface HourEntry { hour: number; count: number }
interface DayEntry { day: number; day_name: string; count: number }
interface HeatmapRow { day: number; day_name: string; hours: HourEntry[] }
interface TopItem { label: string; count: number; pct: number }

interface TemporalData {
  hour_distribution: HourEntry[]
  day_distribution: DayEntry[]
  peak_hour: number
  peak_day: number
  peak_day_name: string
  total_lead_messages: number
  bot_active_count: number
  human_attended_count: number
  avg_duration_min: number | null
  heatmap: HeatmapRow[]
  urgencia_breakdown: TopItem[]
  nivel_compromiso: TopItem[]
}

const URGENCIA_LABELS: Record<string, string> = {
  inmediata: "Inmediata (< 1 mes)",
  corto_plazo: "Corto plazo (1–3 meses)",
  medio_plazo: "Medio plazo (3–6 meses)",
  explorando: "Solo explorando",
}

const URGENCIA_COLORS: Record<string, string> = {
  inmediata: "#f87171",
  corto_plazo: "#fb923c",
  medio_plazo: "#a78bfa",
  explorando: "#6b7280",
}

function formatHour(h: number) {
  return h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`
}

function formatDuration(min: number | null) {
  if (!min) return "—"
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)}h ${min % 60}min`
}

/** Simple heatmap rendered in pure SVG/CSS — no recharts needed */
function Heatmap({ data }: { data: HeatmapRow[] }) {
  const HOURS = Array.from({ length: 24 }, (_, i) => i)
  const maxVal = useMemo(() => {
    let m = 0
    for (const row of data) for (const h of row.hours) if (h.count > m) m = h.count
    return m || 1
  }, [data])

  const getColor = (count: number) => {
    if (count === 0) return "rgba(255,255,255,0.04)"
    const intensity = count / maxVal
    // Copper gradient: low → mid → high
    const r = Math.round(80 + intensity * 104)
    const g = Math.round(40 + intensity * 75)
    const b = Math.round(10 + intensity * 20)
    return `rgba(${r},${g},${b},${0.4 + intensity * 0.6})`
  }

  if (data.length === 0) return <p className="text-xs text-muted-foreground">Sin datos</p>

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
        {/* Hour labels */}
        <div className="flex ml-[68px] mb-1 gap-[2px]">
          {HOURS.filter((_, i) => i % 3 === 0).map(h => (
            <div key={h} className="text-[9px] text-muted-foreground/60 w-[calc((100%-68px)/8)]">
              {formatHour(h)}
            </div>
          ))}
        </div>
        {/* Rows */}
        {data.map(row => (
          <div key={row.day} className="flex items-center gap-[2px] mb-[2px]">
            <span className="text-[10px] text-muted-foreground w-[64px] shrink-0 text-right pr-2">{row.day_name}</span>
            {row.hours.map(h => (
              <div
                key={h.hour}
                className="flex-1 h-5 rounded-[2px] cursor-default transition-opacity hover:opacity-100"
                style={{ backgroundColor: getColor(h.count), minWidth: "12px" }}
                title={`${row.day_name} ${formatHour(h.hour)}: ${h.count} msg`}
              />
            ))}
          </div>
        ))}
        {/* Color legend */}
        <div className="flex items-center gap-2 mt-3 ml-[68px]">
          <span className="text-[10px] text-muted-foreground">Menos</span>
          <div className="flex gap-[2px]">
            {[0, 0.2, 0.4, 0.6, 0.8, 1].map(v => (
              <div key={v} className="h-3 w-6 rounded-[2px]" style={{ backgroundColor: getColor(Math.round(v * maxVal)) }} />
            ))}
          </div>
          <span className="text-[10px] text-muted-foreground">Más actividad</span>
        </div>
      </div>
    </div>
  )
}

function HourBarChart({ data }: { data: HourEntry[] }) {
  const max = Math.max(...data.map(d => d.count), 1)
  const MORNING = [6, 7, 8, 9, 10, 11]
  const AFTERNOON = [12, 13, 14, 15, 16, 17, 18]
  const NIGHT = [19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5]

  const segmentColor = (h: number) => {
    if (MORNING.includes(h)) return "#60a5fa"
    if (AFTERNOON.includes(h)) return "#b87333"
    return "#6b7280"
  }

  return (
    <div className="flex items-end gap-[2px] h-24 w-full">
      {data.map(({ hour, count }) => (
        <div key={hour} className="flex-1 flex flex-col items-center gap-0.5 group">
          <div
            className="w-full rounded-t-[2px] transition-all duration-300"
            style={{ height: `${(count / max) * 100}%`, minHeight: count > 0 ? "2px" : "0", backgroundColor: segmentColor(hour) }}
            title={`${formatHour(hour)}: ${count} mensajes`}
          />
        </div>
      ))}
    </div>
  )
}

export function Block5Temporal({ temporal }: { temporal: TemporalData }) {
  const t = temporal
  const urgTotal = t.urgencia_breakdown?.reduce((s, i) => s + i.count, 0) || 1

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-bold">Comportamiento Temporal</h3>
        <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-md bg-accent/10 border border-accent/20 font-medium">
          ¿Cuándo y cómo consultan?
        </span>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Hora pico", value: t.peak_hour != null ? formatHour(t.peak_hour) : "—", sub: "de mayor actividad", color: "text-accent" },
          { label: "Día pico", value: t.peak_day_name || "—", sub: "con más consultas", color: "text-purple-400" },
          { label: "Duración media", value: formatDuration(t.avg_duration_min), sub: "por conversación", color: "text-blue-400" },
          { label: "Mensajes de leads", value: t.total_lead_messages?.toLocaleString("es-AR") ?? "—", sub: "en el período", color: "text-emerald-400" },
        ].map(({ label, value, sub, color }) => (
          <Card key={label} className="border-accent/10 bg-card/50 backdrop-blur-sm">
            <CardContent className="p-4">
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs font-semibold mt-1">{label}</p>
              <p className="text-[10px] text-muted-foreground">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Heatmap */}
      <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center gap-2">
            <span className="text-base">🗓️</span>
            <CardTitle className="text-sm font-semibold">Heatmap de actividad — Día × Hora</CardTitle>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Mensajes entrantes de leads por franja horaria</p>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {t.heatmap?.length > 0 ? <Heatmap data={t.heatmap} /> : (
            <div className="h-32 flex items-center justify-center">
              <p className="text-xs text-muted-foreground">Sin datos de mensajes para el período</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Hour distribution */}
      <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center gap-2">
            <span>⏰</span>
            <CardTitle className="text-sm font-semibold">Distribución por hora del día</CardTitle>
          </div>
          <div className="flex gap-4 text-[10px] text-muted-foreground mt-1">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-400 inline-block" />Mañana (6–11)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-accent inline-block" />Tarde (12–18)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-muted-foreground/50 inline-block" />Noche (19–5)</span>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {t.hour_distribution?.length > 0 ? (
            <>
              <HourBarChart data={t.hour_distribution} />
              <div className="flex justify-between mt-1">
                <span className="text-[9px] text-muted-foreground">12am</span>
                <span className="text-[9px] text-muted-foreground">6am</span>
                <span className="text-[9px] text-muted-foreground">12pm</span>
                <span className="text-[9px] text-muted-foreground">6pm</span>
                <span className="text-[9px] text-muted-foreground">11pm</span>
              </div>
            </>
          ) : <p className="text-xs text-muted-foreground">Sin datos</p>}
        </CardContent>
      </Card>

      {/* Urgencia + Bot vs Human */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center gap-2"><span>⏱️</span><CardTitle className="text-sm font-semibold">Urgencia de compra declarada</CardTitle></div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2.5">
            {!t.urgencia_breakdown?.length
              ? <p className="text-xs text-muted-foreground">Sin datos</p>
              : t.urgencia_breakdown.map(item => (
                <div key={item.label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{URGENCIA_LABELS[item.label] || item.label}</span>
                    <span className="font-semibold">{item.count} <span className="text-muted-foreground font-normal">({item.pct}%)</span></span>
                  </div>
                  <div className="w-full h-1.5 bg-muted/30 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(item.count / urgTotal) * 100}%`, backgroundColor: URGENCIA_COLORS[item.label] || "#6b7280" }} />
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>

        <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center gap-2"><span>🤖</span><CardTitle className="text-sm font-semibold">Resolución Bot vs Asesor humano</CardTitle></div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {(t.bot_active_count != null || t.human_attended_count != null) ? (() => {
              const bot = t.bot_active_count || 0
              const human = t.human_attended_count || 0
              const total = bot + human || 1
              return (
                <div className="space-y-4">
                  <div className="flex gap-2 h-8 w-full rounded-lg overflow-hidden">
                    <div className="flex items-center justify-center text-xs font-bold text-white transition-all"
                      style={{ width: `${(bot / total) * 100}%`, backgroundColor: "#7c3aed", minWidth: bot > 0 ? "30px" : "0" }}>
                      {bot > 0 ? `${Math.round((bot / total) * 100)}%` : ""}
                    </div>
                    <div className="flex items-center justify-center text-xs font-bold text-white transition-all"
                      style={{ width: `${(human / total) * 100}%`, backgroundColor: "#b87333", minWidth: human > 0 ? "30px" : "0" }}>
                      {human > 0 ? `${Math.round((human / total) * 100)}%` : ""}
                    </div>
                  </div>
                  <div className="flex gap-6 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-sm bg-purple-600 inline-block" />
                      <div>
                        <p className="font-bold">{bot}</p>
                        <p className="text-[10px] text-muted-foreground">Bot activo</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-sm bg-accent inline-block" />
                      <div>
                        <p className="font-bold">{human}</p>
                        <p className="text-[10px] text-muted-foreground">Derivadas a asesor</p>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })() : <p className="text-xs text-muted-foreground">Sin datos</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
