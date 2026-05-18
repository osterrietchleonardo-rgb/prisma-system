"use client"

import { useState, Suspense } from "react"
import { Loader2, Database } from "lucide-react"
import { Badge } from "@/components/ui/badge"

import { LeadsTable } from "@/app/director/leads/components/LeadsTable"
import { useTokkoTagCatalog } from "@/app/director/leads/components/useTokkoTagCatalog"
import { useAsesorTokkoLeads } from "./useAsesorTokkoLeads"

export default function AsesorLeadsPage() {
  return (
    <Suspense fallback={
      <div className="flex h-full w-full items-center justify-center p-20">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    }>
      <AsesorLeadsPageContent />
    </Suspense>
  )
}

function AsesorLeadsPageContent() {
  const { tagsByGroup, loading: loadingTags } = useTokkoTagCatalog()
  const { leads, loading: loadingLeads, refetch, lastSync } = useAsesorTokkoLeads()

  const isLoading = loadingTags || loadingLeads

  return (
    <div className="flex flex-col h-full space-y-6 pt-6 container max-w-[1600px] mx-auto pb-10 px-4 md:px-8 animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground flex flex-wrap items-center gap-3">
            Leads Tokko
            <Badge variant="outline" className="text-[10px] md:text-xs">Mis Leads</Badge>
            {leads.length > 0 && !isLoading && (
              <Badge variant="secondary" className="text-[10px] md:text-xs bg-accent/10 text-accent border-accent/20">
                {leads.length} {leads.length === 1 ? 'lead' : 'leads'}
              </Badge>
            )}
            {isLoading && <Loader2 className="h-4 w-4 md:h-5 md:w-5 animate-spin text-accent" />}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Tus consultas asignadas desde Tokko Broker.
          </p>
        </div>

        {lastSync && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Database className="h-3 w-3" />
            Última carga: {lastSync.toLocaleTimeString("es-AR", { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {/* Main Table — misma que el director */}
      <LeadsTable
        leads={leads}
        loading={isLoading}
        tagsByGroup={tagsByGroup}
        basePath="/asesor/leads"
        onRefresh={async () => { await refetch() }}
      />
    </div>
  )
}
