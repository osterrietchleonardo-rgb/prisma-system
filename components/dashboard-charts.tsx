"use client"

import {
  Bar,
  BarChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  PieChart,
  Pie,
} from "recharts"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const COLORS = ["#b87333", "#8b4513", "#d2691e", "#cd853f", "#f4a460"]

interface DashboardChartsProps {
  data: {
    sources: Array<{ label: string, count: number }>
    operations: Array<{ label: string, count: number }>
    types: Array<{ label: string, count: number }>
    pipeline: Array<{ name: string, value: number }>
  }
}

const HorizontalBar = ({ label, count, total, color }: { label: string, count: number, total: number, color: string }) => (
  <div className="space-y-1">
    <div className="flex justify-between text-xs font-medium">
      <span className="truncate mr-2">{label}</span>
      <span>{count}</span>
    </div>
    <div className="h-2 w-full bg-accent/10 rounded-full overflow-hidden">
      <div 
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${(count / total) * 100}%`, backgroundColor: color }}
      />
    </div>
  </div>
)

export function DashboardCharts({ data }: DashboardChartsProps) {
  const maxSources = Math.max(...data.sources.map(s => s.count), 1)
  const maxOps = Math.max(...data.operations.map(o => o.count), 1)
  const maxTypes = Math.max(...data.types.map(t => t.count), 1)

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {/* Fuentes */}
      <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Leads por Fuente</CardTitle>
          <CardDescription className="text-xs">Portales y canales</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.sources.slice(0, 5).map((item, i) => (
            <HorizontalBar key={i} label={item.label} count={item.count} total={maxSources} color={COLORS[i % COLORS.length]} />
          ))}
        </CardContent>
      </Card>

      {/* Operaciones */}
      <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Tipo de Operación</CardTitle>
          <CardDescription className="text-xs">Venta vs Alquiler</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.operations.map((item, i) => (
            <HorizontalBar key={i} label={item.label} count={item.count} total={maxOps} color={COLORS[(i + 2) % COLORS.length]} />
          ))}
        </CardContent>
      </Card>

      {/* Tipos de Propiedad */}
      <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Tipos de Propiedad</CardTitle>
          <CardDescription className="text-xs">Preferencias de búsqueda</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.types.slice(0, 5).map((item, i) => (
            <HorizontalBar key={i} label={item.label} count={item.count} total={maxTypes} color={COLORS[(i + 4) % COLORS.length]} />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

