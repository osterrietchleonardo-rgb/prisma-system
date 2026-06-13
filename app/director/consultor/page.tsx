"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Send, Bot, User, Loader2, History, Plus, MessageSquare, Pencil, Trash2, MapPin, BedDouble, Bath, Maximize, ChevronLeft, ChevronRight, ExternalLink, Sparkles, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase"
import { toast } from "sonner"
import { AiCreditBadge } from "@/components/ai-credit-badge"
import { ConsultorResultsSection, MatchedPropertiesResponse, UnifiedProperty } from "@/components/shared/consultor-results"
import { BuscadorNotasSettings } from "@/components/consultor/buscador-notas-settings"
import { NotebookPen } from "lucide-react"
interface Property {
  id: string
  title: string
  address: string
  city?: string
  price: number
  currency: string
  property_type: string
  status: string
  bedrooms: number
  bathrooms: number
  total_area: number
  covered_area?: number
  images: string[]
  description?: string
  similarity: number
  amenity_matches?: {
    matched: string[]
    missing: string[]
  }
}

interface Message {
  role: "user" | "assistant"
  content: string
  matchedProperties?: MatchedPropertiesResponse | UnifiedProperty[]
}

interface Session {
  id: string
  title: string
  summary: string
  created_at: string
}

export default function ConsultorIAPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "¡Hola! Soy tu Buscador IA. Estoy listo para ayudarte a encontrar la propiedad ideal en tu cartera. ¿Qué estás buscando hoy? (Ej: 'Busco un 3 ambientes en zona norte por menos de 250k')"
    }
  ])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [sessions, setSessions] = useState<Session[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renamingTitle, setRenamingTitle] = useState("")
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [agencyId, setAgencyId] = useState<string>("")
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [view, setView] = useState<"chat" | "notas">("chat")
  
  const scrollRef = useRef<HTMLDivElement>(null)

  // Carousel State per message
  const [activeImageIndices, setActiveImageIndices] = useState<Record<string, number>>({})

  const fetchSessions = useCallback(async (aId?: string) => {
    const targetAgencyId = aId || agencyId
    if (!targetAgencyId) return
    try {
      const res = await fetch(`/api/ai/consultor?agencyId=${targetAgencyId}`)
      const data = await res.json()
      if (Array.isArray(data)) setSessions(data)
    } catch (e) {
      console.error("Error fetching sessions:", e)
    }
  }, [agencyId])

  useEffect(() => {
    const supabase = createClient()
    const getAgency = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('agency_id')
          .eq('id', user.id)
          .single()
        
        if (profile?.agency_id) {
          setAgencyId(profile.agency_id)
          fetchSessions(profile.agency_id)
        }
      }
    }
    getAgency()
  }, [fetchSessions])

  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]')
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight
      }
    }
  }, [messages, isLoading])

  const loadSession = async (id: string) => {
    if (renamingId) return
    setIsLoading(true)
    setCurrentSessionId(id)
    try {
      const res = await fetch(`/api/ai/consultor?sessionId=${id}`)
      const data = await res.json()
      if (Array.isArray(data)) {
        setMessages(data.map((m: any) => ({
          role: m.role,
          content: m.content,
          matchedProperties: m.metadata?.matchedProperties
        })))
      }
    } catch (e) {
      console.error("Error loading session:", e)
    } finally {
      setIsLoading(false)
    }
  }

  const startNewChat = () => {
    setCurrentSessionId(null)
    setMessages([{
      role: "assistant",
      content: "¡Hola! Soy tu Buscador IA. Estoy listo para ayudarte a encontrar la propiedad ideal en tu cartera. ¿Qué estás buscando hoy?"
    }])
  }

  const handleRename = async (id: string, e: React.FormEvent) => {
    e.preventDefault()
    if (!renamingTitle.trim()) return
    try {
      const res = await fetch("/api/ai/consultor", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: id, title: renamingTitle })
      })
      if (res.ok) {
        setSessions(prev => prev.map(s => s.id === id ? { ...s, title: renamingTitle } : s))
        setRenamingId(null)
      }
    } catch (e) {
      console.error("Error renaming:", e)
    }
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (deletingId !== id) {
      setDeletingId(id)
      return
    }

    try {
      const res = await fetch(`/api/ai/consultor?sessionId=${id}`, { method: "DELETE" })
      if (res.ok) {
        setSessions(prev => prev.filter(s => s.id !== id))
        if (currentSessionId === id) startNewChat()
        toast.success("Chat eliminado")
      } else {
        const err = await res.json()
        toast.error(`Error: ${err.error || "No se pudo eliminar"}`)
      }
    } catch (e) {
      console.error("Error deleting:", e)
      toast.error("Error de conexión al eliminar")
    } finally {
      setDeletingId(null)
    }
  }

  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    const userMessage = input.trim()
    setInput("")
    setMessages(prev => [...prev, { role: "user", content: userMessage }])
    setIsLoading(true)

    try {
      const response = await fetch("/api/ai/consultor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          message: userMessage,
          sessionId: currentSessionId,
          agencyId,
          history: messages.slice(-5) // Send last 5 messages for context
        })
      })

      if (!response.ok) throw new Error("Error en el servidor")

      const data = await response.json()
      
      if (!currentSessionId && data.sessionId) {
        setCurrentSessionId(data.sessionId)
      }

      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: data.content,
        matchedProperties: data.matchedProperties
      }])

      // Auto-refresh credit badge after consumption
      window.dispatchEvent(new CustomEvent('prisma-refresh-credits'))
      fetchSessions()
    } catch (error) {
      console.error("Error:", error)
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: "Lo siento, hubo un error al consultar las propiedades. Por favor, intenta de nuevo." 
      }])
    } finally {
      setIsLoading(false)
    }
  }

  const nextImage = (propId: string, max: number) => {
    setActiveImageIndices(prev => ({
      ...prev,
      [propId]: ((prev[propId] || 0) + 1) % max
    }))
  }

  const prevImage = (propId: string, max: number) => {
    setActiveImageIndices(prev => ({
      ...prev,
      [propId]: ((prev[propId] || 0) - 1 + max) % max
    }))
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Barra de solapas: Buscador / Notas (Notas solo para el director) */}
      <div className="flex items-center gap-1 border-b bg-card/30 backdrop-blur-sm px-3">
        <button
          onClick={() => setView("chat")}
          className={cn(
            "flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors",
            view === "chat" ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Bot className="w-4 h-4" /> Buscador
        </button>
        <button
          onClick={() => setView("notas")}
          className={cn(
            "flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors",
            view === "notas" ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <NotebookPen className="w-4 h-4" /> Notas
        </button>
      </div>

      {view === "notas" ? (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <BuscadorNotasSettings />
        </div>
      ) : (
      <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Sidebar de Historial */}
      <aside className={cn(
        "bg-muted/50 border-r transition-all duration-300 flex flex-col overflow-hidden",
        isSidebarOpen ? "w-80" : "w-0"
      )}>
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-accent">
            <History className="w-5 h-5" />
            <span className="text-sm uppercase tracking-tighter">Búsquedas Guardadas</span>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(false)} className="md:hidden hover:bg-accent/10 hover:text-accent transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </div>
        
        <div className="p-3">
          <Button onClick={startNewChat} className="w-full justify-start gap-2 bg-accent hover:bg-accent/90 shadow-sm">
            <Plus className="w-4 h-4" /> Nueva Búsqueda
          </Button>
        </div>

        <ScrollArea className="flex-1 px-3 pb-4">
          <div className="space-y-2">
            {sessions.map((s) => (
              <div
                key={s.id}
                onClick={() => loadSession(s.id)}
                className={cn(
                  "w-full group relative rounded-xl transition-all border overflow-hidden cursor-pointer p-3",
                  currentSessionId === s.id ? "bg-accent/10 border-accent/30" : "hover:bg-accent/5 border-transparent"
                )}
              >
                <div className="flex items-start gap-3">
                   <div className={cn(
                      "p-2 rounded-lg shrink-0",
                      currentSessionId === s.id ? "bg-accent/20 text-accent" : "bg-muted text-muted-foreground"
                    )}>
                      <MessageSquare className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0 pr-14">
                      {renamingId === s.id ? (
                        <form onSubmit={(e) => handleRename(s.id, e)}>
                          <Input autoFocus value={renamingTitle} onBlur={() => setRenamingId(null)} onChange={(e) => setRenamingTitle(e.target.value)} className="h-7 text-xs px-1 py-0 bg-background" />
                        </form>
                      ) : (
                        <>
                          <p className="text-sm font-semibold truncate block w-full max-w-[150px] leading-none mb-1.5">{s.title}</p>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-tighter shrink-0">{new Date(s.created_at).toLocaleDateString()}</p>
                        </>
                      )}
                    </div>
                </div>
                <div className="absolute top-1/2 -translate-y-1/2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all duration-200 z-20">
                    {deletingId === s.id ? (
                      <div className="flex gap-1 animate-in zoom-in-95 duration-200 bg-background/80 backdrop-blur-sm p-1 rounded-lg border shadow-sm">
                        <Button 
                          size="icon" 
                          className="h-7 w-7 bg-destructive hover:bg-destructive/90 text-white rounded-md shadow-sm"
                          onClick={(e) => handleDelete(s.id, e)}
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost"
                          size="icon" 
                          className="h-7 w-7 text-muted-foreground hover:bg-muted rounded-md"
                          onClick={(e) => { e.stopPropagation(); setDeletingId(null); }}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-0.5 bg-background/60 backdrop-blur-sm p-0.5 rounded-lg border border-transparent group-hover:border-border/40 shadow-sm">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-muted-foreground hover:text-accent hover:bg-accent/10 transition-colors"
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            setRenamingId(s.id); 
                            setRenamingTitle(s.title); 
                            setDeletingId(null);
                          }}
                        >
                          <Pencil className="w-4 h-4" />
                          <span className="sr-only">Renombrar</span>
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          onClick={(e) => { e.stopPropagation(); setDeletingId(s.id); }}
                        >
                          <Trash2 className="w-4 h-4" />
                          <span className="sr-only">Eliminar</span>
                        </Button>
                      </div>
                    )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </aside>
      
      {/* Re-open sidebar floating button if closed */}
      {!isSidebarOpen && (
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="absolute left-0 top-20 z-40 bg-accent text-accent-foreground p-1.5 rounded-r-lg shadow-lg hover:pr-3 transition-all"
        >
          <History className="w-5 h-5 flex-shrink-0" />
        </button>
      )}

      <div className="flex-1 flex flex-col overflow-hidden relative">
        <header className="p-4 md:p-6 border-b bg-card/30 backdrop-blur-sm flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-2.5 bg-accent/20 rounded-2xl shadow-inner cursor-pointer" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
              <Bot className="w-6 h-6 text-accent" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Buscador IA</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Buscador Inteligente de Propiedades</span>
              </div>
            </div>
          </div>
          <AiCreditBadge className="w-fit" />
        </header>

        <ScrollArea className="flex-1 p-4 md:p-8" ref={scrollRef}>
          <div className="max-w-4xl mx-auto space-y-10 pb-10">
            {messages.map((message, i) => {
              const fragments = message.content.split(/\n\n+/).filter(f => f.trim().length > 0);
              return (
                <div key={i} className={cn(
                  "flex gap-4 group/msg",
                  message.role === "user" ? "flex-row-reverse" : "flex-row"
                )}>
                  {/* Avatar only on the first fragment equivalent */}
                  <div className={cn(
                    "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border shadow-md transition-transform group-hover/msg:scale-105",
                    message.role === "assistant" 
                      ? "bg-gradient-to-br from-accent/20 to-accent/40 border-accent/20 text-accent" 
                      : "bg-background border-border"
                  )}>
                    {message.role === "assistant" ? <Bot className="w-5 h-5" /> : <User className="w-5 h-5" />}
                  </div>

                  <div className={cn(
                    "flex flex-col gap-1.5 flex-1 max-w-[85%] lg:max-w-[80%]",
                    message.role === "user" ? "items-end" : "items-start"
                  )}>
                    {fragments.map((fragment, idx) => {
                      const isFirst = idx === 0;
                      // Strip ** symbols as requested
                      const cleanFragment = fragment.replace(/\*\*/g, "");

                      return (
                        <div
                          key={idx}
                          className={cn(
                            "p-4 px-5 rounded-[1.5rem] text-[15px] leading-relaxed shadow-sm relative border transition-all hover:shadow-md",
                            message.role === "user" 
                              ? "bg-accent/15 dark:bg-accent/20 text-[#432c18] dark:text-accent-foreground border-accent/10 rounded-tr-none" 
                              : "bg-background border-border/40 rounded-tl-none",
                            !isFirst && (message.role === "user" ? "rounded-tr-[1.5rem]" : "rounded-tl-[1.5rem]"),
                             "whitespace-pre-wrap"
                          )}
                        >
                          {cleanFragment}
                          
                          {/* Tail for first fragment */}
                          {isFirst && (
                             <div className={cn(
                                "absolute top-0 w-2 h-2",
                                message.role === "user" 
                                  ? "-right-1.5 bg-accent/15 dark:bg-accent/20 border-r border-t border-accent/10 [clip-path:polygon(0_0,0_100%,100%_0)]" 
                                  : "-left-1.5 bg-background border-l border-t border-border/40 [clip-path:polygon(0_0,100%_0,100%_100%)]",
                             )} />
                          )}

                          {/* Timestamp mock */}
                          <div className={cn(
                             "text-[10px] mt-1 text-right opacity-40",
                             message.role === "user" ? "text-accent" : "text-muted-foreground"
                          )}>
                             {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      );
                    })}

                    {/* Matched Properties after all bubbles */}
                    {message.matchedProperties && (
                      <ConsultorResultsSection results={message.matchedProperties} />
                    )}
                  </div>
                </div>
              );
            })}
            
            {isLoading && (
              <div className="flex gap-6 items-start animate-in fade-in duration-300">
                <div className="w-12 h-12 rounded-2xl bg-accent/10 border border-accent/10 flex items-center justify-center text-accent">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
                <div className="bg-background/50 border px-6 py-5 rounded-2xl rounded-tl-none pr-10">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-accent animate-pulse">Analizando cartera de propiedades...</span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <CardFooter className="p-4 md:p-8 bg-gradient-to-t from-background via-background/80 to-transparent relative z-10 border-t">
          <form 
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            className="flex items-center gap-3 w-full bg-card p-2 pl-5 pr-2 rounded-3xl border border-accent/20 shadow-2xl max-w-4xl mx-auto focus-within:ring-2 ring-accent/20 transition-all"
          >
            <Input
              placeholder={currentSessionId ? "Ajustar búsqueda o pedir detalles..." : "Describe lo que buscas (ambientes, zona, precio...)"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
              className="flex-1 bg-transparent border-0 focus-visible:ring-0 px-0 h-12"
            />
            <Button type="submit" size="icon" disabled={isLoading || !input.trim()} className="h-12 w-12 bg-accent hover:bg-accent/90 shrink-0 rounded-2xl shadow-lg">
              <Send className="w-5 h-5" />
            </Button>
          </form>
          <p className="text-[10px] text-muted-foreground/40 text-center w-full flex items-center justify-center gap-1 mt-2">
            <Sparkles className="w-3 h-3" />
            Cada respuesta consume <span className="font-semibold text-muted-foreground/60">1 crédito IA</span>
          </p>
        </CardFooter>
      </div>
      </div>
      )}
    </div>
  )
}
