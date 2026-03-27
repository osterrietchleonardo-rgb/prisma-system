import { DashboardKpis } from "@/components/dashboard-kpis"
import { DashboardActivity } from "@/components/dashboard-activity"
import { Button } from "@/components/ui/button"
import { 
  Plus, 
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
import { Skeleton } from "@/components/ui/skeleton"
import { createClient } from "@/lib/supabase/server"
import { getDashboardData } from "@/lib/queries/dashboard"
import { redirect } from "next/navigation"

const DashboardCharts = dynamic(() => import("@/components/dashboard-charts").then(m => m.DashboardCharts), {
  ssr: false,
  loading: () => <Skeleton className="h-[400px] w-full rounded-2xl" />
})

export default async function DashboardPage() {
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

  const dashboardData = await getDashboardData(profile.agency_id)

  return (
    <div className="space-y-8 animate-in fade-in duration-500 px-4 md:px-8 py-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Dashboard Overview</h2>
          <p className="text-muted-foreground">
            Bienvenido al centro de control de tu inmobiliaria.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="hidden sm:flex border-accent/20 bg-accent/5 transition-all hover:bg-accent/10">
            <Download className="mr-2 h-4 w-4" />
            Exportar
          </Button>
          <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90 shadow-md shadow-accent/20">
            <Plus className="mr-2 h-4 w-4" />
            Nueva Propiedad
          </Button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col gap-4 p-4 rounded-xl border border-accent/10 bg-card/30 backdrop-blur-sm sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Filtros</span>
        </div>
        
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-4 flex-1">
          <Select defaultValue="all">
            <SelectTrigger className="w-full sm:w-[180px] h-9 text-xs">
              <SelectValue placeholder="Asesor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los asesores</SelectItem>
              {/* This could also be fetched from agency agents */}
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                className={"w-full sm:w-[240px] h-9 text-xs justify-start text-left font-normal border-input hover:bg-accent/5"}
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
        </div>

        <Button variant="ghost" size="sm" className="text-xs text-accent font-semibold hover:bg-accent/10 ml-auto">
          Limpiar Filtros
        </Button>
      </div>

      {/* Stats Cards */}
      <DashboardKpis data={dashboardData.kpis} />

      {/* Main Grid: Charts & Activity */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <div className="lg:col-span-4">
          <DashboardCharts data={dashboardData.charts} />
        </div>
        <div className="lg:col-span-3">
          <DashboardActivity data={dashboardData.activity} />
        </div>
      </div>
    </div>
  )
}

