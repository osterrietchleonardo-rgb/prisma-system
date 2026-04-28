"use client"

import { useState, useEffect } from "react"
import { KanbanBoard } from "@/components/kanban/kanban-board"
import { LeadDetailSheet } from "@/components/kanban/lead-detail-sheet"
import { Lead } from "@/components/kanban/types"
import { 
  Search, 
  Calendar,
  Filter,
  Plus
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { createClient } from "@/lib/supabase"
import { getAsesorLeads } from "@/lib/queries/asesor"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"

export default function AsesorPipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        
        const leadsData = await getAsesorLeads(session.user.id)
        setLeads(leadsData as unknown as Lead[])
      } catch (_error) {
        console.error("Error loading pipeline data:", _error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const filteredLeads = leads.filter(lead => {
    return lead.full_name.toLowerCase().includes(search.toLowerCase()) || 
           (lead.email && lead.email.toLowerCase().includes(search.toLowerCase())) ||
           (lead.phone && lead.phone.includes(search))
  })

  const handleOpenDetail = (lead: Lead) => {
    setSelectedLead(lead)
    setIsSheetOpen(true)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── ESTÁTICO: Título + Botones ── */}
      <div className="flex items-center justify-between px-4 md:px-8 pt-6 pb-4 shrink-0">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            Mi Pipeline
            <Badge variant="outline" className="text-xs font-semibold border-accent/20 bg-accent/5">
              Personal
            </Badge>
          </h2>
          <p className="text-muted-foreground mt-1">
            Gestiona tus leads y el avance de tus negociaciones.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="hidden md:flex gap-2">
            <a href="/asesor/calendario">
              <Calendar className="h-4 w-4" />
              Mi Agenda
            </a>
          </Button>
          <Button className="bg-accent hover:bg-accent/90 gap-2">
            <Plus className="h-4 w-4" />
            Nuevo Lead
          </Button>
        </div>
      </div>

      {/* ── ESTÁTICO: Filtros ── */}
      <div className="px-4 md:px-8 pb-4 shrink-0">
        <div className="bg-card/30 backdrop-blur-md p-4 rounded-2xl border border-accent/10 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar en mis leads..."
              className="pl-10 bg-background/50 border-accent/10 focus-visible:ring-accent/30"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="h-4 w-4" />
              Filtros
            </Button>
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
        onScheduleVisit={(id) => console.log("Schedule visit", id)}
        onLogActivity={(id) => console.log("Log activity", id)}
        isAdvisor={true}
      />
    </div>
  )
}
