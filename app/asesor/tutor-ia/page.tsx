"use client"

import { useState, useEffect } from "react"
import { ChatInterface, Message } from "@/components/chat-interface"
import { createClient } from "@/lib/supabase"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { GraduationCap } from "lucide-react"

export default function TutorIAPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [agencyId, setAgencyId] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    async function getUserAndAgency() {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user?.id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("agency_id")
          .eq("id", session.user.id)
          .single()
        
        if (profile?.agency_id) {
          setAgencyId(profile.agency_id)
        }
      }
    }
    getUserAndAgency()
  }, [])

  const handleSubmit = async (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault()
    if (!input.trim()) return

    const userMessage = input.trim()
    const newMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: userMessage,
    }
    
    // We keep a local history to send to the API
    const currentHistory = messages.map(m => ({ role: m.role, content: m.content }))
    
    setMessages(prev => [...prev, newMessage])
    setInput("")
    setIsLoading(true)

    try {
      const response = await fetch("/api/ai/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          history: currentHistory
        }),
      })

      if (!response.ok) throw new Error(response.statusText)

      const data = await response.json()
      
      if (data.error) {
         toast.error(data.error)
         return
      }

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.reply || data.text,
      }
      setMessages(prev => [...prev, aiMessage])
      
    } catch (_error) {
      toast.error("Error al comunicarse con el Tutor IA.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleEvaluate = async () => {
     if (isLoading) return
     
     const promptMsg = "Quiero que me evalúes. Por favor haceme 3 a 5 preguntas cerradas o de opción múltiple sobre los documentos y procesos de la inmobiliaria para poner a prueba mis conocimientos."
     const newMessage: Message = {
       id: Date.now().toString(),
       role: "user",
       content: promptMsg
     }
     
     const currentHistory = messages.map(m => ({ role: m.role, content: m.content }))
     
     setMessages(prev => [...prev, newMessage])
     setIsLoading(true)
     
     try {
       const response = await fetch("/api/ai/tutor", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({
           message: promptMsg,
           history: currentHistory
         }),
       })
       
       if (!response.ok) throw new Error(response.statusText)
       
       const data = await response.json()
       
       if (data.error) {
          toast.error(data.error)
          return
       }

       const aiMessage: Message = {
         id: (Date.now() + 1).toString(),
         role: "assistant",
         content: data.reply || data.text,
       }
       setMessages(prev => [...prev, aiMessage])
     } catch (_error) {
       toast.error("Error al solicitar evaluación.")
     } finally {
       setIsLoading(false)
     }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-theme(spacing.16))] p-4 md:p-8 pt-6 space-y-4">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          Tutor IA
        </h2>
        <p className="text-muted-foreground mt-1">
          Asistente entrenado con los documentos y procesos de tu inmobiliaria.
        </p>
      </div>


      <div className="flex-1 min-h-0 relative">
        <ChatInterface 
          messages={messages}
          input={input}
          handleInputChange={(e) => setInput(e.target.value)}
          handleSubmit={handleSubmit}
          isLoading={isLoading}
          agentName="Tutor de Inmobiliaria"
          placeholder="Pregunta sobre los procesos or herramientas de la inmobiliaria..."
          actionButton={
            <Button variant="outline" size="sm" onClick={handleEvaluate} disabled={isLoading} className="gap-2">
              <GraduationCap className="h-4 w-4" />
              <span className="hidden sm:inline">Evaluar mis conocimientos</span>
            </Button>
          }
        />
      </div>
    </div>
  )
}
