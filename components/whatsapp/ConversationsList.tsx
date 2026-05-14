"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import type { WAConversation, WhatsAppInstance } from "@/types/whatsapp"
import { Search, Bot, BotOff, MessageSquare, RefreshCw, Trash2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
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

// Función para calcular tiempo relativo de forma segura
function timeAgo(dateStr: any): string {
  if (!dateStr) return ""
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return ""
    const diff = Date.now() - date.getTime()
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 7) return date.toLocaleDateString('es-AR')
    if (days > 0) return `${days}d`
    if (hours > 0) return `${hours}h`
    if (minutes > 0) return `${minutes}m`
    return "ahora"
  } catch (e) {
    return ""
  }
}

interface ConversationsListProps {
  instance: WhatsAppInstance
  activeId: string | null
  onSelect: (conv: WAConversation) => void
}

export function ConversationsList({ instance, activeId, onSelect }: ConversationsListProps) {
  const [conversations, setConversations] = useState<WAConversation[]>([])
  const [search, setSearch] = useState("")
  const [tab, setTab] = useState("all")
  const [filterAgentEmail, setFilterAgentEmail] = useState("all")
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Initial load & Polling
  useEffect(() => {
    if (!instance?.id) return

    const supabase = createClient()
    async function load() {
      try {
        const { data, error } = await supabase
          .from("wa_conversations")
          .select("*, assigned_agent:profiles!wa_conversations_agent_id_fkey(email)")
          .eq("instance_id", instance.id)
          .order("last_message_at", { ascending: false })

        if (!error && data) {
          setConversations(data as any[])
        }
      } catch (err) {
        console.error("Load fail:", err)
      } finally {
        setLoading(false)
      }
    }

    load()

    const interval = setInterval(load, 10000)

    // Realtime
    const channel = supabase
      .channel(`list_${instance.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wa_conversations",
          filter: `instance_id=eq.${instance.id}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            const newItem = payload.new as WAConversation
            if (!newItem) return

            setConversations((prev) => {
              const others = prev.filter(c => c.id !== newItem.id)
              const newList = [newItem, ...others]
              newList.sort((a, b) => {
                const tA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
                const tB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
                return (isNaN(tB) ? 0 : tB) - (isNaN(tA) ? 0 : tA)
              })
              return newList
            })
          }
        }
      )
      .subscribe()

    return () => {
      clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [instance?.id])

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!window.confirm("¿Eliminar chat?")) return
    try {
      const res = await deleteConversation(id)
      if (res.success) {
        setConversations(prev => prev.filter(c => c.id !== id))
        toast.success("Eliminado")
      }
    } catch (err) {}
  }

  const agentEmails = useMemo(() => {
    const s = new Set<string>()
    conversations.forEach(c => {
      if (!c) return
      const agent = (c as any).assigned_agent
      const email = Array.isArray(agent) ? agent[0]?.email : agent?.email
      if (email) s.add(email)
    })
    return Array.from(s).sort()
  }, [conversations])

  const filtered = useMemo(() => {
    return conversations.filter(c => {
      if (!c) return false
      if (search) {
        const query = search.toLowerCase()
        const name = (c.contact_name || "").toLowerCase()
        const phone = (c.contact_phone || "")
        if (!name.includes(query) && !phone.includes(query)) return false
      }
      if (tab === "bot" && !c.bot_active) return false
      if (tab === "human" && c.bot_active) return false
      
      if (filterAgentEmail !== "all") {
        const agent = (c as any).assigned_agent
        const email = Array.isArray(agent) ? agent[0]?.email : agent?.email
        if (!email || email !== filterAgentEmail) return false
      }
      return true
    })
  }, [conversations, search, tab, filterAgentEmail])

  if (!mounted) return <div className="flex-1 bg-background" />

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Search */}
      <div className="p-3 border-b flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="pl-9 h-9 text-sm border-none bg-muted/50 focus-visible:ring-1"
          />
        </div>
        <button 
          onClick={() => setLoading(true)}
          className="p-2 hover:bg-muted rounded-full transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tabs & Agent Filter */}
      <div className="px-3 py-2 border-b space-y-2">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid grid-cols-3 h-8 bg-muted/30">
            <TabsTrigger value="all" className="text-[10px]">Todos</TabsTrigger>
            <TabsTrigger value="bot" className="text-[10px]">Bot</TabsTrigger>
            <TabsTrigger value="human" className="text-[10px]">Humano</TabsTrigger>
          </TabsList>
        </Tabs>

        <Select value={filterAgentEmail} onValueChange={setFilterAgentEmail}>
          <SelectTrigger className="h-8 text-[10px] bg-muted/30 border-none">
            <SelectValue placeholder="Asesor..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los asesores</SelectItem>
            {agentEmails.map(email => (
              <SelectItem key={email} value={email}>{email}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List Content */}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {loading && conversations.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground animate-pulse">Cargando chats...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <MessageSquare className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No hay conversaciones</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {filtered.map(conv => {
              if (!conv || !conv.id) return null
              const isActive = activeId === conv.id
              const agent = (conv as any).assigned_agent
              const agentEmail = Array.isArray(agent) ? agent[0]?.email : agent?.email

              return (
                <button
                  key={conv.id}
                  onClick={() => onSelect(conv)}
                  className={`w-full flex items-start gap-3 p-3 rounded-xl text-left transition-all group relative ${
                    isActive ? "bg-accent/10 border-accent/20 shadow-sm" : "hover:bg-muted/50"
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-accent/10 text-accent flex items-center justify-center font-bold text-sm flex-shrink-0">
                    {(conv.contact_name || conv.contact_phone || "?").charAt(0).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-semibold text-sm truncate">
                        {conv.contact_name || conv.contact_phone}
                      </span>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {timeAgo(conv.last_message_at)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between mt-1">
                      <p className="text-[10px] text-muted-foreground truncate flex-1">
                        {conv.contact_phone}
                        {agentEmail && (
                          <span className="ml-1 text-accent opacity-70">({agentEmail})</span>
                        )}
                      </p>
                      {conv.unread_count > 0 && !isActive && (
                        <Badge className="bg-red-500 hover:bg-red-500 text-white border-none text-[8px] h-4 min-w-4 px-1 rounded-full">
                          {conv.unread_count}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 mt-2">
                      {conv.bot_active ? (
                        <Bot className="w-3 h-3 text-green-500" />
                      ) : (
                        <BotOff className="w-3 h-3 text-red-400" />
                      )}
                      <div className="flex gap-1 overflow-hidden">
                        {(conv.etiquetas || []).slice(0, 2).map(tag => (
                          <span key={tag} className="text-[9px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground truncate max-w-[60px]">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={(e) => handleDelete(e, conv.id)}
                    className="absolute right-2 top-2 p-1 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
