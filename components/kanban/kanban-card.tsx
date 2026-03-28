"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Clock, MessageSquare, Phone, User, ExternalLink } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { Lead } from "./types"

interface KanbanCardProps {
  lead: Lead
  onClick: (lead: Lead) => void
}

export function KanbanCard({ lead, onClick }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: lead.id,
    data: {
      type: "Lead",
      lead,
    },
  })

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  }

  const agentInitials = lead.assigned_agent?.full_name
    ? lead.assigned_agent.full_name.split(" ").map(n => n[0]).join("").toUpperCase()
    : "?"

  const updatedAtDate = lead.updated_at ? new Date(lead.updated_at) : null
  const timeInStage = (updatedAtDate && !isNaN(updatedAtDate.getTime()))
    ? formatDistanceToNow(updatedAtDate, { locale: es, addSuffix: true })
    : "Sin fecha"

  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="opacity-30 border-2 border-accent/50 rounded-lg h-[140px] bg-accent/5"
      />
    )
  }

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "cursor-grab active:cursor-grabbing hover:border-accent/40 transition-all group relative",
        "bg-card/50 backdrop-blur-sm border-accent/10"
      )}
      onClick={() => onClick(lead)}
    >
      <CardContent className="p-3 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-semibold text-sm line-clamp-1 group-hover:text-accent transition-colors">
            {lead.full_name}
          </h4>
          <button 
            className="p-1 hover:bg-accent/10 rounded opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation()
              onClick(lead)
            }}
          >
            <ExternalLink className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 bg-accent/5">
            {lead.source}
          </Badge>
          {lead.phone && (
            <div className="flex items-center text-[10px] text-muted-foreground">
              <Phone className="h-3 w-3 mr-1" />
              {lead.phone.slice(-4)}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{timeInStage}</span>
          </div>
          
          <div className="flex items-center gap-2">
            {lead.assigned_agent ? (
              <div className="flex items-center gap-1 border rounded-full px-1.5 py-0.5 bg-muted/30">
                <Avatar className="h-4 w-4">
                  <AvatarImage src={lead.assigned_agent.avatar_url} />
                  <AvatarFallback className="text-[8px] bg-accent/20">{agentInitials}</AvatarFallback>
                </Avatar>
                <span className="text-[9px] font-medium">{lead.assigned_agent.full_name.split(" ")[0]}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-[10px] text-amber-500 font-medium">
                <User className="h-3 w-3" />
                <span>Sin asignar</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
