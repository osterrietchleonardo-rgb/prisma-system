"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Clock, MessageSquare, Phone, User, ExternalLink, Mail } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { Lead, KANBAN_STAGES } from "./types"

interface KanbanCardProps {
  lead: Lead
  onClick: (lead: Lead) => void
  detailsUrl?: string
}

export function KanbanCard({ lead, onClick, detailsUrl = "/director/leads" }: KanbanCardProps) {
  const stage = KANBAN_STAGES.find(s => s.id === lead.pipeline_stage) || KANBAN_STAGES[0]
  
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
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm line-clamp-1 group-hover:text-accent transition-colors">
              {lead.full_name}
            </h4>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Badge className={cn("text-[9px] h-3.5 px-1.5 py-0 border-none font-medium", stage.color)}>
                {stage.title}
              </Badge>
              {lead.tokko_lead_status && (
                <span className="text-[9px] text-muted-foreground italic truncate">
                  • {lead.tokko_lead_status}
                </span>
              )}
            </div>
          </div>
          <Link 
            href={`${detailsUrl}?leadId=${lead.id}`}
            className="p-1 hover:bg-accent/10 rounded opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-3 w-3 text-muted-foreground" />
          </Link>
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

        {lead.tokko_property_title && (
          <div className="bg-accent/5 rounded-md p-1.5 border border-accent/10 space-y-1">
            <div className="flex items-center justify-between">
               <p className="text-[10px] font-semibold line-clamp-1 text-accent">
                {lead.tokko_property_title}
              </p>
            </div>
            
            <div className="flex items-center justify-between gap-2">
              {lead.tokko_property_price && (
                <p className="text-[9px] text-muted-foreground font-bold">
                  {lead.tokko_property_price}
                </p>
              )}
              <div className="flex gap-1">
                {lead.tokko_property_type && (
                  <Badge variant="secondary" className="text-[7px] h-3 px-1 bg-accent/10 text-accent border-none">
                    {lead.tokko_property_type}
                  </Badge>
                )}
                {lead.tokko_property_operation && (
                  <Badge variant="outline" className="text-[8px] h-3.5 px-1 bg-background border-accent/20">
                    {lead.tokko_property_operation}
                  </Badge>
                )}
              </div>
            </div>

            {lead.tokko_property_location && (
              <p className="text-[8px] text-muted-foreground flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                {lead.tokko_property_location}
              </p>
            )}
          </div>
        )}

        {/* Informacion de Contacto Rapida */}
        <div className="flex items-center gap-3 pt-1 border-t border-accent/5">
           {lead.email && (
             <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
               <Mail className="h-2.5 w-2.5" />
               <span className="truncate max-w-[80px]">{lead.email}</span>
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
