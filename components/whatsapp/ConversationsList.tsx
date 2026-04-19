"use client"

import { useState, useEffect, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import type { WAConversation, WhatsAppInstance } from "@/types/whatsapp"
import { Search, Bot, BotOff, MessageSquare, RefreshCw } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "./EmptyState"
import { toast } from "sonner"
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
  const [loading, setLoading] = useState(true)
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})

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
        .select("*")
        .eq("instance_id", instance.id)
        .order("last_message_at", { ascending: false })

      if (data) setConversations(data as WAConversation[])
      setLoading(false)
    }

    load()

    // Refresh param: Auto-refresh cada 5 minutos
    const interval = setInterval(() => {
      load()
    }, 5 * 60 * 1000)

    // Realtime subscription
    const channel = supabase
      .channel(`wa_conversations_${instance.id}`)
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
              setUnreadCounts((prevCounts) => ({ ...prevCounts, [newItem.id]: (prevCounts[newItem.id] || 0) + 1 }))
              toast.info(`Nuevo mensaje de ${newItem.contact_name || newItem.contact_phone}`)
            }
            
            setConversations((prev) => {
              const unshiftList = [newItem, ...prev];
              unshiftList.sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());
              return unshiftList;
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
              setUnreadCounts((prevCounts) => ({ ...prevCounts, [updatedItem.id]: (prevCounts[updatedItem.id] || 0) + 1 }))
              toast.info(`Nuevo mensaje de ${updatedItem.contact_name || updatedItem.contact_phone}`)
            }

            setConversations((currentPrev) => {
              const prevItem = currentPrev.find((c) => c.id === updatedItem.id)
              let newList: WAConversation[] = []
              
              if (!prevItem) {
                // Si la conversación no estaba cargada localmente, hay insertarla
                newList = [updatedItem, ...currentPrev]
              } else {
                newList = currentPrev.map((c) => (c.id === updatedItem.id ? updatedItem : c))
              }

              // Reordenar siempre que se actualice la lista
              newList.sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime())
              return newList
            })
          } else if (payload.eventType === "DELETE") {
            setConversations((prev) =>
              prev.filter((c) => c.id !== (payload.old as { id: string }).id)
            )
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [instance.id])

  // Filter by search + tab
  const filtered = useMemo(() => {
    let result = conversations

    // Tab filter
    if (tab === "bot") result = result.filter((c) => c.bot_active)
    else if (tab === "paused") result = result.filter((c) => !c.bot_active)

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
  }, [conversations, search, tab])

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
              .select("*")
              .eq("instance_id", instance.id)
              .order("last_message_at", { ascending: false })
              .then(({ data }) => {
                if (data) setConversations(data as WAConversation[])
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

      {/* Tabs */}
      <div className="px-3 py-2 border-b">
        <Tabs value={tab} onValueChange={setTab}>
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
            {filtered.map((conv) => {
              const isActive = activeId === conv.id
              const initial = (conv.contact_name || conv.contact_phone || "?")
                .charAt(0)
                .toUpperCase()

              return (
                <button
                  key={conv.id}
                  onClick={() => {
                    onSelect(conv)
                    setUnreadCounts((prev) => ({ ...prev, [conv.id]: 0 }))
                  }}
                  className={`w-full flex items-start gap-3 p-3 rounded-xl text-left transition-colors mb-0.5 ${
                    isActive
                      ? "bg-accent/5 dark:bg-accent/10 border border-accent/20"
                      : "hover:bg-muted/50"
                  }`}
                >
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-accent/10 text-accent flex items-center justify-center font-bold text-sm flex-shrink-0">
                    {initial}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm truncate">
                        {conv.contact_name || conv.contact_phone}
                      </span>
                      <span className="text-xs text-muted-foreground flex-shrink-0 flex flex-col items-end gap-1">
                        <span className="whitespace-nowrap">{timeAgo(conv.last_message_at)}</span>
                        {unreadCounts[conv.id] ? (
                          <span className="bg-red-500 text-white text-[10px] font-bold h-[18px] min-w-[18px] px-1 flex items-center justify-center rounded-full leading-none">
                            {unreadCounts[conv.id] > 99 ? "99+" : unreadCounts[conv.id]}
                          </span>
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
