import { LeadsDashboard } from "@/app/director/leads/components/LeadsDashboard"
import type { LeadsDashboardData } from "@/lib/queries/leads-dashboard"
import { etiquetaPeriodo } from "@/lib/dashboard/periodo"
import { Database } from "lucide-react"

/**
 * Leads Comerciales: los leads que Tokko sincroniza, con el período y el asesor del filtro de
 * arriba. Antes (hasta el 15/9/2026) la sección llamaba a la API de Tokko desde el navegador
 * —la sección quedaba "cargando" y el resultado ni se usaba— y tenía sus propios filtros.
 * Ahora los números llegan calculados desde el servidor (lib/queries/leads-dashboard.ts).
 */
export function DashboardLeadsSection({ data }: { data: LeadsDashboardData }) {
  const periodo = etiquetaPeriodo(data.from, data.to)

  return (
    <section className="mt-12 space-y-6">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-2xl font-bold tracking-tight">Leads Comerciales</h3>
          <span className="rounded-md border border-accent/20 bg-accent/10 px-2 py-1 text-xs font-semibold text-accent">
            Datos de Tokko
          </span>
        </div>
        <p className="text-sm font-medium text-foreground">
          Leads de Tokko que entraron en el período ({periodo})
          {data.agentId ? ", del asesor elegido arriba" : ""}.
        </p>
        <p className="text-xs text-muted-foreground">
          Se cuentan por el día en que el lead entró a Tokko. El estado de cada lead es el que tiene hoy en Tokko.
        </p>
      </div>

      {data.total > 0 ? (
        <LeadsDashboard data={data} />
      ) : (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-accent/10 bg-card/30 p-8 text-center sm:p-12">
          <Database className="mb-4 h-10 w-10 text-muted-foreground opacity-30" />
          <h4 className="text-lg font-bold">No entraron leads de Tokko en este período</h4>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Probá con un período más largo{data.agentId ? " o con otro asesor" : ""} en el filtro de arriba. Si esperabas
            ver leads, revisá en CRM Leads que la base de Tokko esté sincronizada.
          </p>
        </div>
      )}
    </section>
  )
}
