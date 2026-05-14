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
  Tag,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { toast } from "sonner"
import { 
  safeFormatDate, 
  safeFormatTime, 
  safeUUID, 
  safeScrollIntoView 
} from "./SafeUtils"

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
  const [mounted, setMounted] = useState(false)

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

  useEffect(() => {
    setMounted(true)
  }, [])

  // Load messages
  const loadMessages = useCallback(async (isInitial = true) => {
    if (!mounted) return
    const supabase = createClient()
    if (isInitial) setLoading(true)
    
    try {
      const { data, count, error } = await supabase
        .from("wa_messages")
        .select("*", { count: "exact" })
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: true })
        .range(0, 49)

      if (error) throw error
      if (data) {
        setMessages(data as WAMessage[])
        setHasMore((count ?? 0) > 50)
      }
    } catch (err) {
      console.error("Error loading messages:", err)
      toast.error("Error al cargar mensajes")
    } finally {
      if (isInitial) setLoading(false)
      if (isInitial) {
        setTimeout(() => {
          safeScrollIntoView(bottomRef.current)
        }, 100)
      }
    }
  }, [conv.id, mounted])

  useEffect(() => {
    if (!mounted) return
    loadMessages(true)

    const supabase = createClient()
    const channel = supabase
      .channel(`chat_${conv.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wa_messages",
          filter: `conversation_id=eq.${conv.id}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newMsg = payload.new as WAMessage
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev
              return [...prev, newMsg]
            })
            if (shouldAutoScroll.current) {
              setTimeout(() => {
                safeScrollIntoView(bottomRef.current, "smooth")
              }, 50)
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conv.id, mounted, loadMessages])

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    shouldAutoScroll.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 50
  }, [])

  const handleSendMessage = async () => {
    if (!msgText.trim() || sending) return
    const text = msgText.trim()
    setSending(true)
    const tempId = safeUUID()
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
      toast.error(result.error || "Error al enviar")
    } else if (result.data) {
      setMessages(prev => prev.map(m => m.id === tempId ? (result.data as WAMessage) : m))
    }
    setSending(false)
  }

  const handleToggleBot = async (val: boolean) => {
    setSwitchingBot(true)
    const res = await toggleBotActive(conv.id, val)
    if (res.success) {
      setConv(prev => ({ ...prev, bot_active: val }))
      toast.success(val ? "IA Activada" : "IA Pausada")
    } else {
      toast.error("Error al cambiar estado de IA")
    }
    setSwitchingBot(false)
  }

  const handleToggleTag = async (tag: string) => {
    const current = conv.etiquetas || []
    const next = current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag]
    
    const res = await updateEtiquetas(conv.id, next)
    if (res.success) {
      setConv(prev => ({ ...prev, etiquetas: next }))
    } else {
      toast.error("Error al actualizar etiquetas")
    }
  }

  if (!mounted) return <div className="flex-1 bg-background" />

  const score = conv.score || 0
  const scoreColor = score < 40 ? "text-red-500" : score < 70 ? "text-yellow-500" : "text-green-500"

  return (
    <div className="flex flex-1 h-full min-w-0 overflow-hidden bg-background">
      <div className={`flex-col flex-1 min-w-0 h-full ${activeTab === 'info' ? 'hidden md:flex' : 'flex'}`}>
        {/* Header */}
        <div className="px-4 py-3 border-b bg-card/50 flex flex-shrink-0 items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="md:hidden p-1">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="w-10 h-10 rounded-full bg-accent/10 text-accent flex items-center justify-center font-bold">
            {(conv.contact_name || conv.contact_phone || "?").charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-sm truncate">{conv.contact_name || conv.contact_phone}</h2>
            <div className="flex items-center gap-2">
              <p className="text-[10px] text-muted-foreground">{conv.contact_phone}</p>
              {score > 0 && <span className={`text-[10px] font-bold ${scoreColor}`}>Score: {score}</span>}
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-4 mr-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium text-muted-foreground">BOT IA</span>
              <Switch 
                checked={conv.bot_active} 
                onCheckedChange={handleToggleBot}
                disabled={switchingBot}
              />
            </div>
            
            <Popover open={tagOpen} onOpenChange={setTagOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Tag className="w-4 h-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2" align="end">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold px-2 py-1 uppercase text-muted-foreground">Etiquetas</p>
                  {ALL_TAGS.map(tag => (
                    <button
                      key={tag}
                      onClick={() => handleToggleTag(tag)}
                      className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted flex items-center justify-between ${
                        (conv.etiquetas || []).includes(tag) ? "text-accent font-medium bg-accent/5" : "text-foreground"
                      }`}
                    >
                      {tag}
                      {(conv.etiquetas || []).includes(tag) && <Plus className="w-3 h-3 rotate-45" />}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => loadMessages(true)}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          <Button variant="ghost" size="icon" onClick={() => setActiveTab(activeTab === 'chat' ? 'info' : 'chat')} className="md:hidden">
            <Info className="w-5 h-5" />
          </Button>
        </div>

        {/* Messages List */}
        <div 
          ref={scrollRef} 
          onScroll={handleScroll} 
          className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar bg-slate-50/30 dark:bg-transparent"
        >
          {loading && messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-accent/50" />
                <p className="text-xs text-muted-foreground">Cargando conversación...</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg, idx) => {
                const currentDate = safeFormatDate(msg.created_at)
                const prevDate = idx > 0 ? safeFormatDate(messages[idx - 1].created_at) : null
                const showSeparator = currentDate !== prevDate

                return (
                  <div key={msg.id}>
                    {showSeparator && (
                      <div className="flex justify-center my-4">
                        <span className="text-[10px] bg-muted/80 backdrop-blur-sm px-3 py-1 rounded-full text-muted-foreground border shadow-sm">{currentDate}</span>
                      </div>
                    )}
                    <MessageBubble msg={msg} mounted={mounted} contactName={conv.contact_name || conv.contact_phone} />
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-3 border-t bg-card/50 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Input
              value={msgText}
              onChange={(e) => setMsgText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSendMessage()
                }
              }}
              placeholder="Escribe un mensaje..."
              className="flex-1 bg-muted/50 border-none h-10 text-sm focus-visible:ring-1"
            />
            <Button 
              size="icon" 
              onClick={handleSendMessage} 
              disabled={sending || !msgText.trim()} 
              className="bg-accent hover:bg-accent/90 h-10 w-10 shrink-0"
            >
              <Send className="w-5 h-5 text-white" />
            </Button>
          </div>
        </div>
      </div>

      {/* Info Column (Traceability) */}
      <div className={`w-full md:w-[320px] border-l bg-muted/5 h-full ${activeTab === 'info' ? 'flex' : 'hidden md:flex'} flex-col`}>
        <div className="p-4 border-b flex items-center justify-between bg-card/30">
          <h3 className="font-semibold text-sm">Información del Lead</h3>
          <Button variant="ghost" size="icon" onClick={() => setActiveTab('chat')} className="md:hidden">
            <X className="w-5 h-5" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto no-scrollbar">
          <LeadTraceability
            conversation={conv}
            messages={messages}
            onDeleteChat={onDeleteChat}
          />
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ msg, mounted, contactName }: { msg: WAMessage; mounted: boolean, contactName: string }) {
  const isBot = msg.role === "bot"
  const isHuman = msg.role === "human"
  const isLead = msg.role === "lead"
  const isInternal = msg.role === "internal"
  const time = mounted ? safeFormatTime(msg.created_at) : ""

  // Alignment: Bot/Lead on the Left, Human (Us) on the Right
  const isLeft = isBot || isLead
  const isRight = isHuman

  if (isInternal) {
    return (
      <div className="flex justify-center my-2">
        <div className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900 rounded-xl p-3 max-w-[85%] shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Lock className="w-3 h-3 text-amber-600" />
            <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Nota interna</span>
          </div>
          <p className="text-xs text-amber-800 dark:text-amber-200 italic leading-relaxed">{msg.content}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex ${isLeft ? "justify-start" : "justify-end"}`}>
      <div className={`max-w-[85%] md:max-w-[75%] space-y-1`}>
        <div className={`flex items-center gap-2 mb-0.5 ${isLeft ? "flex-row" : "flex-row-reverse"}`}>
          <span className="text-[10px] font-semibold text-muted-foreground/70">
            {isBot ? "Asesor IA" : isLead ? contactName : "Usted"}
          </span>
          <span className="text-[10px] text-muted-foreground/40">{time}</span>
        </div>
        <div className={`rounded-2xl px-4 py-2.5 text-sm shadow-sm border ${
          isLeft 
            ? "bg-white dark:bg-card text-foreground rounded-tl-none border-border/50" 
            : "bg-accent text-accent-foreground rounded-tr-none border-accent/20"
        }`}>
          <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.content}</p>
        </div>
      </div>
    </div>
  )
}
