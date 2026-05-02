"use client"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import { HistoricalMonthData } from "@/lib/mercado/fetchBarrios"
import { AlertTriangle } from "lucide-react"

interface EvolutionChartProps {
  historical: HistoricalMonthData[]
}

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { color: string; name: string; value: number }[]
  label?: string
}) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded-xl p-3 shadow-lg text-xs">
      <p className="font-bold text-foreground mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-semibold text-foreground">
            USD {p.value.toLocaleString("es-AR")}/m²
          </span>
        </div>
      ))}
    </div>
  )
}

export function EvolutionChart({ historical }: EvolutionChartProps) {
  const hasData = historical.length >= 2

  return (
    <div className="rounded-2xl border bg-card/50 backdrop-blur p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
            Evolución Precio m² CABA — Histórico real
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Promedio USD/m² departamentos por mes · Fuente: data.buenosaires.gob.ar
          </p>
        </div>
        {hasData && (
          <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-1 rounded-full shrink-0">
            {historical.length} meses reales
          </span>
        )}
      </div>

      {!hasData ? (
        <div className="flex items-center gap-3 h-[200px] justify-center text-sm text-muted-foreground">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          Sin suficientes datos históricos del CSV para graficar
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart
            data={historical}
            margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              interval={historical.length > 12 ? 1 : 0}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`}
              width={48}
              domain={["auto", "auto"]}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: "11px", paddingTop: "12px" }}
              formatter={(value) => (
                <span style={{ color: "hsl(var(--muted-foreground))" }}>{value}</span>
              )}
            />
            <Line
              type="monotone"
              dataKey="promedio_caba_usd"
              name="CABA Promedio"
              stroke="#a78bfa"
              strokeWidth={2.5}
              dot={historical.length <= 24 ? { r: 3, fill: "#a78bfa", strokeWidth: 0 } : false}
              activeDot={{ r: 5, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}

      <p className="text-[10px] text-muted-foreground/50 mt-2 text-right">
        Fuente: DGEyC-GCBA · data.buenosaires.gob.ar · CC-BY 2.5 AR
      </p>
    </div>
  )
}
