"use client"

import * as React from "react"
import { Send, User, Bot, Loader2, Mic } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

export interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  createdAt?: Date
}

interface ChatInterfaceProps {
  messages: Message[]
  input: string
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  isLoading: boolean
  placeholder?: string
  agentName?: string
  agentAvatar?: string
  userAvatar?: string
  actionButton?: React.ReactNode
}

export function ChatInterface({
  messages,
  input,
  handleInputChange,
  handleSubmit,
  isLoading,
  placeholder = "Escribe un mensaje...",
  agentName = "Asistente IA",
  agentAvatar,
  userAvatar,
  actionButton,
}: ChatInterfaceProps) {
  const messagesEndRef = React.useRef<HTMLDivElement>(null)
  const formRef = React.useRef<HTMLFormElement>(null)

  // Scroll to bottom on new messages
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Handle Enter to submit (Shift+Enter for newline)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      formRef.current?.requestSubmit()
    }
  }

  return (
    <div className="flex flex-col h-full bg-card/30 border border-accent/10 rounded-2xl overflow-hidden backdrop-blur-md relative shadow-2xl">
      {/* WhatsApp-like background pattern */}
      <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] transition-opacity" />
      <div className="flex items-center justify-between p-4 border-b border-accent/10 bg-background/50">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 border border-accent/20">
            <AvatarImage src={agentAvatar} />
            <AvatarFallback className="bg-accent/10 text-accent">
              <Bot className="h-5 w-5" />
            </AvatarFallback>
          </Avatar>
          <div>
            <h3 className="text-sm font-semibold">{agentName}</h3>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              En línea
            </p>
          </div>
        </div>
        {actionButton && <div>{actionButton}</div>}
      </div>

      <ScrollArea className="flex-1 p-4 md:p-6">
        <div className="space-y-6 pb-2">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-3 mt-20 opacity-50">
              <div className="h-16 w-16 bg-accent/10 rounded-full flex items-center justify-center text-accent">
                <Bot className="h-8 w-8" />
              </div>
              <div>
                <p className="font-medium text-foreground">¿En qué puedo ayudarte hoy?</p>
                <p className="text-sm text-muted-foreground">Escribe tu consulta abajo para comenzar.</p>
              </div>
            </div>
          ) : (
            messages.map((message) => {
              const fragments = message.content.split(/\n\n+/).filter(f => f.trim().length > 0);
              
              return (
                <div key={message.id} className="flex flex-col space-y-1">
                  {fragments.map((fragment, idx) => {
                    const isFirst = idx === 0;
                    const isLast = idx === fragments.length - 1;
                    
                    return (
                      <div
                        key={`${message.id}-${idx}`}
                        className={cn(
                          "flex gap-3 max-w-[85%] group/message transition-all duration-200",
                          message.role === "user" ? "ml-auto flex-row-reverse" : ""
                        )}
                      >
                        {/* Avatar only on the first fragment of a group */}
                        <Avatar className={cn(
                          "h-8 w-8 shrink-0 border border-accent/10 mt-1 opacity-100 transition-opacity",
                          !isFirst && "opacity-0 h-0 w-0 pointer-events-none md:h-8 md:w-8 md:opacity-0"
                        )}>
                          {message.role === "user" ? (
                            <>
                              <AvatarImage src={userAvatar} />
                              <AvatarFallback className="bg-primary/10 text-primary">
                                <User className="h-4 w-4" />
                              </AvatarFallback>
                            </>
                          ) : (
                            <>
                              <AvatarImage src={agentAvatar} />
                              <AvatarFallback className="bg-accent/10 text-accent">
                                <Bot className="h-4 w-4" />
                              </AvatarFallback>
                            </>
                          )}
                        </Avatar>
                        
                        <div
                          className={cn(
                            "relative rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap shadow-sm transition-all hover:shadow-md",
                            message.role === "user"
                              ? "bg-accent/15 dark:bg-accent/20 text-[#432c18] dark:text-accent-foreground rounded-tr-none border border-accent/10"
                              : "bg-white dark:bg-zinc-900 text-[#303030] dark:text-zinc-100 rounded-tl-none border border-border/40",
                            !isFirst && (message.role === "user" ? "rounded-tr-2xl" : "rounded-tl-2xl"),
                            message.role === "user" ? "ml-12" : "mr-12",
                            // Add minor bottom margin between messages belonging to different batches
                            isLast ? "mb-4" : "mb-0.5"
                          )}
                        >
                          {fragment.replace(/\*\*/g, "")}
                          
                          {/* Mock timestamp */}
                          <div className={cn(
                             "text-[10px] mt-1 text-right opacity-50 select-none",
                             message.role === "user" ? "text-accent/70 dark:text-accent-foreground/50" : "text-zinc-500"
                          )}>
                             {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                          
                          {/* Tail for first fragment of a role */}
                          {isFirst && (
                            <div className={cn(
                              "absolute top-0 w-2 h-2",
                              message.role === "user" 
                                ? "-right-1.5 bg-accent/15 dark:bg-accent/20 border-r border-t border-accent/10 [clip-path:polygon(0_0,0_100%,100%_0)]" 
                                : "-left-1.5 bg-white dark:bg-zinc-900 border-l border-t border-border/40 [clip-path:polygon(0_0,100%_0,100%_100%)]",
                              message.role === "assistant" && "dark:border-zinc-800"
                            )} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
          {isLoading && (
            <div className="flex gap-3 max-w-[85%]">
              <Avatar className="h-8 w-8 shrink-0 border border-accent/10 mt-1">
                 <AvatarFallback className="bg-accent/10 text-accent">
                   <Bot className="h-4 w-4" />
                 </AvatarFallback>
              </Avatar>
              <div className="rounded-2xl rounded-tl-none px-4 py-3 bg-muted/50 border border-border/50 flex items-center gap-2">
                 <span className="flex gap-1">
                   <span className="h-1.5 w-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: "0ms" }}></span>
                   <span className="h-1.5 w-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: "150ms" }}></span>
                   <span className="h-1.5 w-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: "300ms" }}></span>
                 </span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      <div className="p-4 border-t border-accent/10 bg-background/50">
        <form
          ref={formRef}
          onSubmit={(e) => {
            e.preventDefault()
            if (input.trim() && !isLoading) {
              handleSubmit(e)
            }
          }}
          className="relative flex items-end gap-2"
        >
          <div className="relative flex-1 bg-background rounded-xl border focus-within:ring-1 focus-within:ring-accent/50 focus-within:border-accent shadow-sm overflow-hidden transition-all">
            <Textarea
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="min-h-[52px] max-h-[200px] w-full resize-none border-0 focus-visible:ring-0 p-3.5 pb-3 bg-transparent md:text-sm"
              rows={1}
              disabled={isLoading}
            />
            <div className="absolute right-2 bottom-2 flex items-center gap-1 group">
               <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-full" disabled={isLoading}>
                 <Mic className="h-4 w-4" />
               </Button>
            </div>
          </div>
          <Button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="h-[52px] w-[52px] shrink-0 rounded-xl bg-accent hover:bg-accent/90 focus-visible:ring-accent transition-all shadow-sm flex items-center justify-center p-0"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-accent-foreground" />
            ) : (
              <Send className="h-5 w-5 text-accent-foreground" />
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}
