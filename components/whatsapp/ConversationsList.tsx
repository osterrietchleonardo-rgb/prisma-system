"use client"

import { useState, useEffect, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import type { WAConversation, WhatsAppInstance } from "@/types/whatsapp"
import { Search, Bot, BotOff, MessageSquare, RefreshCw, Trash2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "./EmptyState"
import { toast } from "sonner"
import { markConversationRead, deleteConversation } from "@/app/actions/whatsapp"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useRef } from "react"

interface ConversationsListProps {
  instance: WhatsAppInstance
  activeId: string | null
  onSelect: (conv: WAConversation) => void
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "ahora"
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d`
  return `${Math.floor(days / 7)}sem`
}


export function ConversationsList({ instance, activeId, onSelect }: ConversationsListProps) {
  const [conversations, setConversations] = useState<WAConversation[]>([])
  const [search, setSearch] = useState("")
  const [tab, setTab] = useState("all")
  const [filterAgentEmail, setFilterAgentEmail] = useState("all")
  const [loading, setLoading] = useState(true)

  const activeIdRef = useRef(activeId)
  const convRef = useRef(conversations)

  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])

  useEffect(() => {
    convRef.current = conversations
  }, [conversations])

  // Initial load & Polling
  useEffect(() => {
    const supabase = createClient()

    async function load() {
      const { data } = await supabase
        .from("wa_conversations")
        .select("*, agent:profiles(email)")
        .eq("instance_id", instance.id)
        .order("last_message_at", { ascending: false })

      if (data) setConversations(data as any[])
      setLoading(false)
    }

    load()

    // Refresh param: Auto-refresh cada 5 segundos
    const interval = setInterval(() => {
      load()
    }, 5 * 1000)

    // Realtime subscription
    const channel = supabase
      .channel(`wa_conversations:instance_id=eq.${instance.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wa_conversations",
          filter: `instance_id=eq.${instance.id}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newItem = payload.new as WAConversation
            
            // Si inserta una nueva y no es la activa, notificar
            if (activeIdRef.current !== newItem.id) {
              toast.info(`Nuevo mensaje de ${newItem.contact_name || newItem.contact_phone}`)
            } else {
              // Si la recibimos mientras la tenemos activa, la marcamos como leida auto
              markConversationRead(newItem.id)
            }
            
            setConversations((prev) => {
              // Prevenir duplicados visuales en RT
              if (prev.some(c => c.id === newItem.id)) return prev;

              const unshiftList = [newItem, ...prev];
              unshiftList.sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());
              
              // Filter by contact_phone to deduplicate orphaned duplicates
              return unshiftList.filter((c, index, self) => 
                index === self.findIndex((t) => t.contact_phone === c.contact_phone)
              );
            })
          } else if (payload.eventType === "UPDATE") {
            const updatedItem = payload.new as WAConversation
            const prev = convRef.current
            const oldItem = prev.find((c) => c.id === updatedItem.id)

            // Detectamos si es un mensaje de lead comprobando si cambió el last_inbound_at
            // Si el item no estaba cargado (no estaba en los primeros 50), asumimos que si last_inbound_at 
            // es muy reciente (hace menos de 10 seg), debe ser nuevo, para poder lanzar el toast igual.
            let isInbound = false;
            if (oldItem) {
              isInbound = !!oldItem.last_inbound_at && !!updatedItem.last_inbound_at && updatedItem.last_inbound_at !== oldItem.last_inbound_at;
            } else if (updatedItem.last_inbound_at) {
               const diff = Date.now() - new Date(updatedItem.last_inbound_at).getTime();
               isInbound = diff < 10000; // Recibido en los ultimos 10 segundos
            }

            if (isInbound && activeIdRef.current !== updatedItem.id) {
              toast.info(`Nuevo mensaje de ${updatedItem.contact_name || updatedItem.contact_phone}`)
            } else if (isInbound && activeIdRef.current === updatedItem.id && updatedItem.unread_count > 0) {
               // Si estamos viendo el chat y entra mensaje nuevo, lo marcamos leído localmente y en BD
               updatedItem.unread_count = 0
               markConversationRead(updatedItem.id)
            }

              setConversations((currentPrev) => {
                const otherConversations = currentPrev.filter((c) => c.id !== updatedItem.id)
                // Siempre al principio en el UPDATE (last message moved it)
                return [updatedItem, ...otherConversations]
              })
          } else if (payload.eventType === "DELETE") {
            setConversations((prev) =>
              prev.filter((c) => c.id !== (payload.old as { id: string }).id)
            )
          }
        }
      )
      .subscribe()

    const broadcastChannel = supabase
      .channel(`agency-${instance.agency_id}`)
      .on(
        "broadcast",
        { event: "refresh-whatsapp" },
        (payload) => {
          load()
        }
      )
      .subscribe()

    return () => {
      clearInterval(interval)
      supabase.removeChannel(channel)
      supabase.removeChannel(broadcastChannel)
    }
  }, [instance.id, instance.agency_id])

  const handleDelete = async (e: React.MouseEvent, conversationId: string) => {
    e.stopPropagation();
    if (!window.confirm("¿Seguro que querés eliminar esta conversación?")) return;
    
    const res = await deleteConversation(conversationId);
    if (res.success) {
      toast.success("Conversación eliminada");
      setConversations(prev => prev.filter(c => c.id !== conversationId));
    } else {
      toast.error(res.error || "Error al eliminar");
    }
  };

  const agentEmails = useMemo(() => {
    const emails = conversations
      .map(c => (c as any).agent?.email)
      .filter((email): email is string => !!email)
    return Array.from(new Set(emails)).sort()
  }, [conversations])

  // Filter by search + tab + agent
  const filtered = useMemo(() => {
    let result = conversations

    // Tab filter
    if (tab === "bot") result = result.filter((c) => c.bot_active)
    else if (tab === "paused") result = result.filter((c) => !c.bot_active)

    // Agent filter
    if (filterAgentEmail !== "all") {
      result = result.filter((c) => (c as any).agent?.email === filterAgentEmail)
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (c) =>
          (c.contact_name?.toLowerCase().includes(q)) ||
          c.contact_phone.includes(q)
      )
    }

    return result
  }, [conversations, search, tab, filterAgentEmail])

  return (
    <div className="flex flex-col h-full">
      {/* Search & Refresh */}
      <div className="p-3 border-b flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            aria-label="Buscar contacto"
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar contacto..."
            className="pl-9 h-9 text-sm"
          />
        </div>
        <button
          onClick={() => {
            setLoading(true)
            const supabase = createClient()
            supabase
              .from("wa_conversations")
              .select("*, agent:profiles(email)")
              .eq("instance_id", instance.id)
              .order("last_message_at", { ascending: false })
              .then(({ data }) => {
                if (data) setConversations(data as any[])
                setLoading(false)
              })
          }}
          disabled={loading}
          title="Actualizar chats"
          className="w-9 h-9 flex items-center justify-center rounded-md border bg-background hover:bg-muted text-muted-foreground transition-colors disabled:opacity-50 flex-shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Tabs & Filter */}
      <div className="px-3 py-2 border-b">
        <div className="flex items-center gap-2">
          <Tabs value={tab} onValueChange={setTab} className="flex-1">
            <TabsList className="w-full h-8 bg-muted/50">
              <TabsTrigger value="all" className="flex-1 text-xs font-semibold">
                Todos
              </TabsTrigger>
              <TabsTrigger value="bot" className="flex-1 text-xs font-semibold">
                Bot activo
              </TabsTrigger>
              <TabsTrigger value="paused" className="flex-1 text-xs font-semibold">
                Pausados
              </TabsTrigger>
            </TabsList>
          </Tabs>
          
          {agentEmails.length > 0 && (
            <Select value={filterAgentEmail} onValueChange={setFilterAgentEmail}>
              <SelectTrigger className="w-[110px] h-8 text-[10px] font-medium bg-muted/50 border-none focus:ring-0">
                <SelectValue placeholder="Asesor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-[10px]">Todos los asesores</SelectItem>
                {agentEmails.map(email => (
                  <SelectItem key={email} value={email} className="text-[10px]">
                    {email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="p-4 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3 w-full">
                <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          search ? (
            <div className="p-8 text-center">
              <p className="text-sm text-muted-foreground">Sin resultados</p>
            </div>
          ) : (
            <EmptyState 
              icon={MessageSquare} 
              title="Aún no hay conversaciones" 
              subtitle="Cuando un lead escriba a tu número, aparecerá aquí." 
            />
          )
        ) : (
          <div className="p-1.5">
            {filtered
              .filter((conv, index, self) =>
                index === self.findIndex((t) => t.contact_phone === conv.contact_phone)
              )
              .map((conv) => {
              const isActive = activeId === conv.id
              const initial = (conv.contact_name || conv.contact_phone || "?")
                .charAt(0)
                .toUpperCase()

              return (
                <button
                  key={conv.id}
                  onClick={() => {
                    onSelect(conv)
                    if (conv.unread_count > 0) {
                       setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c))
                       markConversationRead(conv.id)
                    }
                  }}
                  className={`w-full flex items-start gap-3 p-3 rounded-xl text-left transition-colors mb-0.5 group/item relative ${
                    isActive
                      ? "bg-accent/5 dark:bg-accent/10 border border-accent/20"
                      : "hover:bg-muted/50"
                  }`}
                >
                  {/* Delete Button (on hover) */}
                  <button
                    onClick={(e) => handleDelete(e, conv.id)}
                    className="absolute right-2 top-2 p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all opacity-0 group-hover/item:opacity-100 z-10"
                    title="Eliminar chat"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-accent/10 text-accent flex items-center justify-center font-bold text-sm flex-shrink-0">
                    {initial}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm truncate flex-1">
                        {conv.contact_name || conv.contact_phone}
                      </span>
                      {(conv as any).agent?.email && (
                        <span className="text-[10px] text-accent/70 font-medium truncate max-w-[100px] ml-1">
                          {(conv as any).agent.email}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground flex-shrink-0 flex flex-col items-end gap-1">
                        <span className="whitespace-nowrap">{timeAgo(conv.last_message_at)}</span>
                        {conv.unread_count > 0 && !isActive ? (
                          <div className="flex items-center justify-center">
                             <Badge className="bg-red-500 hover:bg-red-600 text-white border-none text-[10px] font-bold h-[18px] min-w-[18px] px-1 flex items-center justify-center rounded-full leading-none shadow-sm">
                               {conv.unread_count > 99 ? "99+" : conv.unread_count}
                             </Badge>
                          </div>
                        ) : null}
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {conv.contact_phone}
                    </p>

                    {/* Bottom row: bot icon + tags */}
                    <div className="flex items-center gap-1.5 mt-1.5">
                      {conv.bot_active ? (
                        <Bot className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                      ) : (
                        <BotOff className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                      )}
                      {conv.etiquetas.slice(0, 2).map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0 h-4 font-medium"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
