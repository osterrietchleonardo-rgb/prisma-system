"use client"

import { useState } from "react"
import { KanbanBoard } from "@/components/kanban/kanban-board"
import { LeadDetailSheet } from "@/components/kanban/lead-detail-sheet"
import { Lead } from "@/components/kanban/types"
import { 
  Search, 
  Calendar,
  Filter,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface PipelineClientProps {
  initialLeads: Lead[]
}

export default function PipelineClient({ initialLeads }: PipelineClientProps) {
  const [search, setSearch] = useState("")
  const [sourceFilter, setSourceFilter] = useState("all")
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)

  const filteredLeads = initialLeads.filter(lead => {
    const matchesSearch = 
      lead.full_name.toLowerCase().includes(search.toLowerCase()) || 
      (lead.email && lead.email.toLowerCase().includes(search.toLowerCase())) ||
      (lead.phone && lead.phone.includes(search))
    
    const matchesSource = sourceFilter === "all" || lead.source === sourceFilter

    return matchesSearch && matchesSource
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
            <div className="flex items-center gap-2 w-full lg:min-w-[150px]">
              <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
              <select 
                className="h-9 w-full bg-background/50 border border-accent/10 rounded-md text-xs md:text-sm px-3 py-1 focus-visible:ring-1 focus-visible:ring-accent/30 outline-none"
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
              >
                <option value="all">Todos los orígenes</option>
                <option value="WhatsApp">WhatsApp</option>
                <option value="Tokko Broker">Tokko Broker</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ── SCROLLEABLE HORIZONTAL: Solo el Kanban ── */}
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden">
        {filteredLeads.length === 0 && initialLeads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground px-8">
            <p className="text-lg font-medium">No tienes leads asignados aún.</p>
            <p className="text-sm">Los leads que te asignen desde WhatsApp o Tokko aparecerán aquí.</p>
          </div>
        ) : (
          <KanbanBoard 
            initialLeads={filteredLeads} 
            onCardClick={handleOpenDetail} 
            detailsUrl="/asesor/leads"
          />
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
