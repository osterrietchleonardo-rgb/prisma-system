"use client"

import { useState, Suspense } from "react"
import { RefreshCcw, Loader2, Users, Database } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

import { LeadsTable } from "./components/LeadsTable"
import { useTokkoLeads } from "./components/useTokkoLeads"
import { useTokkoTagCatalog } from "./components/useTokkoTagCatalog"
import { LeadModal } from "./lead-modal"

export default function CRMLeadsPage() {
  return (
    <Suspense fallback={
      <div className="flex h-full w-full items-center justify-center p-20">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    }>
      <CRMLeadsPageContent />
    </Suspense>
  )
}

function CRMLeadsPageContent() {
  const [syncing, setSyncing] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { tagsByGroup, loading: loadingTags } = useTokkoTagCatalog()
  const { leads, loading: loadingLeads, refetch, lastSync } = useTokkoLeads()

  const handleSync = async () => {
    setSyncing(true)
    const toastId = toast.loading("Sincronizando Leads de Tokko Broker...")
    try {
      const res = await fetch("/api/tokko/sync-leads", { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "all" })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error de sincronización");
      
      await refetch();
      toast.success(`✅ Total de ${data.imported || 0} leads sincronizados en CRM`, { id: toastId });
    } catch (err: any) {
      toast.error(err.message || "Error al sincronizar leads", { id: toastId })
    } finally {
      setSyncing(false)
    }
  }

  const isLoading = loadingTags || loadingLeads || syncing;

  return (
    <div className="flex flex-col h-full space-y-6 pt-6 container max-w-[1600px] mx-auto pb-10 px-4 md:px-8 animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground flex flex-wrap items-center gap-3">
            Leads Tokko
            <Badge variant="outline" className="text-[10px] md:text-xs">CRM Sincronizado</Badge>
            {leads.length > 0 && !isLoading && (
              <Badge variant="secondary" className="text-[10px] md:text-xs bg-accent/10 text-accent border-accent/20">
                {leads.length} {leads.length === 1 ? 'lead' : 'leads'}
              </Badge>
            )}
            {isLoading && <Loader2 className="h-4 w-4 md:h-5 md:w-5 animate-spin text-accent" />}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Gestión inteligente de contactos y dashboard estratégico sincronizado con Tokko Broker.
          </p>
        </div>
        
        <div className="flex items-center gap-4">
           {lastSync && (
             <span className="text-xs text-muted-foreground hidden lg:flex items-center gap-1">
               <Database className="h-3 w-3" />
               Última sync: {lastSync.toLocaleTimeString("es-AR", { hour: '2-digit', minute: '2-digit' })}
             </span>
           )}
          <Button 
            variant="outline" 
            onClick={handleSync} 
            disabled={isLoading}
            className="gap-2 bg-card/50 border-accent/20 hover:bg-accent/10 hover:border-accent border-solid hover:text-accent transition-all active:scale-95 shadow-sm"
          >
            <RefreshCcw className={cn("h-4 w-4 transition-transform duration-700", isLoading && "animate-spin")} />
            {isLoading ? "Sincronizando..." : "Actualizar Base"}
          </Button>
          <LeadModal 
            isOpen={isModalOpen} 
            setIsOpen={setIsModalOpen} 
            onSuccess={async () => {
              await refetch()
            }} 
          />
        </div>
      </div>

      {/* Main Table */}
      <div className="mt-6">
        <LeadsTable leads={leads} loading={isLoading} tagsByGroup={tagsByGroup} />
      </div>
    </div>
  )
}
