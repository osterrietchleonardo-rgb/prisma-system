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
import { AlertTriangle } from "lucide-react"

export interface EvolutionPoint {
  label: string          // 'Ene 26'
  periodo: string        // '2026-01'
  lista: number | null   // USD/m² publicado (Zonaprop Index CABA)
  cierre: number | null  // USD/m² cierre real (REMAX + UCEMA)
}

interface EvolutionChartProps {
  data: EvolutionPoint[]
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

export function EvolutionChart({ data }: EvolutionChartProps) {
  const hasData = data.length >= 2

  return (
    <div className="rounded-2xl border bg-card/50 backdrop-blur p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
            Evolución Precio m² CABA — Lista vs. Cierre real
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Lista: Zonaprop Index · Cierre real: REMAX + UCEMA (operaciones concretadas)
          </p>
        </div>
        {hasData && (
          <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-1 rounded-full shrink-0">
            {data.length} meses
          </span>
        )}
      </div>

      {!hasData ? (
        <div className="flex items-center gap-3 h-[200px] justify-center text-sm text-muted-foreground">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          Sin datos históricos disponibles
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart
            data={data}
            margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "rgba(255,255,255,0.5)" }}
              axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
              tickLine={false}
            />
            <YAxis
              domain={["dataMin - 60", "dataMax + 60"]}
              tick={{ fontSize: 11, fill: "rgba(255,255,255,0.5)" }}
              axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
              tickLine={false}
              tickFormatter={(v: number) => `${v.toLocaleString("es-AR")}`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 11 }}
              formatter={(value: string) => (
                <span style={{ color: "rgba(255,255,255,0.7)" }}>{value}</span>
              )}
            />
            <Line
              type="monotone"
              dataKey="lista"
              name="Lista (Zonaprop)"
              stroke="#8b5cf6"
              strokeWidth={2}
              dot={{ r: 3, fill: "#8b5cf6" }}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="cierre"
              name="Cierre real (REMAX+UCEMA)"
              stroke="#34d399"
              strokeWidth={2}
              dot={{ r: 3, fill: "#34d399" }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      )}

      <p className="text-[10px] text-muted-foreground/50 mt-3">
        La distancia entre las dos líneas es la brecha real de negociación del mercado.
      </p>
    </div>
  )
}
