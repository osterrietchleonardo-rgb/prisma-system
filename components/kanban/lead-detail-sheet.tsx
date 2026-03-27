"use client"

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { 
  Phone, 
  Mail, 
  User, 
  Calendar, 
  MessageSquare, 
  Clock,
  Trash2,
  BrainCircuit,
  UserPlus,
  FileText
} from "lucide-react"
import { Lead, KANBAN_STAGES } from "./types"
import { format } from "date-fns"
import { es } from "date-fns/locale"

interface LeadDetailSheetProps {
  lead: Lead | null
  isOpen: boolean
  onClose: () => void
  onAssignAgent?: (leadId: string) => void
  onScheduleVisit: (leadId: string) => void
  onLogActivity: (leadId: string) => void
  isAdvisor?: boolean
}

export function LeadDetailSheet({ 
  lead, 
  isOpen, 
  onClose,
  onAssignAgent,
  onScheduleVisit,
  onLogActivity,
  isAdvisor = false
}: LeadDetailSheetProps) {
  if (!lead) return null

  const stage = KANBAN_STAGES.find(s => s.id === lead.pipeline_stage)

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-xl border-l border-accent/10 sm:rounded-l-2xl">
        <SheetHeader className="space-y-1 pr-6">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="text-xs font-semibold bg-accent/5">
              ID: {lead.id.slice(0, 8)}
            </Badge>
            <Badge className={stage?.color}>
              {stage?.title}
            </Badge>
          </div>
          <SheetTitle className="text-2xl font-bold">{lead.full_name}</SheetTitle>
          <SheetDescription className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4" />
            Ingresó el {format(new Date(lead.created_at), "PPP", { locale: es })}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-8 flex flex-wrap gap-3">
          {!isAdvisor && onAssignAgent && (
            <Button variant="outline" size="sm" className="flex-1 min-w-[120px] gap-2" onClick={() => onAssignAgent(lead.id)}>
              <UserPlus className="h-4 w-4" />
              Asignar
            </Button>
          )}
          <Button variant="outline" size="sm" className="flex-1 min-w-[120px] gap-2" onClick={() => onLogActivity(lead.id)}>
            <MessageSquare className="h-4 w-4" />
            Actividad
          </Button>
          <Button variant="outline" size="sm" className="flex-1 min-w-[120px] gap-2" onClick={() => onScheduleVisit(lead.id)}>
            <Calendar className="h-4 w-4" />
            Visita
          </Button>
          <Button variant="secondary" size="sm" className="gap-2 bg-accent/10 hover:bg-accent/20 text-accent border-none h-9">
            <BrainCircuit className="h-4 w-4" />
            Análisis IA
          </Button>
        </div>

        <Separator className="my-8 opacity-40" />

        <ScrollArea className="h-[calc(100vh-280px)] pr-4">
          <div className="space-y-8 pb-8">
            {/* Contact Info */}
            <section className="space-y-4">
              <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <User className="h-4 w-4" />
                Información de contacto
              </h4>
              <div className="grid gap-4 bg-muted/30 p-4 rounded-xl border border-accent/5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-background rounded-lg border border-accent/10">
                    <Phone className="h-4 w-4 text-accent" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Teléfono</p>
                    <p className="text-sm font-medium">{lead.phone || "No especificado"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-background rounded-lg border border-accent/10">
                    <Mail className="h-4 w-4 text-accent" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="text-sm font-medium">{lead.email || "No especificado"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-background rounded-lg border border-accent/10">
                    <MessageSquare className="h-4 w-4 text-accent" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Fuente</p>
                    <Badge variant="secondary" className="mt-1 font-semibold">{lead.source}</Badge>
                  </div>
                </div>
              </div>
            </section>

            {/* Timeline / Activities */}
            <section className="space-y-4">
              <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Historial de actividad
              </h4>
              <div className="relative pl-4 space-y-6 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5 before:bg-accent/10">
                <div className="relative">
                  <div className="absolute -left-5 top-1 h-3 w-3 rounded-full border-2 border-accent bg-background" />
                  <p className="text-xs text-muted-foreground">{format(new Date(lead.created_at), "HH:mm 'hs' | dd/MM", { locale: es })}</p>
                  <p className="text-sm font-medium mt-1">Lead creado</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Origen: {lead.source}</p>
                </div>
                {/* Mock activities */}
                <div className="relative opacity-60">
                  <div className="absolute -left-5 top-1 h-2 w-2 rounded-full bg-accent/40" />
                  <p className="text-xs text-muted-foreground">Ayer | 14:20 hs</p>
                  <p className="text-sm font-medium mt-1">Llamada saliente sin respuesta</p>
                </div>
              </div>
            </section>

            {/* Notes */}
            <section className="space-y-4">
              <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Notas internas
              </h4>
              <div className="p-4 bg-accent/5 rounded-xl italic text-sm border-l-4 border-accent/30">
                &quot;Busca departamento de 3 ambientes en Palermo o Colegiales. Presupuesto máx USD 250k. Vende propiedad actual para comprar.&quot;
              </div>
            </section>
          </div>
        </ScrollArea>

        <div className="absolute bottom-6 left-6 right-6 flex justify-between">
          <Button variant="ghost" className="text-rose-500 hover:text-rose-600 hover:bg-rose-50" size="sm">
            <Trash2 className="h-4 w-4 mr-2" />
            Eliminar Lead
          </Button>
          <Button variant="default" className="bg-accent hover:bg-accent/90" size="sm" onClick={onClose}>
            Guardar cambios
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
