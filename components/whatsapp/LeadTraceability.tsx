"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import type { WAConversation, WAMessage } from "@/types/whatsapp"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Copy, Edit2, Check, Clock, Home, Info, User, Calendar, MapPin, Building2, Link as LinkIcon, DollarSign } from "lucide-react"
import { toast } from "sonner"

interface LeadTraceabilityProps {
  conversation: WAConversation
  messages: WAMessage[]
}

export default function LeadTraceability({ conversation, messages }: LeadTraceabilityProps) {
  const supabase = createClient()
  
  // Section 1: Phone Copy
  const [copied, setCopied] = useState(false)
  
  const handleCopyPhone = () => {
    navigator.clipboard.writeText(conversation.contact_phone)
    setCopied(true)
    setTimeout(() => setCopied(false), 1000)
  }

  // Section 1: Name Editing
  const [isEditingName, setIsEditingName] = useState(false)
  const [contactName, setContactName] = useState(conversation.contact_name || "")
  
  const handleSaveName = async () => {
    setIsEditingName(false)
    if (contactName === conversation.contact_name) return
    
    // Optimistic local state update is not fully strictly propagated to parent unless we have a callback,
    // but the prompt constraints say "Input reemplaza texto al click, vuelve a texto al guardar."
    const { error } = await supabase
      .from("wa_conversations")
      .update({ contact_name: contactName })
      .eq("id", conversation.id)
      
    if (error) {
      toast.error("Error al actualizar nombre")
      setContactName(conversation.contact_name || "")
    } else {
      toast.success("Nombre actualizado")
    }
  }

  // Section 1: State Select
  const handleStateChange = async (val: string) => {
    const { error } = await supabase
      .from("wa_conversations")
      .update({ status: val })
      .eq("id", conversation.id)
      
    if (error) {
      toast.error("Error al actualizar estado")
    } else {
      toast.success("Estado actualizado")
    }
  }

  // Section 2: Activity
  const [showAllEvents, setShowAllEvents] = useState(false)
  const timelineEvents = showAllEvents ? messages : messages.slice(-10)
  
  const roleColors: Record<string, string> = {
    lead: "bg-neutral-400",
    bot: "bg-accent",
    human: "bg-primary",
    internal: "bg-amber-400"
  }
  
  const roleTexts: Record<string, string> = {
    lead: "Lead escribió",
    bot: "IA respondió",
    human: "Director intervino",
    internal: "Nota interna"
  }

  // Section 3: Recommended Properties
  const propertyRecommendations = messages
    .filter(m => m.metadata?.type === 'property_recommendation')
    .map(m => m.metadata)
    
  // Section 4: Scheduled Visit
  const [visit, setVisit] = useState<any>(null)
  const [visitLoading, setVisitLoading] = useState(true)
  
  useEffect(() => {
    async function fetchVisit() {
      try {
        const { data, error } = await supabase
          .from("visits")
          .select("*")
          .eq("conversation_id", conversation.id)
          .order("scheduled_at", { ascending: false })
          .limit(1)
          .single()
          
        if (!error && data) {
          setVisit(data)
        }
      } catch (err) {
        // Silently ignore
      } finally {
        setVisitLoading(false)
      }
    }
    fetchVisit()
  }, [conversation.id, supabase])

  // Section 5: Stats
  const leadMessagesCount = messages.filter(m => m.role === 'lead').length
  
  const firstContact = messages.length > 0 ? new Date(messages[0].created_at) : new Date()
  const daysSinceFirstContact = Math.floor((new Date().getTime() - firstContact.getTime()) / (1000 * 3600 * 24))
  
  // Calculate avg bot response time
  let totalBotResponseMs = 0
  let botResponseCount = 0
  for (let i = 1; i < messages.length; i++) {
    if (messages[i].role === 'bot' && messages[i-1].role === 'lead') {
      const respTime = new Date(messages[i].created_at).getTime() - new Date(messages[i-1].created_at).getTime()
      totalBotResponseMs += respTime
      botResponseCount++
    }
  }
  const avgBotResponseMin = botResponseCount > 0 ? Math.round(totalBotResponseMs / botResponseCount / 60000) : 0

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* 1. Datos del lead */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <User className="w-4 h-4 text-accent" /> Datos del prospecto
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">{conversation.contact_phone}</div>
            <button
              onClick={handleCopyPhone}
              className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors bg-muted/50 px-2 py-1 rounded"
            >
              {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
              {copied ? "¡Copiado!" : "Copiar"}
            </button>
          </div>
          
          <div className="flex items-center justify-between group">
            {isEditingName ? (
              <Input 
                value={contactName} 
                aria-label="Nombre del lead"
                onChange={(e) => setContactName(e.target.value)}
                onBlur={handleSaveName}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                className="h-7 text-sm px-2 w-full max-w-[150px]"
                autoFocus
              />
            ) : (
              <div className="text-sm text-foreground truncate mr-2 flex-1">
                {contactName || "Sin Nombre"}
              </div>
            )}
            {!isEditingName && (
              <button onClick={() => setIsEditingName(true)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-muted rounded text-muted-foreground">
                <Edit2 className="w-3 h-3" />
              </button>
            )}
          </div>
          
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Estado CRM</div>
            <Select defaultValue={conversation.status} onValueChange={handleStateChange}>
              <SelectTrigger aria-label="Estado CRM" className="h-8 text-xs">
                <SelectValue placeholder="Estado..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Activo</SelectItem>
                <SelectItem value="pending">Pendiente</SelectItem>
                <SelectItem value="closed">Cerrado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 pt-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Score</span>
              <span className="font-bold">{conversation.score}/100</span>
            </div>
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${conversation.score < 40 ? 'bg-red-500' : conversation.score < 70 ? 'bg-yellow-500' : 'bg-green-500'}`}
                style={{ width: `${Math.min(100, Math.max(0, conversation.score))}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 5. Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-muted/50 rounded-lg p-2 text-center flex flex-col items-center justify-center">
          <div className="text-lg font-bold text-foreground leading-none mb-1">{leadMessagesCount}</div>
          <div className="text-[10px] text-muted-foreground leading-tight">Msjs<br/>Lead</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-2 text-center flex flex-col items-center justify-center">
          <div className="text-lg font-bold text-foreground leading-none mb-1">{daysSinceFirstContact}</div>
          <div className="text-[10px] text-muted-foreground leading-tight">Días<br/>Contacto</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-2 text-center flex flex-col items-center justify-center">
          <div className="text-lg font-bold text-foreground leading-none mb-1">{avgBotResponseMin}</div>
          <div className="text-[10px] text-muted-foreground leading-tight">Min.<br/>Rta Bot</div>
        </div>
      </div>

      {/* 2. Actividad */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4 text-accent" /> Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 relative before:absolute before:inset-0 before:ml-2 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-muted before:to-transparent">
            {timelineEvents.map((msg, i) => (
              <div key={msg.id || i} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                <div className={`flex items-center justify-center w-4 h-4 rounded-full border-2 border-background shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow ${roleColors[msg.role]}`} />
                <div className="w-[calc(100%-2rem)] md:w-[calc(50%-1.5rem)] px-3 py-2 rounded border bg-background/50 shadow-sm text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold">{roleTexts[msg.role]}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' })}
                    </span>
                  </div>
                  <p className="text-muted-foreground truncate" title={msg.content}>
                    {msg.content.length > 40 ? msg.content.substring(0, 40) + "..." : msg.content}
                  </p>
                </div>
              </div>
            ))}
          </div>
          {messages.length > 10 && !showAllEvents && (
            <button 
              onClick={() => setShowAllEvents(true)}
              className="mt-4 w-full text-xs text-muted-foreground hover:text-accent transition-colors"
            >
              Ver todos los eventos
            </button>
          )}
          {showAllEvents && (
            <button 
              onClick={() => setShowAllEvents(false)}
              className="mt-4 w-full text-xs text-muted-foreground hover:text-accent transition-colors"
            >
              Ocultar
            </button>
          )}
        </CardContent>
      </Card>

      {/* 4. Visita agendada */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Calendar className="w-4 h-4 text-accent" /> Visita agendada
          </CardTitle>
        </CardHeader>
        <CardContent>
          {visitLoading ? (
            <div className="animate-pulse h-8 bg-muted rounded w-full" />
          ) : visit ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold">
                  {new Date(visit.scheduled_at).toLocaleDateString()} - {new Date(visit.scheduled_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </div>
                <Badge variant="outline" className={visit.status === 'confirmed' ? "text-green-600 border-green-200 bg-green-50" : "text-yellow-600 border-yellow-200 bg-yellow-50"}>
                  {visit.status === 'confirmed' ? 'Confirmada' : 'Pendiente'}
                </Badge>
              </div>
              {visit.property_name && <div className="text-xs text-muted-foreground truncate"><MapPin className="w-3 h-3 inline mr-1"/>{visit.property_name}</div>}
              {visit.advisor_name && <div className="text-xs text-muted-foreground truncate"><User className="w-3 h-3 inline mr-1"/>Asesor: {visit.advisor_name}</div>}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">Sin visita agendada.</p>
          )}
        </CardContent>
      </Card>

      {/* 3. Propiedades recomendadas */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Building2 className="w-4 h-4 text-accent" /> Recomendaciones
          </CardTitle>
        </CardHeader>
        <CardContent>
          {propertyRecommendations.length > 0 ? (
            <div className="space-y-3">
              {/* Only show up to 3 to keep it small, maybe scrollable later if needed */}
              {propertyRecommendations.slice(0, 3).map((prop: any, idx) => (
                <div key={idx} className="bg-muted/30 rounded border p-2 text-xs space-y-1">
                  <div className="font-semibold line-clamp-1" title={prop.property_name || 'Propiedad sin título'}>
                    {prop.property_name || `Propiedad #${prop.tokko_id || 'Desconocida'}`}
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="flex items-center gap-1"><DollarSign className="w-3 h-3"/> {prop.property_price || 'Consultar'}</span>
                    <span className="text-[10px]">ID: {prop.tokko_id || 'N/A'}</span>
                  </div>
                </div>
              ))}
              {propertyRecommendations.length > 3 && (
                <p className="text-xs text-center text-muted-foreground">y {propertyRecommendations.length - 3} más...</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">El asesor IA aún no recomendó propiedades.</p>
          )}
        </CardContent>
      </Card>

    </div>
  )
}
