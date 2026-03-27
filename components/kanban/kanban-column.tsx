"use client"

import { useDroppable } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { KanbanCard } from "./kanban-card"
import { Lead, KanbanStage } from "./types"
import { cn } from "@/lib/utils"
import { LucideIcon } from "lucide-react"

interface KanbanColumnProps {
  id: KanbanStage
  title: string
  icon: LucideIcon
  color: string
  leads: Lead[]
  onClickCard: (lead: Lead) => void
}

export function KanbanColumn({ id, title, icon: Icon, color, leads, onClickCard }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
  })

  // Calcular valor potencial (mock logic: sum of prop views or fixed value per lead)
  const totalValue = leads.length * 150000 // Placeholder: 150k avg

  return (
    <div className="flex flex-col w-[300px] shrink-0 h-full bg-accent/5 rounded-xl border border-accent/10">
      {/* Column Header */}
      <div className="p-4 flex flex-col gap-2 relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn("p-1.5 rounded-lg text-white", color)}>
              <Icon className="h-4 w-4" />
            </div>
            <h3 className="font-bold text-sm leading-tight max-w-[150px]">{title}</h3>
          </div>
          <span className="text-xs font-bold bg-muted px-2 py-0.5 rounded-full">
            {leads.length}
          </span>
        </div>
        
        <div className="flex items-center justify-between text-[10px] text-muted-foreground font-medium">
          <span>Potencial Est.</span>
          <span className="text-foreground">
            {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(totalValue)}
          </span>
        </div>
        
        <div className={cn(
          "absolute bottom-0 left-0 h-1 bg-accent/20 transition-all",
          id === "cerrado" ? "bg-emerald-500/50 w-full" : 
          id === "perdido" ? "bg-rose-500/50 w-full" : "w-0"
        )} />
      </div>

      {/* Column Content */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 p-2 space-y-3 overflow-y-auto scrollbar-hide min-h-[300px] transition-colors",
          isOver && "bg-accent/10"
        )}
      >
        <SortableContext items={leads.map(l => l.id)} strategy={verticalListSortingStrategy}>
          {leads.map((lead) => (
            <KanbanCard key={lead.id} lead={lead} onClick={onClickCard} />
          ))}
        </SortableContext>
        
        {leads.length === 0 && (
          <div className="h-full flex items-center justify-center p-8 text-center opacity-30">
            <p className="text-xs font-medium">Sin leads en esta etapa</p>
          </div>
        )}
      </div>
    </div>
  )
}
