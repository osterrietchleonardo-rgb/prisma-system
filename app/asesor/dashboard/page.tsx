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
import { DatePeriodFilter } from "@/components/dashboard/DatePeriodFilter"
import { HandoffsPanel } from "@/components/dashboard/HandoffsPanel"
import { getHandoffsDashboardData } from "@/lib/queries/handoffs"
import { Button } from "@/components/ui/button"
import { TrendingUp, Eye } from "lucide-react"

export const revalidate = 0;

export default async function AsesorDashboardPage({
  searchParams
}: {
  searchParams: { from?: string; to?: string }
}) {
  const from = searchParams.from
  const to = searchParams.to
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
  const [myData, agencyData, objectivesData, handoffsData] = await Promise.all([
    getDashboardData(profile.agency_id, user.id, from, to),
    getDashboardData(profile.agency_id, undefined, from, to),  // no agentId → full agency
    getObjectivesDashboard(profile.agency_id, currentYear),
    getHandoffsDashboardData(profile.agency_id, user.id, from, to),  // solo las derivaciones propias
  ])

  // ── Privacidad del asesor ──────────────────────────────────────────────────
  // El asesor ve el ranking completo (posición, chats, ACM, captaciones, cierres, rotación...)
  // pero la FACTURACIÓN es solo la suya. El resto llega en `null` y la tabla muestra "Privado".
  //
  // Se tapa acá, en el server component, y NO en el componente cliente: si se mandara el número
  // y solo se ocultara en pantalla, seguiría viajando en el payload y cualquiera lo leería desde
  // las herramientas del navegador. Ordenamos ANTES de tapar, así el ranking sigue siendo el real.
  const rankingAdvisors = [...agencyData.advisors]
    .sort((a: any, b: any) => (b.facturacion || 0) - (a.facturacion || 0))
    .map((a: any) =>
      a.id === user.id
        ? a
        // El motivo de la clasificación también se va: el texto cita el monto exacto.
        : { ...a, facturacion: null, classificationReason: null }
    )

  // Objetivos: el asesor solo ve su propia fila (metas y cumplimiento del resto = privados).
  // Filtrado en el server por el mismo motivo. El recargar-por-año también viene ya filtrado
  // desde `getObjectivesDashboardForYear`, que resuelve el rol del usuario logueado.
  const misObjetivos = objectivesData.filter((o) => o.agentId === user.id)

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
        <div className="flex flex-wrap items-center gap-3">
          <DatePeriodFilter />
          {(from || to) && (
            <Button asChild variant="ghost" size="sm" className="h-9 text-xs text-accent font-semibold">
              <Link href="/asesor/dashboard">Limpiar</Link>
            </Button>
          )}
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

      {/* Clientes que el bot le derivó y todavía no atendió */}
      <HandoffsPanel data={handoffsData} basePath="/asesor" scope="propio" />

      {/* Personal evolution + channel charts */}
      <PerformanceCharts
        data={myData.charts.performanceEvolution}
        channels={myData.charts.channelDistribution}
      />

      {/* Objetivos vs alcanzado — solo la fila del asesor logueado */}
      <ObjectivesDashboard initialData={misObjetivos} initialYear={currentYear} alcance="propio" />

      {/* Ranking completo de la agencia para que vea su posición, con la facturación ajena tapada */}
      <PerformanceLeaderboard advisors={rankingAdvisors} />

      {/* Recent agency activity — capped height with internal scroll */}
      <div className="max-h-[480px] overflow-y-auto rounded-xl scrollbar-thin scrollbar-thumb-accent/20">
        <DashboardActivity
          data={agencyData.activity}
        />
      </div>

    </div>
  )
}
