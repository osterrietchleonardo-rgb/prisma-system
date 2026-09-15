import { DashboardKpis } from "@/components/dashboard-kpis"
import { PerformanceKpis } from "@/components/performance-kpis"
import { PerformanceLeaderboard } from "@/components/performance-leaderboard"
import { PerformanceMetricsGrid } from "@/components/dashboard/PerformanceMetricsGrid"
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
import { Skeleton } from "@/components/ui/skeleton"
import dynamic from "next/dynamic"
import { createClient } from "@/lib/supabase/server"
import { getDashboardData, getPipelineDashboardData } from "@/lib/queries/dashboard"
import { getPropertiesDashboardData } from "@/lib/queries/properties-dashboard"
import { redirect } from "next/navigation"
import { DashboardLeadsSection } from "./components/DashboardLeadsSection"
import { ConversationalIntelligence } from "./components/conversational/ConversationalIntelligence"
import { DashboardPropertiesSection } from "./components/DashboardPropertiesSection"
import { DashboardPipelineSection } from "./components/DashboardPipelineSection"
import { PerformanceCharts } from "@/components/performance-charts"
import { ObjectivesDashboard } from "@/components/dashboard/ObjectivesDashboard"
import { getObjectivesDashboard } from "@/lib/tracking/objetivos"
import { AdvisorFilter } from "@/components/dashboard/advisor-filter"
import { DatePeriodFilter } from "@/components/dashboard/DatePeriodFilter"
import { HandoffsPanel } from "@/components/dashboard/HandoffsPanel"
import { getHandoffsDashboardData } from "@/lib/queries/handoffs"
import { periodoDelDashboard } from "@/lib/dashboard/periodo"

const DashboardCharts = dynamic(() => import("@/components/dashboard-charts").then(m => m.DashboardCharts), {
  ssr: false,
  loading: () => <Skeleton className="h-[400px] w-full rounded-2xl" />
})

export const revalidate = 0;

export default async function DashboardPage({
  searchParams
}: {
  searchParams: { agentId?: string; from?: string; to?: string }
}) {
  const agentId = searchParams.agentId
  // Sin período elegido, el filtro muestra "Últimos 30 días": las consultas tienen que
  // contar eso mismo, no todo el historial (defecto del 7/9/2026: el panel de derivaciones
  // de Kevin arrastraba desde julio bajo un cartel que decía 30 días).
  const { from, to } = periodoDelDashboard(searchParams)
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

  // Todo responde al filtro de arriba (fechas + asesor). Los objetivos son anuales: toman el año
  // en que termina el período elegido.
  const anioFiltro = Number(to.slice(0, 4)) || new Date().getFullYear()
  const [dashboardData, propertiesData, pipelineData, objectivesData, handoffsData] = await Promise.all([
    getDashboardData(profile.agency_id, agentId, from, to),
    getPropertiesDashboardData(profile.agency_id, agentId, to),
    getPipelineDashboardData(profile.agency_id, agentId, from, to),
    getObjectivesDashboard(profile.agency_id, anioFiltro),
    getHandoffsDashboardData(profile.agency_id, agentId, from, to),
  ])
  const objetivosDelFiltro = agentId ? objectivesData.filter((o) => o.agentId === agentId) : objectivesData
  // El desplegable de asesores necesita la lista entera; el ranking, sólo el elegido.
  const rankingDelFiltro = agentId ? dashboardData.advisors.filter((a) => a.id === agentId) : dashboardData.advisors

  return (
    <div id="dashboard-content" className="space-y-8 animate-in fade-in duration-300 px-4 md:px-8 py-8 bg-background">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Performance Advisor
          </h1>
          <p className="text-sm text-muted-foreground">
            Seguimiento de métricas comerciales y evolución de asesores.
          </p>
        </div>
        <DashboardHeaderActions data={dashboardData} />
      </div>

      {/* Filtro de arriba: queda fijo al hacer scroll y TODAS las métricas le responden.
          En el celular va compacto (dos filas) para no comerse la pantalla. */}
      <div className="sticky top-0 z-30 -mx-2 flex flex-col gap-2 rounded-xl border border-accent/10 bg-card/95 p-2 shadow-lg backdrop-blur-md sm:mx-0 sm:flex-row sm:items-center sm:gap-6 sm:p-4">
        <div className="flex-1 w-full">
          <AdvisorFilter advisors={dashboardData.advisors.map(a => ({ id: a.id, name: a.name }))} />
        </div>

        <div className="flex flex-row items-center gap-2 sm:gap-4 w-full sm:w-auto">
          <div className="flex-1 min-w-0 sm:flex-initial">
            <DatePeriodFilter />
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-xs text-accent font-semibold hover:bg-accent/10 h-10 sm:h-9 border border-accent/10 sm:border-none"
            asChild
          >
            <a href="?">Limpiar</a>
          </Button>
        </div>
      </div>

      <PerformanceMetricsGrid kpis={dashboardData.kpis} />

      {/* Derivaciones del bot que ningún asesor atendió todavía — arriba porque es urgente */}
      <HandoffsPanel data={handoffsData} basePath="/director" scope="agencia" />

      <PerformanceCharts
        data={dashboardData.charts.performanceEvolution} 
        channels={dashboardData.charts.channelDistribution}
      />

      {/* key: al cambiar el filtro, la tabla arranca de nuevo con el año y el asesor elegidos. */}
      <ObjectivesDashboard
        key={`${anioFiltro}-${agentId ?? "todos"}`}
        initialData={objetivosDelFiltro}
        initialYear={anioFiltro}
        agentId={agentId}
      />

      <div className="grid gap-6 lg:grid-cols-7">
        <div className="lg:col-span-7 w-full overflow-hidden">
          <PerformanceLeaderboard advisors={rankingDelFiltro} />
        </div>
      </div>

      <ConversationalIntelligence />

      <DashboardPipelineSection
        stages={pipelineData.stages}
        summary={pipelineData.summary}
      />

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
