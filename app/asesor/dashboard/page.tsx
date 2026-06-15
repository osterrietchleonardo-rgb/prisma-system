import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { getDashboardData } from "@/lib/queries/dashboard"
import { PerformanceMetricsGrid } from "@/components/dashboard/PerformanceMetricsGrid"
import { PerformanceCharts } from "@/components/performance-charts"
import { PerformanceLeaderboard } from "@/components/performance-leaderboard"
import { ObjectivesDashboard } from "@/components/dashboard/ObjectivesDashboard"
import { getObjectivesDashboard } from "@/lib/tracking/objetivos"
import { DashboardActivity } from "@/components/dashboard-activity"
import { DashboardHeaderActions } from "@/components/dashboard-header-actions"
import { Button } from "@/components/ui/button"
import { TrendingUp, Eye } from "lucide-react"

export default async function AsesorDashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("agency_id")
    .eq("id", user.id)
    .single()

  if (!profile?.agency_id) {
    return <div>Inmobiliaria no configurada</div>
  }

  // Personal KPIs + charts: filtered by this asesor's ID
  // Agency-wide: all advisors for the leaderboard + recent agency activity
  const currentYear = new Date().getFullYear()
  const [myData, agencyData, objectivesData] = await Promise.all([
    getDashboardData(profile.agency_id, user.id),
    getDashboardData(profile.agency_id),           // no agentId → full agency
    getObjectivesDashboard(profile.agency_id, currentYear),
  ])

  return (
    <div id="dashboard-content" className="space-y-8 animate-in fade-in duration-500 px-4 md:px-8 py-8 bg-background">

      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Mi Performance</h1>
          <p className="text-sm text-muted-foreground">
            Tus métricas comerciales personales del período activo.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DashboardHeaderActions data={myData} />
          <Button asChild variant="outline" size="sm" className="h-9 gap-2">
            <Link href="/asesor/tracking-performance">
              <TrendingUp className="h-4 w-4" />
              Subir Log
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="h-9 gap-2">
            <Link href="/asesor/propiedades">
              <Eye className="h-4 w-4" />
              Mi Cartera
            </Link>
          </Button>
        </div>
      </div>

      {/* Personal metrics — 9 cards filtered to this asesor */}
      <PerformanceMetricsGrid kpis={myData.kpis} />

      {/* Personal evolution + channel charts */}
      <PerformanceCharts
        data={myData.charts.performanceEvolution}
        channels={myData.charts.channelDistribution}
      />

      {/* Objetivos vs alcanzado de la inmobiliaria */}
      <ObjectivesDashboard initialData={objectivesData} initialYear={currentYear} />

      {/* Leaderboard: full agency ranking so the asesor can see their position */}
      <PerformanceLeaderboard advisors={agencyData.advisors} />

      {/* Recent agency activity — capped height with internal scroll */}
      <div className="max-h-[480px] overflow-y-auto rounded-xl scrollbar-thin scrollbar-thumb-accent/20">
        <DashboardActivity
          data={agencyData.activity}
        />
      </div>

    </div>
  )
}
