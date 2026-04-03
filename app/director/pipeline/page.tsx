"use client"

import { useState, useEffect } from "react"
import { KanbanBoard } from "@/components/kanban/kanban-board"
import { LeadDetailSheet } from "@/components/kanban/lead-detail-sheet"
import { Lead } from "@/components/kanban/types"
import { 
  Search, 
  Filter, 
  Plus, 
  Download,
  LayoutGrid,
  ListFilter
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { getAgencyLeads, getAgencyAgents } from "@/lib/queries/director"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

export default function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [agents, setAgents] = useState<{id: string, full_name: string}[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [agentFilter, setAgentFilter] = useState("all")
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)



  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        const { createClient } = await import("@/lib/supabase/client")
        const supabase = createClient()
        
        const { data: { session } } = await supabase.auth.getSession()
        const userAgencyId = session?.user?.user_metadata?.agency_id || session?.user?.email // Fallback or improved logic
        
        // Let's also try to get it from profile if not in metadata
        let finalAgencyId = userAgencyId
        if (!finalAgencyId && session?.user?.id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('agency_id')
            .eq('id', session.user.id)
            .single()
          finalAgencyId = profile?.agency_id
        }

        if (finalAgencyId) {
          const [leadsData, agentsData] = await Promise.all([
            getAgencyLeads({ agencyId: finalAgencyId }).catch(() => []),
            getAgencyAgents({ agencyId: finalAgencyId }).catch(() => [])
          ])
          
          setLeads(leadsData as unknown as Lead[])
          setAgents(agentsData)
        }
      } catch (error) {
        console.error("Error loading pipeline data:", error)
        toast.error("Error al cargar los leads")
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const filteredLeads = leads?.filter(lead => {
    if (!lead) return false;
    
    const fullName = lead.full_name || "";
    const email = lead.email || "";
    const phone = lead.phone || "";

    const matchesSearch = fullName.toLowerCase().includes(search.toLowerCase()) || 
                          email.toLowerCase().includes(search.toLowerCase()) ||
                          phone.includes(search)
    
    const matchesAgent = agentFilter === "all" || lead.assigned_agent_id === agentFilter
    
    return matchesSearch && matchesAgent
  }) || []

  const handleOpenDetail = (lead: Lead) => {
    setSelectedLead(lead)
    setIsSheetOpen(true)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── ESTÁTICO: Título + Botones ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between px-4 md:px-8 pt-6 pb-4 shrink-0 gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2 overflow-hidden">
            <span className="truncate">Pipeline Global</span>
            <Badge variant="secondary" className="text-[10px] font-semibold bg-accent/10 text-accent border-none px-1.5 py-0">
              Beta
            </Badge>
          </h2>
          <p className="text-xs md:text-sm text-muted-foreground mt-1 line-clamp-1">
            Gestiona el embudo comercial de toda tu inmobiliaria.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" className="hidden sm:flex gap-2 h-9 text-xs md:text-sm">
            <Download className="h-4 w-4" />
            Exportar
          </Button>
          <Button className="flex-1 sm:flex-none bg-accent hover:bg-accent/90 gap-2 h-9 text-xs md:text-sm">
            <Plus className="h-4 w-4" />
            <span className="inline sm:inline">Nuevo Lead</span>
          </Button>
        </div>
      </div>

      {/* ── ESTÁTICO: Filtros ── */}
      <div className="px-4 md:px-8 pb-4 shrink-0">
        <div className="bg-card/30 backdrop-blur-md p-3 md:p-4 rounded-2xl border border-accent/10 flex flex-col lg:flex-row gap-3 md:gap-4 items-center justify-between">
          <div className="relative w-full lg:w-96 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              className="pl-10 h-9 bg-background/50 border-accent/10 focus-visible:ring-accent/30 text-xs md:text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
            <div className="flex items-center gap-2 w-full lg:min-w-[200px]">
              <ListFilter className="h-4 w-4 text-muted-foreground shrink-0" />
              <Select value={agentFilter} onValueChange={setAgentFilter}>
                <SelectTrigger className="h-9 bg-background/50 border-accent/10 text-xs md:text-sm">
                  <SelectValue placeholder="Filtrar por asesor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los asesores</SelectItem>
                  {agents.map(agent => (
                    <SelectItem key={agent.id} value={agent.id}>{agent.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator orientation="vertical" className="h-8 hidden lg:block" />

            <div className="flex items-center gap-1 bg-muted px-1 py-1 rounded-lg self-end sm:self-auto">
              <Button variant="ghost" size="icon" className="h-7 w-7 md:h-8 md:w-8 bg-background shadow-sm">
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 md:h-8 md:w-8 text-muted-foreground">
                <Filter className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ── SCROLLEABLE HORIZONTAL: Solo el Kanban ── */}
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden">
        {loading ? (
          <div className="flex gap-4 px-4 md:px-8 pb-4 h-full">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="w-[300px] shrink-0 space-y-4">
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="h-[120px] w-full rounded-xl" />
                <Skeleton className="h-[120px] w-full rounded-xl" />
              </div>
            ))}
          </div>
        ) : (
          <KanbanBoard initialLeads={filteredLeads} onCardClick={handleOpenDetail} />
        )}
      </div>

      {/* Detail Sheet */}
      <LeadDetailSheet
        lead={selectedLead}
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        onAssignAgent={(id) => console.log("Assign agent to lead", id)}
        onScheduleVisit={(id) => console.log("Schedule visit for lead", id)}
        onLogActivity={(id) => console.log("Log activity", id)}
      />
    </div>
  )
}

