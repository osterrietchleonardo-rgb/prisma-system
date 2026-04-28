"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Sparkles, Send, Bot, User, Loader2, BookOpen, Quote, ChevronRight, MessageSquare, Plus, History, BrainCircuit, Pencil, Trash2, Check, X, GraduationCap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface Message {
  role: "user" | "assistant"
  content: string
  sources?: { title: string; type: string; similarity: number }[]
}

interface Session {
  id: string
  title: string
  summary: string
  created_at: string
}

export default function AdvisorTutorIAPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "¡Hola! Soy tu Tutor IA de PRISMA. Mi conocimiento se basa en los documentos y videos de tu inmobiliaria. ¿En qué puedo ayudarte hoy?"
    }
  ])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [sessions, setSessions] = useState<Session[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renamingTitle, setRenamingTitle] = useState("")
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  
  const scrollRef = useRef<HTMLDivElement>(null)

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/tutor")
      const data = await res.json()
      if (data.sessions) setSessions(data.sessions)
    } catch (e) {
      console.error("Error fetching sessions:", e)
    }
  }, [])

  useEffect(() => {
    fetchSessions()
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
      const res = await fetch(`/api/ai/tutor?sessionId=${id}`)
      const data = await res.json()
      if (data.messages) {
        setMessages(data.messages.map((m: any) => ({
          role: m.role,
          content: m.content,
          sources: m.metadata?.sources
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
      content: "¡Hola! Soy tu Tutor IA de PRISMA. Mi conocimiento se basa en los documentos y videos de tu inmobiliaria. ¿En qué puedo ayudarte hoy?"
    }])
  }

  const handleRename = async (id: string, e: React.FormEvent) => {
    e.preventDefault()
    if (!renamingTitle.trim()) return
    try {
      const res = await fetch("/api/ai/tutor", {
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
      const res = await fetch(`/api/ai/tutor?sessionId=${id}`, { method: "DELETE" })
      if (res.ok) {
        setSessions(prev => prev.filter(s => s.id !== id))
        if (currentSessionId === id) startNewChat()
      }
    } catch (e) {
      console.error("Error deleting:", e)
    } finally {
      setDeletingId(null)
    }
  }

  const handleSend = async (customMessage?: string) => {
    const userMessage = customMessage || input.trim()
    if (!userMessage || isLoading) return

    if (!customMessage) setInput("")
    
    setMessages(prev => [...prev, { role: "user", content: userMessage }])
    setIsLoading(true)

    try {
      const response = await fetch("/api/ai/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          message: userMessage,
          history: messages.map(m => ({ 
            role: m.role, 
            content: m.content 
          })),
          sessionId: currentSessionId
        })
      })

      if (!response.ok) throw new Error("Error en el servidor")

      const data = await response.json()
      
      if (!currentSessionId && data.sessionId) {
        setCurrentSessionId(data.sessionId)
      }

      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: data.text,
        sources: data.sources 
      }])

      fetchSessions()
    } catch (error) {
      console.error("Error:", error)
      toast.error("Error al comunicarse con el Tutor IA.")
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: "Lo siento, hubo un error técnico al procesar tu consulta. Por favor, intenta de nuevo." 
      }])
    } finally {
      setIsLoading(false)
    }
  }

  const handleEvaluate = () => {
    const promptMsg = "Quiero que me evalúes. Por favor haceme 3 a 5 preguntas cerradas o de opción múltiple sobre los documentos y procesos de la inmobiliaria para poner a prueba mis conocimientos."
    handleSend(promptMsg)
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
            <span className="text-sm uppercase tracking-tighter">Historial de Chats</span>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(false)} className="md:hidden">
            <ChevronRight className="w-4 h-4 rotate-180" />
          </Button>
        </div>
        
        <div className="p-3">
          <Button 
            onClick={startNewChat}
            className="w-full justify-start gap-2 bg-accent hover:bg-accent/90 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Nueva Conversación
          </Button>
        </div>

        <ScrollArea className="flex-1 px-3 pb-4">
          <div className="space-y-2">
            {sessions.map((s) => (
              <div
                key={s.id}
                onClick={() => loadSession(s.id)}
                className={cn(
                  "w-full group relative rounded-xl transition-all border overflow-hidden cursor-pointer",
                  currentSessionId === s.id 
                    ? "bg-accent/10 border-accent/30 shadow-inner" 
                    : "hover:bg-accent/5 border-transparent"
                )}
              >
                {currentSessionId === s.id && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-accent" />
                )}
                
                <div className="p-3">
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "p-2 rounded-lg shrink-0",
                      currentSessionId === s.id ? "bg-accent/20 text-accent" : "bg-muted text-muted-foreground group-hover:text-accent group-hover:bg-accent/10"
                    )}>
                      <MessageSquare className="w-4 h-4" />
                    </div>
                    
                    <div className="flex-1 min-w-0 pr-14">
                      {renamingId === s.id ? (
                        <form onSubmit={(e) => handleRename(s.id, e)} className="flex items-center gap-1">
                          <Input 
                            autoFocus
                            value={renamingTitle}
                            onBlur={() => setRenamingId(null)}
                            onChange={(e) => setRenamingTitle(e.target.value)}
                            className="h-7 text-xs px-1 py-0 bg-background"
                          />
                        </form>
                      ) : (
                        <>
                          <p className="text-sm font-semibold truncate block w-full max-w-[150px] leading-none mb-1.5">{s.title}</p>
                          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter shrink-0">
                            {new Date(s.created_at).toLocaleDateString()}
                          </p>
                        </>
                      )}
                    </div>
                  </div>

                  {s.summary && !renamingId && (
                    <div className="mt-2 pt-2 border-t border-accent/5">
                      <p className="text-[10px] text-muted-foreground/80 line-clamp-2 italic leading-relaxed">
                        {s.summary}
                      </p>
                    </div>
                  )}

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
                            e.stopPropagation()
                            setRenamingId(s.id)
                            setRenamingTitle(s.title)
                            setDeletingId(null)
                          }}
                        >
                          <Pencil className="w-3 h-3" />
                          <span className="sr-only">Renombrar</span>
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); setDeletingId(s.id); }}
                        >
                          <Trash2 className="w-3 h-3" />
                          <span className="sr-only">Eliminar</span>
                        </Button>
                      </>
                    )}
                  </div>
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

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <header className="p-4 md:p-6 border-b bg-card/30 backdrop-blur-sm flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-2.5 bg-accent/20 rounded-2xl shadow-inner cursor-pointer" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
              <Bot className="w-6 h-6 text-accent" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Tutor IA</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                  Asesoramiento y Evaluación
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={handleEvaluate} disabled={isLoading} className="gap-2 border-accent/20 hover:bg-accent/5 text-accent">
              <GraduationCap className="h-4 w-4" />
              <span className="hidden sm:inline">Evaluar mis conocimientos</span>
            </Button>
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

                    {message.sources && message.sources.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2 animate-in fade-in slide-in-from-top-2 duration-500">
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-accent/10 text-[9px] text-accent font-bold uppercase tracking-widest">
                          <BookOpen className="w-3 h-3" /> Contexto Extraído
                        </div>
                        {message.sources.map((src, idx) => (
                          <div key={idx} className="flex items-center gap-2 px-3 py-1 bg-white dark:bg-zinc-900 border border-border/60 rounded-full text-[11px] font-medium shadow-sm transition-all hover:bg-muted">
                            <Quote className="w-3 h-3 text-accent/60" />
                            <span className="truncate max-w-[150px] md:max-w-[250px]">{src.title}</span>
                          </div>
                        ))}
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
                <div className="bg-background/50 border border-border/50 px-6 py-5 rounded-[2rem] rounded-tl-none shadow-inner">
                  <div className="flex gap-1.5 items-center text-sm font-medium text-muted-foreground italic">
                    <span className="animate-bounce delay-0">.</span>
                    <span className="animate-bounce delay-150">.</span>
                    <span className="animate-bounce delay-300">.</span>
                    <span className="ml-3 uppercase tracking-widest text-[10px] font-bold text-accent">Procesando consulta...</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <CardFooter className="p-4 md:p-8 bg-gradient-to-t from-background via-background/80 to-transparent relative z-10 border-t">
          <form 
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            className="flex items-center gap-3 w-full bg-card p-2 pl-5 pr-2 rounded-[1.5rem] border border-accent/20 focus-within:ring-4 focus-within:ring-accent/10 transition-all shadow-xl max-w-4xl mx-auto"
          >
            <Input
              placeholder={currentSessionId ? "Continúa la conversación..." : "¿Qué quieres saber sobre los procesos hoy?"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
              className="flex-1 bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-0 h-12 text-sm md:text-base placeholder:text-muted-foreground/60"
            />
            <Button 
              type="submit" 
              size="icon" 
              disabled={isLoading || !input.trim()}
              className="h-12 w-12 bg-accent hover:bg-accent/90 shrink-0 shadow-lg rounded-2xl transition-all active:scale-95 group"
            >
              <Send className="w-5 h-5 ml-0.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </Button>
          </form>
        </CardFooter>
      </div>
    </div>
  )
}
