import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { getDashboardData } from "@/lib/queries/dashboard"
import { PerformanceKpis } from "@/components/performance-kpis"
import { PerformanceLeaderboard } from "@/components/performance-leaderboard"
import { PerformanceCharts } from "@/components/performance-charts"
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription 
} from "@/components/ui/card"
import { 
  Users, 
  Calendar,
  Eye,
  TrendingUp
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DashboardHeaderActions } from "@/components/dashboard-header-actions"
import { format } from "date-fns"
import { es } from "date-fns/locale"

export default async function AsesorDashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  // Get user profile to find agency_id
  const { data: profile } = await supabase
    .from("profiles")
    .select("agency_id")
    .eq("id", user.id)
    .single()

  if (!profile?.agency_id) {
    return <div>Inmobiliaria no configurada</div>
  }

  // Fetch full dashboard data but filtered for this agent's KPIs
  // and the full agency leaderboard for motivation
  const dashboardData = await getDashboardData(profile.agency_id, user.id)

  return (
    <div id="dashboard-content" className="space-y-8 animate-in fade-in duration-500 px-4 md:px-8 py-8 bg-background">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight">Mi Performance</h1>
          <p className="text-muted-foreground italic">
            Tu rendimiento personal y posición en el ranking de la inmobiliaria.
          </p>
        </div>
        <DashboardHeaderActions data={dashboardData} />
      </div>

      <PerformanceKpis data={dashboardData.kpis} />

      <div className="grid gap-8 lg:grid-cols-7">
        <div className="lg:col-span-4 space-y-8">
           <PerformanceCharts data={dashboardData.charts.performanceEvolution} />
           
           {/* Recent Activity */}
           <Card className="border-accent/10 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle>Actividad Reciente</CardTitle>
              <CardDescription>Tus últimos registros y captaciones</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {dashboardData.activity?.length > 0 ? (
                  dashboardData.activity.map((act: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg hover:bg-accent/5 transition-colors border border-transparent hover:border-accent/10">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-accent/10 rounded-lg">
                          <TrendingUp className="h-4 w-4 text-accent" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{act.description}</p>
                          <p className="text-[10px] text-muted-foreground uppercase">
                            {format(new Date(act.created_at), "d 'de' MMMM, HH:mm", { locale: es })}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-center py-4 text-muted-foreground">No hay actividad reciente registrada.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-3 space-y-8">
          <PerformanceLeaderboard advisors={dashboardData.advisors} />
          
          {/* Quick Links */}
          <Card className="border-accent/10 bg-card/50 backdrop-blur-sm border-dashed">
            <CardHeader>
              <CardTitle className="text-lg">Acciones Rápidas</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
               <Button asChild variant="outline" className="h-20 flex-col gap-2">
                  <Link href="/asesor/tracking-performance">
                    <TrendingUp className="h-5 w-5" />
                    <span>Subir Log</span>
                  </Link>
               </Button>
               <Button asChild variant="outline" className="h-20 flex-col gap-2">
                  <Link href="/asesor/propiedades">
                    <Eye className="h-5 w-5" />
                    <span>Mi Cartera</span>
                  </Link>
               </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
