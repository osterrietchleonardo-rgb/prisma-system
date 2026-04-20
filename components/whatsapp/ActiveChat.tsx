"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import LeadTraceability from "./LeadTraceability"
import { createClient } from "@/lib/supabase/client"
import type { WAConversation, WAMessage, WhatsAppInstance } from "@/types/whatsapp"
import {
  toggleBotActive,
  sendDirectMessage,
  addInternalNote,
  updateEtiquetas,
} from "@/app/actions/whatsapp"
import {
  ArrowLeft,
  Bot,
  Lock,
  Send,
  Plus,
  X,
  ChevronUp,
  Pause,
  User,
  Info,
  RefreshCw,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"

const ALL_TAGS = [
  "caliente",
  "tibio",
  "frío",
  "visitó",
  "con presupuesto",
  "sin presupuesto",
  "no responde",
]

interface ActiveChatProps {
  conversation: WAConversation
  instance: WhatsAppInstance
  onBack?: () => void
  onDeleteChat?: () => void
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (d.toDateString() === today.toDateString()) return "Hoy"
  if (d.toDateString() === yesterday.toDateString()) return "Ayer"
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short" })
}

export function ActiveChat({ conversation: initialConv, instance, onBack, onDeleteChat }: ActiveChatProps) {
  const [conv, setConv] = useState<WAConversation>(initialConv)
  const [messages, setMessages] = useState<WAMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)

  // Input states
  const [msgText, setMsgText] = useState("")
  const [noteText, setNoteText] = useState("")
  const [sending, setSending] = useState(false)
  const [sendingNote, setSendingNote] = useState(false)
  const [switchingBot, setSwitchingBot] = useState(false)

  // Tag popover
  const [tagOpen, setTagOpen] = useState(false)

  // Mobile info tab
  const [activeTab, setActiveTab] = useState<"chat" | "info">("chat")

  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const shouldAutoScroll = useRef(true)

  // Sync conv when prop changes
  useEffect(() => {
    setConv(initialConv)
  }, [initialConv])

  // Load messages
  useEffect(() => {
    const supabase = createClient()

    async function load() {
      setLoading(true)
      const { data, count } = await supabase
        .from("wa_messages")
        .select("*", { count: "exact" })
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: true })
        .range(0, 49)

      if (data) {
        setMessages(data as WAMessage[])
        setHasMore((count ?? 0) > 50)
      }
      setLoading(false)

      // Auto-scroll to bottom on initial load
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "auto" })
      }, 100)
    }

    load()

    // Realtime subscription for ALL changes in this conversation's messages
    const channel = supabase
      .channel(`chat_messages_${conv.id}`)
      .on(
        "postgres_changes",
        {
          event: "*", // Listen to all events (INSERT, UPDATE, DELETE)
          schema: "public",
          table: "wa_messages",
          filter: `conversation_id=eq.${conv.id}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newMsg = payload.new as WAMessage
            setMessages((prev) => {
              // Dedup
              if (prev.some((m) => m.id === newMsg.id)) return prev
              return [...prev, newMsg]
            })

            // Auto-scroll if near bottom
            if (shouldAutoScroll.current) {
              setTimeout(() => {
                bottomRef.current?.scrollIntoView({ behavior: "smooth" })
              }, 50)
            }
          } else if (payload.eventType === "DELETE") {
             setMessages(prev => prev.filter(m => m.id !== (payload.old as any).id))
          } else if (payload.eventType === "UPDATE") {
             setMessages(prev => prev.map(m => m.id === (payload.new as any).id ? (payload.new as WAMessage) : m))
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[Realtime] Subscribed to messages for conversation ${conv.id}`)
        }
      })

    const broadcastChannel = supabase
      .channel(`active-agency-${instance.agency_id}`)
      .on(
        "broadcast",
        { event: "refresh-whatsapp" },
        (payload) => {
          // If the broadcast is for THIS conversation, force a refresh
          if (payload.payload?.conversation_id === conv.id) {
            load()
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      supabase.removeChannel(broadcastChannel)
    }
  }, [conv.id, instance.agency_id])

  // Track scroll position for auto-scroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    shouldAutoScroll.current =
      el.scrollTop + el.clientHeight >= el.scrollHeight - 50
  }, [])

  // ---- Actions ----

  const handleToggleBot = async () => {
    if (switchingBot) return
    setSwitchingBot(true)
    const newValue = !conv.bot_active
    // Optimistic
    setConv((prev) => ({ ...prev, bot_active: newValue }))
    const result = await toggleBotActive(conv.id, newValue)
    if (!result.success) {
      // Revert
      setConv((prev) => ({ ...prev, bot_active: !newValue }))
      toast.error(result.error || "Error al cambiar estado del bot")
    }
    setSwitchingBot(false)
  }

  const handleRefreshMessages = async () => {
    const supabase = createClient()
    setLoading(true)
    const { data } = await supabase
      .from("wa_messages")
      .select("*")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true })
      .range(0, 49)

    if (data) {
      setMessages(data as WAMessage[])
      // Auto-scroll to bottom
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "auto" })
      }, 100)
    }
    setLoading(false)
    toast.success("Mensajes actualizados")
  }

  const handleSendMessage = async () => {
    if (!msgText.trim() || sending) return
    const text = msgText.trim()
    setSending(true)
    
    // Optimistic insert
    const tempId = crypto.randomUUID()
    const optimisticMsg: WAMessage = {
      id: tempId,
      conversation_id: conv.id,
      agency_id: instance.agency_id,
      content: text,
      role: 'human',
      message_type: 'text',
      created_at: new Date().toISOString(),
      metadata: { optimistic: true }
    }
    setMessages(prev => [...prev, optimisticMsg])
    setMsgText("")

    const result = await sendDirectMessage(conv.id, text)
    if (!result.success) {
      setMsgText(text)
      setMessages(prev => prev.filter(m => m.id !== tempId))
      toast.error(result.error || "Error al enviar mensaje")
    } else if (result.data) {
      // Reemplazamos el optimista por el real de la base de datos
      setMessages(prev => prev.map(m => m.id === tempId ? (result.data as WAMessage) : m))
    }
    setSending(false)
  }

  const handleAddNote = async () => {
    if (!noteText.trim() || sendingNote) return
    const text = noteText.trim()
    setSendingNote(true)
    
    // Optimistic insert
    const tempId = crypto.randomUUID()
    const optimisticNote: WAMessage = {
      id: tempId,
      conversation_id: conv.id,
      agency_id: instance.agency_id,
      content: text,
      role: 'internal',
      message_type: 'text',
      created_at: new Date().toISOString(),
      metadata: { optimistic: true }
    }
    setMessages(prev => [...prev, optimisticNote])
    setNoteText("")

    const result = await addInternalNote(conv.id, text)
    if (!result.success) {
      setNoteText(text)
      setMessages(prev => prev.filter(m => m.id !== tempId))
      toast.error(result.error || "Error al agregar nota")
    } else if (result.data) {
      // Reemplazamos el optimista por el real de la base de datos
      setMessages(prev => prev.map(m => m.id === tempId ? (result.data as WAMessage) : m))
    }
    setSendingNote(false)
  }

  const handleRemoveTag = async (tag: string) => {
    const newTags = conv.etiquetas.filter((t) => t !== tag)
    // Optimistic
    setConv((prev) => ({ ...prev, etiquetas: newTags }))
    const result = await updateEtiquetas(conv.id, newTags)
    if (!result.success) {
      setConv((prev) => ({ ...prev, etiquetas: [...newTags, tag] }))
      toast.error("Error al actualizar etiquetas")
    }
  }

  const handleAddTag = async (tag: string) => {
    if (conv.etiquetas.includes(tag)) return
    const newTags = [...conv.etiquetas, tag]
    // Optimistic
    setConv((prev) => ({ ...prev, etiquetas: newTags }))
    setTagOpen(false)
    const result = await updateEtiquetas(conv.id, newTags)
    if (!result.success) {
      setConv((prev) => ({ ...prev, etiquetas: conv.etiquetas }))
      toast.error("Error al actualizar etiquetas")
    }
  }

  // Score color
  const scoreColor =
    conv.score < 40
      ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
      : conv.score < 70
      ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300"
      : "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"

  // Status badge
  const statusColor =
    conv.status === "active"
      ? "bg-green-500"
      : conv.status === "pending"
      ? "bg-yellow-500"
      : "bg-neutral-400"

  const initial = (conv.contact_name || conv.contact_phone || "?")
    .charAt(0)
    .toUpperCase()

  return (
    <div className="flex flex-1 h-full min-w-0 overflow-hidden">
      {/* ====== CHAT COLUMN ====== */}
      <div className={`flex-col flex-1 min-w-0 h-full lg:flex ${activeTab === 'info' ? 'hidden' : 'flex'}`}>
        {/* ====== HEADER ====== */}
      <div className="px-4 py-3 border-b bg-card/50 flex-shrink-0">
        <div className="flex items-center gap-3">
          {/* Back button (mobile) */}
          {onBack && (
            <button
              onClick={onBack}
              className="md:hidden p-1.5 rounded-lg hover:bg-muted transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}

          {/* Avatar */}
          <div className="w-10 h-10 rounded-full bg-accent/10 text-accent flex items-center justify-center font-bold text-sm flex-shrink-0">
            {initial}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm truncate">
                {conv.contact_name || conv.contact_phone}
              </span>
              <div className={`w-2 h-2 rounded-full ${statusColor}`} />
            </div>
            <p className="text-xs text-muted-foreground">{conv.contact_phone}</p>
          </div>

          <div
            className={`px-2 py-1 rounded-md text-xs font-bold ${scoreColor}`}
          >
            {conv.score}pts
          </div>

          {/* Refresh button for messages */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefreshMessages}
            disabled={loading}
            className="h-8 w-8 text-muted-foreground hover:text-accent"
            title="Sincronizar mensajes"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>

          {/* Bot toggle */}
          <div className="hidden sm:flex items-center gap-2">
            <div className="text-right">
              <p className="text-xs font-semibold">Asesor IA</p>
              <p className="text-[10px] text-muted-foreground">
                {conv.bot_active ? "IA respondiendo" : "Control manual"}
              </p>
            </div>
            <Switch
              checked={conv.bot_active}
              onCheckedChange={handleToggleBot}
              disabled={switchingBot}
              className="data-[state=checked]:bg-green-500"
            />
          </div>
        </div>

        {/* Tags row */}
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {conv.etiquetas.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="text-xs px-2 py-0.5 gap-1 cursor-pointer hover:bg-destructive/10"
            >
              {tag}
              <X
                className="w-3 h-3 text-muted-foreground hover:text-destructive"
                onClick={() => handleRemoveTag(tag)}
              />
            </Badge>
          ))}
          <Popover open={tagOpen} onOpenChange={setTagOpen}>
            <PopoverTrigger asChild>
              <button className="w-6 h-6 rounded-full bg-muted flex items-center justify-center hover:bg-accent/20 transition-colors">
                <Plus className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" align="start">
              <div className="space-y-1">
                {ALL_TAGS.filter((t) => !conv.etiquetas.includes(t)).map(
                  (tag) => (
                    <button
                      key={tag}
                      onClick={() => handleAddTag(tag)}
                      className="w-full text-left text-sm px-2 py-1.5 rounded-md hover:bg-muted transition-colors"
                    >
                      {tag}
                    </button>
                  )
                )}
                {ALL_TAGS.every((t) => conv.etiquetas.includes(t)) && (
                  <p className="text-xs text-muted-foreground px-2 py-1">
                    Todas asignadas
                  </p>
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* Mobile bot toggle */}
          <div className="sm:hidden flex items-center gap-2 ml-auto">
            <span className="text-[10px] text-muted-foreground">
              {conv.bot_active ? "IA ON" : "Manual"}
            </span>
            <Switch
              checked={conv.bot_active}
              onCheckedChange={handleToggleBot}
              disabled={switchingBot}
              className="data-[state=checked]:bg-green-500 scale-90"
            />
          </div>

          {/* Info toggle (mobile) */}
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden ml-1 h-7 px-2 text-xs"
            onClick={() => setActiveTab('info')}
          >
            <Info className="w-3.5 h-3.5 mr-1" />
            Info
          </Button>
        </div>
      </div>

      {/* ====== MESSAGES ====== */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4"
      >
        {loading ? (
          <div className="flex flex-col gap-4 py-8 px-2 max-w-md mx-auto w-full">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className={`flex w-full ${i % 2 === 0 ? "justify-end" : "justify-start"}`}
              >
                <div className={`space-y-2 ${i % 2 === 0 ? "items-end" : "items-start"}`}>
                  <Skeleton className="h-14 w-[250px] rounded-2xl" />
                  <Skeleton className="h-3 w-12" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {hasMore && (
              <div className="text-center mb-4">
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">
                  <ChevronUp className="w-3 h-3 mr-1" />
                  Cargar anteriores
                </Button>
              </div>
            )}

            <div className="space-y-3">
              {messages.map((msg, idx) => {
                // Date separator
                const showDate =
                  idx === 0 ||
                  formatDate(msg.created_at) !==
                    formatDate(messages[idx - 1].created_at)

                return (
                  <div key={msg.id}>
                    {showDate && (
                      <div className="flex items-center justify-center my-4">
                        <span className="text-[10px] text-muted-foreground bg-muted/50 px-3 py-1 rounded-full font-medium">
                          {formatDate(msg.created_at)}
                        </span>
                      </div>
                    )}
                    <MessageBubble msg={msg} />
                  </div>
                )
              })}
            </div>

            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* ====== BOTTOM INPUT ZONE ====== */}
      <div className="border-t bg-card/50 flex-shrink-0">
        {conv.bot_active ? (
          /* Bot active banner */
          <div className="flex items-center justify-between px-4 py-3 bg-green-50 dark:bg-green-950/20">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-green-700 dark:text-green-400">
                Asesor IA respondiendo
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleToggleBot}
              disabled={switchingBot}
              className="text-xs border-green-300 text-green-700 hover:bg-green-100 dark:text-green-400 dark:hover:bg-green-950"
            >
              <Pause className="w-3 h-3 mr-1" />
              Pausar y tomar control
            </Button>
          </div>
        ) : (
          /* Manual mode: message + note inputs */
          <div className="p-3 space-y-3">
            {/* Direct message */}
            <div className="flex gap-2">
              <Textarea
                value={msgText}
                aria-label="Mensaje al lead"
                onChange={(e) => setMsgText(e.target.value)}
                placeholder="Escribe un mensaje al lead..."
                rows={2}
                className="resize-none text-sm flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleSendMessage()
                  }
                }}
              />
              <Button
                onClick={handleSendMessage}
                disabled={!msgText.trim() || sending}
                className="bg-accent hover:bg-accent/90 text-white self-end h-10 w-10 p-0"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>

            <Separator />

            {/* Internal note */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-yellow-600" />
                <Input
                  value={noteText}
                  aria-label="Nota interna"
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Nota interna (solo visible para el equipo)..."
                  className="pl-9 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      handleAddNote()
                    }
                  }}
                />
              </div>
              <Button
                variant="outline"
                onClick={handleAddNote}
                disabled={!noteText.trim() || sendingNote}
                className="text-xs gap-1 border-yellow-300 text-yellow-700 hover:bg-yellow-50 dark:text-yellow-400"
              >
                <Lock className="w-3 h-3" />
                Agregar
              </Button>
            </div>
          </div>
        )}
      </div></div>

      {/* ====== INFO COLUMN (LeadTraceability) ====== */}
      <div className={`lg:w-[280px] lg:min-w-[280px] xl:w-[320px] xl:min-w-[320px] bg-card/30 flex-col h-full overflow-y-auto border-l lg:flex ${activeTab === 'chat' ? 'hidden' : 'flex flex-1 w-full min-w-0'}`}>
         {/* Mobile info header */}
         <div className="lg:hidden flex-shrink-0 px-4 py-3 border-b bg-card/50 flex flex-row items-center justify-between sticky top-0 z-10">
           <span className="font-semibold text-sm flex items-center gap-2"><Info className="w-4 h-4 text-accent"/> Info del Lead</span>
           <Button variant="ghost" size="sm" onClick={() => setActiveTab('chat')} className="h-8">
             <ArrowLeft className="w-4 h-4 mr-1" />
             Volver al chat
           </Button>
         </div>
         <ScrollArea className="flex-1">
           <LeadTraceability conversation={conv} messages={messages} onDeleteChat={onDeleteChat} />
         </ScrollArea>
      </div>
    </div>
  )
}

