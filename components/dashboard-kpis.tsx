import { 
  Users, 
  Calendar, 
  Calculator, 
  TrendingUp,
  Home,
  Tags,
  Share2,
  LucideIcon
} from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

interface KpiCardProps {
  title: string
  value?: string | number
  description?: string
  icon: LucideIcon
  items?: Array<{ label: string, count: number }>
}

function KpiCard({ title, value, description, icon: Icon, items }: KpiCardProps) {
  return (
    <Card className="overflow-hidden border-accent/10 bg-card/50 backdrop-blur-sm transition-all hover:border-accent/30 hover:shadow-lg group">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="p-2 bg-accent/10 rounded-lg group-hover:bg-accent/20 transition-colors">
          <Icon className="h-4 w-4 text-accent" />
        </div>
      </CardHeader>
      <CardContent>
        {value !== undefined ? (
          <>
            <div className="text-2xl font-bold">{value}</div>
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
          </>
        ) : (
          <div className="space-y-2 mt-1">
            {items?.slice(0, 3).map((item, i) => (
              <div key={i} className="flex justify-between items-center group/item">
                <span className="text-xs font-medium text-muted-foreground group-hover/item:text-foreground transition-colors truncate mr-2">
                  {item.label}
                </span>
                <span className="text-xs font-bold bg-accent/10 px-1.5 py-0.5 rounded text-accent">
                  {item.count}
                </span>
              </div>
            ))}
            {(!items || items.length === 0) && (
              <p className="text-xs text-muted-foreground italic">Sin datos</p>
            )}
          </div>
        )}
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
    sourceDistribution: Array<{ label: string, count: number }>
    operationDistribution: Array<{ label: string, count: number }>
    typeDistribution: Array<{ label: string, count: number }>
  }
}

export function DashboardKpis({ data }: DashboardKpisProps) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {/* KPIs Numéricos Principales */}
      <KpiCard 
        title="Leads Nuevos" 
        value={data.newLeads} 
        description="En estado nuevo" 
        icon={Users} 
      />
      <KpiCard 
        title="Visitas Pendientes" 
        value={data.pendingVisits} 
        description="Próximos días" 
        icon={Calendar} 
      />
      <KpiCard 
        title="Cierres / Ventas" 
        value={new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(data.salesVolume)} 
        description="Volumen total" 
        icon={TrendingUp} 
      />
    </div>
  )
}

