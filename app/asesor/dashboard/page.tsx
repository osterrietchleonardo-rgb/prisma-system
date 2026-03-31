"use client"

import { useAsesorDashboard } from "@/hooks/useAsesorDashboard"
import { createClient } from "@/lib/supabase"
import { useEffect, useState } from "react"
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription 
} from "@/components/ui/card"
import { 
  Users, 
  MessageSquare, 
  CheckCircle2, 
  Calculator, 
  TrendingUp,
  Calendar,
  Eye
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import Link from "next/link"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import dynamic from "next/dynamic"
import { TrackingSection } from "@/components/tracking/TrackingSection"

const EvolutionChart = dynamic(() => import("@/components/asesor-charts").then(m => m.EvolutionChart), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-xl" />
})

export default function AsesorDashboard() {
  const [session, setSession] = useState<Record<string, any> | null>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })
  }, [supabase.auth])

  const { data, loading } = useAsesorDashboard(session?.user?.id)

  if (loading) return <DashboardSkeleton />

  const kpis = [
    { 
      title: "Leads Recibidos", 
      value: data?.kpis?.totalLeads || 0, 
      icon: Users, 
      description: "Asignados hoy",
    },
    { 
      title: "Consultas Activas", 
      value: data?.kpis?.activeConsultations || 0, 
      icon: MessageSquare, 
      description: "Leads en seguimiento",
    },
    { 
      title: "Cierres", 
      value: data?.kpis?.totalClosings || 0, 
      icon: CheckCircle2, 
      description: "Ventas finalizadas",
    },
    { 
      title: "Conversión", 
      value: `${data?.kpis?.conversionRate?.toFixed(1) || 0}%`, 
      icon: TrendingUp, 
      description: "Tasa lead-a-cierre",
    },
    { 
      title: "Tasaciones", 
      value: data?.kpis?.totalValuations || 0, 
      icon: Calculator, 
      description: "AVM generadas",
    },
  ]

  return (
    <div className="space-y-8 animate-in fade-in duration-500 px-4 md:px-8 py-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Mi Dashboard</h1>
        <p className="text-muted-foreground italic">
          Bienvenido de nuevo. Aquí tienes un resumen de tu actividad comercial real.
        </p>
      </div>

      <TrackingSection isDirector={false} />

      <div className="grid gap-8 md:grid-cols-7">
        {/* Evolution Chart */}
        <Card className="md:col-span-4 border-accent/10 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Evolución de Rendimiento</CardTitle>
            <CardDescription>Comparativa de Leads vs Cierres (últimos 6 meses)</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px] flex items-center justify-center">
            {data?.leadsEvolution?.length > 0 ? (
              <EvolutionChart data={data?.leadsEvolution} />
            ) : (
              <div className="text-center text-muted-foreground text-sm py-20">
                <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-20" />
                No hay datos históricos para graficar la evolución.
              </div>
            )}
          </CardContent>
        </Card>


        {/* Sidebar Widgets */}
        <div className="md:col-span-3 space-y-8">
          {/* Upcoming Visits */}
          <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Próximas Visitas</CardTitle>
                <CardDescription>Tus citas para hoy y mañana</CardDescription>
              </div>
              <Calendar className="h-5 w-5 text-accent opacity-50" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data?.upcomingVisits?.length > 0 ? (
                  data.upcomingVisits.map((visit: Record<string, any>, i: number) => (
                    <div key={i} className="flex items-center gap-4 p-3 rounded-lg bg-accent/5 border border-accent/10 hover:bg-accent/10 transition-colors">
                      <div className="flex-1">
                        <p className="text-sm font-semibold">{visit.lead?.full_name}</p>
                        <p className="text-xs text-muted-foreground truncate">{visit.property?.title}</p>
                        <p className="text-[10px] text-accent font-bold mt-1 uppercase">
                          {format(new Date(visit.visit_date), "HH:mm 'hs' — d 'de' MMMM", { locale: es })}
                        </p>
                      </div>
                      <Badge variant={visit.status === 'confirmed' ? 'default' : 'outline'}>
                        {visit.status === 'confirmed' ? 'Confirmada' : 'Pendiente'}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-center py-4 text-muted-foreground">No tienes visitas agendadas próximamente.</p>
                )}
              </div>
              <Button asChild variant="link" className="w-full mt-4 text-accent p-0">
                <Link href="/asesor/calendario">Ver calendario completo</Link>
              </Button>
            </CardContent>
          </Card>

          {/* Recent Leads */}
          <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Leads Recientes</CardTitle>
                <CardDescription>Últimos contactos asignados</CardDescription>
              </div>
              <Users className="h-5 w-5 text-accent opacity-50" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data?.recentLeads?.length > 0 ? (
                  data.recentLeads.map((lead: Record<string, any>, i: number) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg hover:bg-accent/5 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-xs">
                          {lead.full_name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{lead.full_name}</p>
                          <p className="text-[10px] text-muted-foreground uppercase">{lead.pipeline_stage}</p>
                        </div>
                      </div>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-accent" asChild>
                        <Link href={`/asesor/pipeline?lead=${lead.id}`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-center py-4 text-muted-foreground">No hay leads nuevos asignados.</p>
                )}
              </div>
              <Button asChild variant="link" className="w-full mt-4 text-accent p-0">
                <Link href="/asesor/pipeline">Gestionar en Pipeline</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="space-y-2">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
      <div className="grid gap-8 md:grid-cols-7">
        <Skeleton className="md:col-span-4 h-[450px] w-full" />
        <div className="md:col-span-3 space-y-8">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    </div>
  )
}
