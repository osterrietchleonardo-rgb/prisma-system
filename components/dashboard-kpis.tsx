import { 
  Users, 
  Calendar, 
  Calculator, 
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

import { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface KpiCardProps {
  title: string
  value: string | number
  description: string
  icon: LucideIcon
  trend?: {
    value: string
    positive: boolean
  }
}

function KpiCard({ title, value, description, icon: Icon, trend }: KpiCardProps) {
  return (
    <Card className="overflow-hidden border-accent/10 bg-card/50 backdrop-blur-sm transition-all hover:border-accent/30 hover:shadow-lg group">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="p-2 bg-accent/10 rounded-lg group-hover:bg-accent/20 transition-colors">
          <Icon className="h-4 w-4 text-accent" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <div className="flex items-center gap-2 mt-1">
          {trend && trend.value && (
            <span className={cn(
              "text-xs font-bold flex items-center",
              trend.positive ? "text-emerald-500" : "text-rose-500"
            )}>
              {trend.positive ? <ArrowUpRight className="h-3 w-3 mr-0.5" /> : <ArrowDownRight className="h-3 w-3 mr-0.5" />}
              {trend.value}
            </span>
          )}
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  )
}

interface DashboardKpisProps {
  data: {
    newLeads: number
    pendingVisits: number
    valuations: number
    salesVolume: number
  }
}

export function DashboardKpis({ data }: DashboardKpisProps) {
  const kpis = [
    {
      title: "Leads Nuevos",
      value: data.newLeads,
      description: "En estado nuevo",
      icon: Users,
    },
    {
      title: "Visitas Pendientes",
      value: data.pendingVisits,
      description: "Próximos días",
      icon: Calendar,
    },
    {
      title: "Tasaciones Realizadas",
      value: data.valuations,
      description: "Histórico total",
      icon: Calculator,
    },
    {
      title: "Cierres / Ventas",
      value: new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(data.salesVolume),
      description: "Volumen total",
      icon: TrendingUp,
    }
  ]

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi, index) => (
        <KpiCard key={index} {...kpi} />
      ))}
    </div>
  )
}

