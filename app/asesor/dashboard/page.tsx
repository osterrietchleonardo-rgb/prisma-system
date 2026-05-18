import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { getDashboardData } from "@/lib/queries/dashboard"
import { PerformanceMetricsGrid } from "@/components/dashboard/PerformanceMetricsGrid"
import { PerformanceCharts } from "@/components/performance-charts"
import { PerformanceLeaderboard } from "@/components/performance-leaderboard"
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

  // Same query as the director but locked to this asesor's ID
  const dashboardData = await getDashboardData(profile.agency_id, user.id)

  return (
    <div id="dashboard-content" className="space-y-8 animate-in fade-in duration-500 px-4 md:px-8 py-8 bg-background">

      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight text-white">Mi Performance</h1>
          <p className="text-sm text-muted-foreground">
            Tus métricas comerciales personales del período activo.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DashboardHeaderActions data={dashboardData} />
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

      {/* Full metrics grid — same 9 cards as director */}
      <PerformanceMetricsGrid kpis={dashboardData.kpis} />

      {/* Evolution + Channel charts */}
      <PerformanceCharts
        data={dashboardData.charts.performanceEvolution}
        channels={dashboardData.charts.channelDistribution}
      />

      {/* Leaderboard: asesor can see where they rank in the agency */}
      <PerformanceLeaderboard advisors={dashboardData.advisors} />

      {/* Recent activity (rich component with avatars and badges) */}
      <DashboardActivity
        data={dashboardData.activity}
      />

    </div>
  )
}
