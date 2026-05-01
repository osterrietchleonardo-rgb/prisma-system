"use client"

import { useState } from "react"
import { WAConversation } from "@/types/whatsapp"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"
import { Bot, MessageCircle, User, Briefcase } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent } from "@/components/ui/card"
import { KANBAN_STAGES } from "@/components/kanban/types"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "Sin teléfono";
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 10) {
    return cleaned.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
  } else if (cleaned.length === 12 || cleaned.length === 13) {
    // Assuming country code + number like 54 9 11 1234 5678 or 54 11 1234 5678
    return `+${cleaned}`;
  }
  return phone;
}

export default function LeadsWhatsappClient({
  initialConversations
}: {
  initialConversations: WAConversation[]
}) {
  // Local state no longer needs manual updates for Pipeline since it's automatic
  // but we keep it to maintain the interface or future optimizations
  const [conversations] = useState<any[]>(initialConversations)

  const getStageInfo = (stageId: string | null | undefined) => {
    if (!stageId) return { title: "Nuevo", color: "bg-zinc-800 text-zinc-300 border-zinc-700" }
    const stage = KANBAN_STAGES.find(s => s.id === stageId)
    return stage ? { title: stage.title, color: stage.color } : { title: stageId, color: "bg-zinc-800 text-zinc-300 border-zinc-700" }
  }

  if (conversations.length === 0) {
    return (
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardContent className="flex flex-col items-center justify-center h-64 text-center">
          <MessageCircle className="w-12 h-12 text-zinc-600 mb-4" />
          <h3 className="text-xl font-semibold mb-2">No hay leads de WhatsApp</h3>
          <p className="text-zinc-400 max-w-sm">
            Cuando un contacto te escriba por WhatsApp, aparecerá aquí.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-4">
      {conversations.map((conv) => {
        const inPipeline = (conv.etiquetas || []).includes('En Pipeline')
        
        return (
          <Card key={conv.id} className="bg-zinc-900/50 border-zinc-800 hover:bg-zinc-900/80 transition-colors">
            <CardContent className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              
              <div className="flex items-start gap-4">
                <div className="bg-emerald-500/10 p-3 rounded-full flex-shrink-0">
                  <User className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    {conv.contact_name || 'Desconocido'}
                    {conv.bot_active && (
                      <Badge variant="outline" className="bg-zinc-800 text-zinc-300 border-zinc-700">
                        <Bot className="w-3 h-3 mr-1" /> IA Activa
                      </Badge>
                    )}
                  </h3>
                  <p className="text-zinc-400 flex items-center gap-2">
                    <span>{formatPhone(conv.contact_phone)}</span>
                    <span>•</span>
                    <span className="text-sm">
                      {formatDistanceToNow(new Date(conv.updated_at || conv.last_message_at), { addSuffix: true, locale: es })}
                    </span>
                  </p>
                  
                  {conv.etiquetas && conv.etiquetas.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {conv.etiquetas.map((etiqueta, i) => (
                        <Badge key={i} variant="secondary" className="bg-zinc-800 hover:bg-zinc-700">
                          {etiqueta}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto mt-4 md:mt-0 pt-4 md:pt-0 border-t border-zinc-800 md:border-0">
                {/* Asesor Asignado */}
                <div className="flex items-center gap-2">
                  {conv.assigned_agent ? (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-800/50 border border-zinc-700/50">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={conv.assigned_agent.avatar_url} />
                        <AvatarFallback className="text-[10px] bg-accent text-accent-foreground">
                          {conv.assigned_agent.full_name?.charAt(0) || conv.assigned_agent.email?.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs font-medium text-zinc-300 max-w-[100px] truncate">
                        {conv.assigned_agent.full_name || conv.assigned_agent.email}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-800/20 border border-zinc-800 border-dashed">
                      <div className="h-6 w-6 rounded-full bg-zinc-800/50 flex items-center justify-center">
                        <User className="h-3 w-3 text-zinc-500" />
                      </div>
                      <span className="text-xs text-zinc-500">Sin asignar</span>
                    </div>
                  )}
                </div>

                <div className="text-sm text-zinc-400 mr-2 flex flex-col items-end hidden md:flex">
                  <span>Score: {conv.score}</span>
                  <span className="text-xs">
                    {conv.status === 'active' ? 'Activo' : conv.status === 'closed' ? 'Cerrado' : 'Pendiente'}
                  </span>
                </div>
                
                {/* Estado Pipeline */}
                <Badge variant="outline" className={`px-3 py-1 bg-opacity-10 border-opacity-50 ${getStageInfo(conv.pipeline_stage).color} bg-current`}>
                  <span className="text-current">{getStageInfo(conv.pipeline_stage).title}</span>
                </Badge>
              </div>

            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
