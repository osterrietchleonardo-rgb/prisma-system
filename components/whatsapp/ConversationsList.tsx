"use client"

import { useState, useEffect, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import type { WAConversation, WhatsAppInstance } from "@/types/whatsapp"
import { Search, Bot, BotOff, MessageSquare, RefreshCw, Trash2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  const [debugError, setDebugError] = useState<string | null>(null)

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
      try {
        const { data, error } = await supabase
          .from("wa_conversations")
          .select("*, assigned_agent:profiles!wa_conversations_agent_id_fkey(email)")
          .eq("instance_id", instance.id)
          .order("last_message_at", { ascending: false })

        if (error) {
          console.error("Error loading conversations with agents:", error)
          setDebugError(error.message)
        }
        
        if (data) {
          console.log("Loaded conversations:", data.length, "First item assigned_agent:", (data[0] as any)?.assigned_agent)
          setConversations(data as any[])
        }
        setLoading(false)
      } catch (e: any) {
        setDebugError(e.message)
        setLoading(false)
      }
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
                const existingItem = currentPrev.find((c) => c.id === updatedItem.id)
                // Preservar el objeto agent unido si existía en el estado local
                const mergedItem = existingItem ? { ...existingItem, ...updatedItem } : updatedItem;
                
                const otherConversations = currentPrev.filter((c) => c.id !== updatedItem.id)
                // Siempre al principio en el UPDATE (last message moved it)
                return [mergedItem, ...otherConversations]
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
    const emails = new Set<string>()
    conversations.forEach((c) => {
      if (!c) return;
      const agentData = (c as any).assigned_agent;
      const email = Array.isArray(agentData) ? agentData[0]?.email : agentData?.email;
      if (email) emails.add(email)
    })
    return Array.from(emails)
  }, [conversations])

  // Filter by search + tab + agent
  const filtered = useMemo(() => {
    return conversations.filter((c) => {
      if (!c) return false;
      // Búsqueda por nombre o teléfono
      const searchTerm = search.toLowerCase()
      const matchesSearch = 
        (c.contact_phone || "").toLowerCase().includes(searchTerm) || 
        (c.contact_name || "").toLowerCase().includes(searchTerm)
      
      if (!matchesSearch) return false

      // Filtro por tab (bot/pausado/etc)
      if (tab === "bot" && !c.bot_active) return false
      if (tab === "paused" && c.bot_active) return false

      // Filtro por agente
      if (filterAgentEmail !== "all") {
        const agentData = (c as any).assigned_agent;
        const email = Array.isArray(agentData) ? agentData[0]?.email : agentData?.email;
        if (email !== filterAgentEmail) return false;
      }

      return true
    })
  }, [conversations, search, tab, filterAgentEmail])

  if (debugError) return <div style={{color:'red',padding:'20px',fontSize:'18px', backgroundColor: 'white', border: '2px solid red'}}>DEBUG ERROR: {debugError}</div>

  return (
    <div style={{color:'white', padding:'20px', backgroundColor: 'brown', height: '100%'}}>
      HOOKS OK - convs: {conversations.length}
    </div>
  )
}
