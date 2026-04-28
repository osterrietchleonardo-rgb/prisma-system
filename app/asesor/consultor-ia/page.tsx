"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Send, Bot, User, Loader2, History, Plus, MessageSquare, Pencil, Trash2, MapPin, BedDouble, Bath, Maximize, ChevronLeft, ChevronRight, ExternalLink, Sparkles, Check, X, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase"
import { toast } from "sonner"

interface Property {
  id: string
  title: string
  address: string
  price: number
  currency: string
  property_type: string
  status: string
  bedrooms: number
  bathrooms: number
  total_area: number
  images: string[]
  assigned_agent?: {
    name: string
    email: string
    avatar_url?: string
  }
  similarity: number
}

interface Message {
  role: "user" | "assistant"
  content: string
  matchedProperties?: Property[]
}

interface Session {
  id: string
  title: string
  summary: string
  created_at: string
}

export default function AdvisorConsultorIAPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "¡Hola! Soy tu Consultor IA. Estoy listo para ayudarte a encontrar la propiedad ideal en tu cartera. ¿Qué estás buscando hoy?"
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
  const [userEmail, setUserEmail] = useState<string>("")
  const [deletingId, setDeletingId] = useState<string | null>(null)
  
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
          setUserEmail(user.email || "")
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
      content: "¡Hola! Soy tu Consultor IA. Estoy listo para ayudarte a encontrar la propiedad ideal en tu cartera. ¿Qué estás buscando hoy?"
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
      }
    } catch (e) {
      console.error("Error deleting:", e)
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
          history: messages.slice(-5)
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

      fetchSessions()
    } catch (error) {
      console.error("Error:", error)
      toast.error("Error al consultar propiedades.")
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
    <div className="flex h-full overflow-hidden bg-background">
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
          <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(false)} className="md:hidden">
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
                <div className="absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                    {deletingId === s.id ? (
                      <div className="flex gap-1 animate-in zoom-in-95 duration-200">
                        <Button 
                          size="icon" 
                          className="h-7 w-7 bg-destructive hover:bg-destructive/90 text-white rounded-md"
                          onClick={(e) => handleDelete(s.id, e)}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </Button>
                        <Button 
                          variant="secondary"
                          size="icon" 
                          className="h-7 w-7 text-muted-foreground hover:bg-muted rounded-md"
                          onClick={(e) => { e.stopPropagation(); setDeletingId(null); }}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6 text-muted-foreground hover:text-accent"
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            setRenamingId(s.id); 
                            setRenamingTitle(s.title); 
                            setDeletingId(null);
                          }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); setDeletingId(s.id); }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </aside>
      
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
              <h1 className="text-xl font-bold tracking-tight">Consultor IA</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Buscador Inteligente de Propiedades</span>
              </div>
            </div>
          </div>
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
                          
                          {isFirst && (
                             <div className={cn(
                                "absolute top-0 w-2 h-2",
                                message.role === "user" 
                                  ? "-right-1.5 bg-accent/15 dark:bg-accent/20 border-r border-t border-accent/10 [clip-path:polygon(0_0,0_100%,100%_0)]" 
                                  : "-left-1.5 bg-background border-l border-t border-border/40 [clip-path:polygon(0_0,100%_0,100%_100%)]",
                             )} />
                          )}

                          <div className={cn(
                             "text-[10px] mt-1 text-right opacity-40",
                             message.role === "user" ? "text-accent" : "text-muted-foreground"
                          )}>
                             {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      );
                    })}

                    {message.matchedProperties && message.matchedProperties.length > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full animate-in fade-in slide-in-from-top-4 duration-700 mt-4">
                        {message.matchedProperties.map((prop) => {
                          const currentImgIdx = activeImageIndices[prop.id] || 0;
                          const images = prop.images && prop.images.length > 0 ? prop.images : ['https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&q=80&w=400'];
                          const isOwn = prop.assigned_agent?.email === userEmail;
                          const agentName = prop.assigned_agent?.name || prop.assigned_agent?.email || "Sin asignar";
                          
                          return (
                            <Card key={prop.id} className="overflow-hidden border-accent/10 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm group hover:border-accent/30 transition-all shadow-lg hover:shadow-xl relative">
                              {/* Agent Badge - New Vistoso Title */}
                              <div className={cn(
                                "absolute top-0 left-0 right-0 z-20 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-center shadow-md",
                                isOwn ? "bg-accent text-accent-foreground" : "bg-zinc-800 text-zinc-300"
                              )}>
                                {isOwn ? "✨ Propiedad Propia" : `📍 Agente: ${agentName}`}
                              </div>

                              <div className="relative aspect-video overflow-hidden mt-6">
                                <img src={images[currentImgIdx]} alt={prop.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                                
                                <div className="absolute top-2 right-2 flex gap-1">
                                  <Badge className="bg-black/60 text-[8px] uppercase">{prop.status}</Badge>
                                  <Badge className="bg-accent text-[8px] uppercase">{prop.property_type}</Badge>
                                </div>

                                {images.length > 1 && (
                                  <>
                                    <button onClick={(e) => { e.stopPropagation(); prevImage(prop.id, images.length); }} className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 backdrop-blur-md flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/50">
                                      <ChevronLeft className="w-4 h-4" />
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); nextImage(prop.id, images.length); }} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 backdrop-blur-md flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/50">
                                      <ChevronRight className="w-4 h-4" />
                                    </button>
                                  </>
                                )}
                              </div>
                              
                              <CardHeader className="p-4 pb-2">
                                <div className="flex justify-between items-start">
                                  <h4 className="font-bold text-sm line-clamp-1 flex-1">{prop.title}</h4>
                                  <span className="text-accent font-bold text-sm whitespace-nowrap ml-2">{prop.currency} {new Intl.NumberFormat().format(prop.price)}</span>
                                </div>
                                <div className="flex items-center text-[10px] text-muted-foreground gap-1 mt-1">
                                  <MapPin className="h-3 w-3" /> {prop.address}
                                </div>
                              </CardHeader>
                              
                              <CardContent className="p-4 pt-2 pb-2 flex items-center justify-between text-[11px] font-medium text-muted-foreground border-b border-border/10">
                                <div className="flex items-center gap-1"><BedDouble className="w-3 h-3 text-accent" /> {prop.bedrooms} Dorm.</div>
                                <div className="flex items-center gap-1"><Bath className="w-3 h-3 text-accent" /> {prop.bathrooms} Baños</div>
                                <div className="flex items-center gap-1"><Maximize className="w-3 h-3 text-accent" /> {prop.total_area}m²</div>
                              </CardContent>
                              
                              <CardFooter className="p-3 bg-muted/5 transition-colors group-hover:bg-accent/5">
                                <Button variant="ghost" className="w-full text-xs gap-2 h-8 group-hover:text-accent" asChild>
                                  <a href={`/asesor/propiedades/${prop.id}`} target="_blank">
                                    Ver Ficha Completa <ExternalLink className="w-3 h-3" />
                                  </a>
                                </Button>
                              </CardFooter>
                            </Card>
                          )
                        })}
                      </div>
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
        </CardFooter>
      </div>
    </div>
  )
}
