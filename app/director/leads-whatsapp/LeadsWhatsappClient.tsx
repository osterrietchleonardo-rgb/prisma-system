"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { WAConversation } from "@/types/whatsapp"

import { Badge } from "@/components/ui/badge"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"
import { Bot, User, AlertTriangle, Eye } from "lucide-react"
import { toast } from "sonner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { KANBAN_STAGES } from "@/components/kanban/types"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { updateLeadStage } from "@/lib/queries/director"
import Link from "next/link"

function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "Sin teléfono";
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 10) {
    return cleaned.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
  } else if (cleaned.length === 12 || cleaned.length === 13) {
    return `+${cleaned}`;
  }
  return phone;
}

export default function LeadsWhatsappClient({
  initialConversations,
  basePath
}: {
  initialConversations: (WAConversation & { lead_id?: string | null, pipeline_stage?: string | null })[]
  basePath: string
}) {
  const router = useRouter()
  const [conversations, setConversations] = useState(initialConversations)

  const handleStageChange = async (leadId: string | null | undefined, convId: string, newStage: string) => {
    if (!leadId) {
      toast.error("Este chat de WhatsApp aún no está vinculado a un lead en el sistema.")
      return
    }

    try {
      await updateLeadStage(leadId, newStage)
      
      // Update local state to reflect the change immediately
      setConversations(prev => prev.map(conv => {
        if (conv.id === convId) {
          return { ...conv, pipeline_stage: newStage }
        }
        return conv
      }))
      
      toast.success("Etapa del pipeline actualizada")
      router.refresh()
    } catch (error) {
      console.error(error)
      toast.error("Error al actualizar la etapa")
    }
  }

  if (conversations.length === 0) {
    return (
      <div className="rounded-2xl border border-accent/10 bg-card/30 backdrop-blur-sm overflow-x-auto w-full p-8 text-center">
        <h3 className="text-xl font-semibold mb-2">No hay leads de WhatsApp</h3>
        <p className="text-muted-foreground max-w-sm mx-auto">
          Cuando un contacto te escriba por WhatsApp, aparecerá aquí.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-accent/10 bg-card/30 backdrop-blur-sm overflow-x-auto w-full">
      <Table className="w-full">
        <TableHeader className="bg-card/80 backdrop-blur-md">
          <TableRow className="border-accent/10 hover:bg-transparent">
            <TableHead className="py-4 px-4 font-bold text-[10px] uppercase">Contacto</TableHead>
            <TableHead className="hidden md:table-cell font-bold text-[10px] uppercase">Teléfono</TableHead>
            <TableHead className="hidden lg:table-cell font-bold text-[10px] uppercase">Etiquetas</TableHead>
            <TableHead className="font-bold text-[10px] uppercase">Estado Chat</TableHead>
            <TableHead className="font-bold text-[10px] uppercase">Etapa Pipeline</TableHead>
            <TableHead className="hidden md:table-cell font-bold text-[10px] uppercase">Agente</TableHead>
            <TableHead className="hidden md:table-cell font-bold text-[10px] uppercase">Último Mensaje</TableHead>
            <TableHead className="font-bold text-[10px] uppercase text-right">Ficha</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {conversations.map((conv) => {
            const isNoName = conv.contact_name === "Sin nombre" || !conv.contact_name;
            const hasNoContact = !conv.contact_phone;
            
            return (
              <TableRow key={conv.id} className="hover:bg-accent/5 h-14">
                <TableCell className="px-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9 border border-accent/10">
                      <AvatarFallback className="bg-accent/10 text-accent font-bold text-xs uppercase">
                        {conv.contact_name?.substring(0, 2) || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1">
                        <span className={`text-xs font-bold leading-tight ${isNoName ? "italic text-muted-foreground" : ""}`}>
                          {conv.contact_name || 'Desconocido'}
                        </span>
                        {hasNoContact && (
                          <AlertTriangle className="h-3 w-3 text-destructive" />
                        )}
                        {conv.bot_active && (
                          <Bot className="w-3 h-3 ml-1 text-emerald-400" />
                        )}
                      </div>
                    </div>
                  </div>
                </TableCell>
                
                <TableCell className="hidden md:table-cell">
                  {conv.contact_phone ? (
                    <span className="text-[11px] font-medium opacity-80">
                      {formatPhone(conv.contact_phone)}
                    </span>
                  ) : <span className="text-[10px] text-muted-foreground italic">—</span>}
                </TableCell>

                <TableCell className="hidden lg:table-cell">
                  {conv.etiquetas && conv.etiquetas.length > 0 ? (
                    <div className="flex flex-wrap gap-1 max-w-[150px]">
                      {conv.etiquetas.slice(0, 3).map((etiqueta, i) => (
                        <Badge key={i} variant="outline" className="text-[9px] px-1 py-0 border-accent/20">
                          {etiqueta}
                        </Badge>
                      ))}
                      {conv.etiquetas.length > 3 && (
                        <span className="text-[9px] text-muted-foreground">+{conv.etiquetas.length - 3}</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">—</span>
                  )}
                </TableCell>

                <TableCell>
                  <Badge variant="outline" className={`text-[10px] font-bold px-2 py-0 border-none ${conv.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-zinc-500/10 text-zinc-400'}`}>
                    {conv.status === 'active' ? 'Activo' : conv.status === 'closed' ? 'Cerrado' : 'Pendiente'}
                  </Badge>
                  {conv.score > 0 && (
                    <span className="text-[9px] ml-2 text-muted-foreground">Score: {conv.score}</span>
                  )}
                </TableCell>

                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Select 
                    defaultValue={conv.pipeline_stage || "nuevo"} 
                    onValueChange={(v) => handleStageChange(conv.lead_id, conv.id, v)}
                  >
                    <SelectTrigger className="h-7 text-[10px] bg-background/50 border-accent/10 w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {KANBAN_STAGES.map(stage => (
                        <SelectItem key={stage.id} value={stage.id} className="text-[10px]">
                          {stage.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>

                <TableCell className="hidden md:table-cell">
                  {conv.assigned_agent ? (
                    <div className="flex items-center gap-2 max-w-[120px]">
                      <Avatar className="h-6 w-6 border border-accent/10">
                        <AvatarImage src={conv.assigned_agent.avatar_url} />
                        <AvatarFallback className="text-[8px] uppercase">
                          {conv.assigned_agent.full_name?.substring(0,2) || conv.assigned_agent.email?.substring(0,2)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-[10px] font-bold truncate">
                        {conv.assigned_agent.full_name?.split(" ")[0] || conv.assigned_agent.email?.split("@")[0]}
                      </span>
                    </div>
                  ) : <span className="text-[10px] text-muted-foreground italic">Sin asignar</span>}
                </TableCell>

                <TableCell className="hidden md:table-cell">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {formatDistanceToNow(new Date(conv.updated_at || conv.last_message_at), { addSuffix: true, locale: es })}
                    </span>
                  </div>
                </TableCell>

                <TableCell className="text-right">
                  <Link 
                    href={`${basePath}/${conv.id}`}
                    className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-8 w-8 text-muted-foreground"
                  >
                    <Eye className="h-4 w-4" />
                  </Link>
                </TableCell>

              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
