"use client"

import { LeadsDashboard } from "@/app/director/leads/components/LeadsDashboard"
import { useTokkoLeads } from "@/app/director/leads/components/useTokkoLeads"
import { useTokkoTagCatalog } from "@/app/director/leads/components/useTokkoTagCatalog"
import { Loader2, Database } from "lucide-react"

export function DashboardLeadsSection() {
  const { leads, loading: loadingLeads, lastSync } = useTokkoLeads()
  const { tagsByGroup, loading: loadingTags } = useTokkoTagCatalog()

  const isLoading = loadingLeads || loadingTags;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-card/30 border border-accent/10 rounded-2xl h-[400px]">
        <Loader2 className="h-10 w-10 animate-spin text-accent mb-4" />
        <h3 className="text-lg font-bold">Cargando métricas de leads...</h3>
      </div>
    )
  }

  return (
    <div className="mt-12 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
           <div className="flex items-center gap-3">
             <h3 className="text-2xl font-bold tracking-tight">Leads Comerciales</h3>
             <span className="bg-accent/10 text-accent border border-accent/20 px-2 py-1 rounded-md text-xs font-semibold">
               Dashboard Estratégico
             </span>
           </div>
          <p className="text-muted-foreground mt-1">Métricas y rendimiento de contactos sincronizados con Tokko Broker.</p>
        </div>
      </div>

      {leads.length > 0 ? (
        <LeadsDashboard leads={leads} tagsByGroup={tagsByGroup} />
      ) : (
        <div className="flex flex-col items-center justify-center p-12 bg-card/30 border border-accent/10 rounded-2xl h-[400px]">
          <Database className="h-10 w-10 text-muted-foreground opacity-30 mb-4" />
          <h3 className="text-lg font-bold">No hay datos suficientes</h3>
          <p className="text-muted-foreground text-sm mt-1 max-w-md text-center">
            Aún no hay leads sincronizados para generar estadisticas. Ve a CRM Leads y sincroniza la base con Tokko.
          </p>
        </div>
      )}
    </div>
  )
}
