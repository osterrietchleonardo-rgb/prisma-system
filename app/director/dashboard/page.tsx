import { DashboardKpis } from "@/components/dashboard-kpis"
import { PerformanceKpis } from "@/components/performance-kpis"
import { PerformanceLeaderboard } from "@/components/performance-leaderboard"
import { DashboardActivity } from "@/components/dashboard-activity"
import { Button } from "@/components/ui/button"
import { DashboardHeaderActions } from "@/components/dashboard-header-actions"
import { 
  Download, 
  Filter,
  Calendar as CalendarIcon
} from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import dynamic from "next/dynamic"
import { createClient } from "@/lib/supabase/server"
import { getDashboardData } from "@/lib/queries/dashboard"
import { getPropertiesDashboardData } from "@/lib/queries/properties-dashboard"
import { redirect } from "next/navigation"
import { DashboardLeadsSection } from "./components/DashboardLeadsSection"
import { DashboardPropertiesSection } from "./components/DashboardPropertiesSection"
import { PerformanceCharts } from "@/components/performance-charts"
import { AdvisorFilter } from "@/components/dashboard/advisor-filter"

const DashboardCharts = dynamic(() => import("@/components/dashboard-charts").then(m => m.DashboardCharts), {
  ssr: false,
  loading: () => <Skeleton className="h-[400px] w-full rounded-2xl" />
})

export default async function DashboardPage({
  searchParams
}: {
  searchParams: { agentId?: string }
}) {
  const agentId = searchParams.agentId
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
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <h2 className="text-2xl font-bold">Inmobiliaria no configurada</h2>
        <p className="text-muted-foreground">Por favor, contacta a soporte o configura tu perfil.</p>
      </div>
    )
  }

  const [dashboardData, propertiesData] = await Promise.all([
    getDashboardData(profile.agency_id, agentId),
    getPropertiesDashboardData(profile.agency_id)
  ])

  return (
    <div id="dashboard-content" className="space-y-8 animate-in fade-in duration-300 px-4 md:px-8 py-8 bg-background">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Performance Advisor
          </h1>
          <p className="text-sm text-muted-foreground">
            Seguimiento de métricas comerciales y evolución de asesores.
          </p>
        </div>
        <DashboardHeaderActions data={dashboardData} />
      </div>

      {/* Filters Bar at the TOP */}
      <div className="flex flex-col gap-4 p-4 rounded-xl border border-accent/10 bg-card/30 backdrop-blur-sm sm:flex-row sm:items-center">
        <AdvisorFilter advisors={dashboardData.advisors.map(a => ({ id: a.id, name: a.name }))} />
        
        <div className="ml-auto flex items-center gap-4">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                className={"w-full sm:w-[240px] h-10 md:h-9 text-xs justify-start text-left font-normal border-input hover:bg-accent/5"}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                <span>Últimos 30 días</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                initialFocus
                mode="range"
                numberOfMonths={1}
              />
            </PopoverContent>
          </Popover>

          <Button variant="ghost" size="sm" className="text-xs text-accent font-semibold hover:bg-accent/10">
            Limpiar Filtros
          </Button>
        </div>
      </div>

      <PerformanceKpis data={dashboardData.kpis} />
      
      <PerformanceCharts data={dashboardData.charts.performanceEvolution} />

      <div className="grid gap-6 lg:grid-cols-7">
        <div className="lg:col-span-7">
          <PerformanceLeaderboard advisors={dashboardData.advisors} />
        </div>
      </div>

      <DashboardLeadsSection />

      {propertiesData && (
        <DashboardPropertiesSection data={propertiesData} />
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <div className="lg:col-span-7">
          <DashboardActivity 
            data={dashboardData.activity} 
            advisors={dashboardData.advisors.map(a => ({ id: a.id, name: a.name }))} 
          />
        </div>
      </div>
    </div>
  )
}