// =============================================
// Message Bubble
// =============================================

function MessageBubble({ msg }: { msg: WAMessage }) {
  const time = formatTime(msg.created_at)

  if (msg.role === "lead") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[70%]">
          <div className="bg-neutral-100 dark:bg-neutral-800 rounded-2xl rounded-br-sm px-4 py-2.5">
            <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1 text-right">{time}</p>
        </div>
      </div>
    )
  }

  if (msg.role === "bot") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[70%]">
          <div className="flex items-center gap-1.5 mb-1">
            <Bot className="w-3 h-3 text-accent" />
            <span className="text-xs font-semibold text-accent">
              Asesor IA
            </span>
          </div>
          <div className="bg-accent/5 dark:bg-accent/10 border border-accent/20 rounded-2xl rounded-bl-sm px-4 py-2.5">
            <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">{time}</p>
        </div>
      </div>
    )
  }

  if (msg.role === "human") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[70%]">
          <div className="flex items-center gap-1.5 mb-1">
            <User className="w-3 h-3 text-primary" />
            <span className="text-xs font-semibold text-primary">
              Director
            </span>
          </div>
          <div className="bg-primary/5 dark:bg-primary/10 border border-primary/20 rounded-2xl rounded-bl-sm px-4 py-2.5">
            <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">{time}</p>
        </div>
      </div>
    )
  }

  // internal note
  return (
    <div className="flex justify-center">
      <div className="max-w-[80%]">
        <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-xl px-4 py-2.5 flex items-start gap-2">
          <Lock className="w-3.5 h-3.5 text-yellow-600 mt-0.5 flex-shrink-0" />
          <div>
            <span className="text-[10px] font-semibold text-yellow-600 dark:text-yellow-400 uppercase tracking-wider">
              Nota interna
            </span>
            <p className="text-sm italic text-yellow-800 dark:text-yellow-300 whitespace-pre-wrap break-words">
              {msg.content}
            </p>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1 text-center">{time}</p>
      </div>
    </div>
  )
}
