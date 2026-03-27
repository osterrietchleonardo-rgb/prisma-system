"use client"

import { useState, useEffect } from "react"
import { ChatInterface, Message } from "@/components/chat-interface"
import { createClient } from "@/lib/supabase"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Bot, Search, Building } from "lucide-react"

interface Requirements {
  presupuesto: string
  zona: string
  habitaciones: string
  tipo: string
}

export default function ConsultorIAPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isChatActive, setIsChatActive] = useState(false)
  const [agentId, setAgentId] = useState<string | null>(null)
  
  const [reqs, setReqs] = useState<Requirements>({
    presupuesto: "",
    zona: "",
    habitaciones: "",
    tipo: ""
  })

  const supabase = createClient()

  useEffect(() => {
    async function getUser() {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user?.id) {
        setAgentId(session.user.id)
      }
    }
    getUser()
  }, [])

  const startConsultation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!agentId) return

    setIsChatActive(true)
    
    // Auto-generate first message based on requirements
    const firstMessage = `Busco propiedades para un lead con estos requerimientos:
- Presupuesto: ${reqs.presupuesto}
- Zona: ${reqs.zona}
- Dormitorios: ${reqs.habitaciones}
- Tipo: ${reqs.tipo}

Por favor, recomendame 2 o 3 propiedades de mi cartera que mejor se adapten y explicame por qué.`

    const newMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: firstMessage,
    }

    setMessages([newMessage])
    setIsLoading(true)

    try {
      const response = await fetch("/api/ai/consultor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [newMessage],
          agentId,
        }),
      })

      if (!response.ok) throw new Error(response.statusText)
      
      const data = await response.json()
      
      if (data.error) {
         toast.error(data.error)
         return
      }

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.reply
      }])
    } catch (_error) {
      toast.error("Error al iniciar la consulta.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault()
    if (!input.trim() || !agentId) return

    const newMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
    }
    setMessages(prev => [...prev, newMessage])
    setInput("")
    setIsLoading(true)

    try {
      const response = await fetch("/api/ai/consultor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, newMessage],
          agentId,
        }),
      })

      if (!response.ok) throw new Error(response.statusText)
      
      const data = await response.json()
      
      if (data.error) {
         toast.error(data.error)
         return
      }

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.reply
      }])
    } catch (_error) {
      toast.error("Error al comunicarse con el Consultor IA.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-theme(spacing.16))] p-4 md:p-8 pt-6 space-y-4">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          Consultor IA
        </h2>
        <p className="text-muted-foreground mt-1">
          Encuentra las propiedades ideales para tus clientes analizando tu cartera completa.
        </p>
      </div>

      <div className="flex-1 min-h-0 relative flex items-center justify-center">
        {!isChatActive ? (
          <Card className="w-full max-w-xl mx-auto border-accent/20 bg-card/50 backdrop-blur-md">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto bg-accent/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
                <Search className="h-6 w-6 text-accent" />
              </div>
              <CardTitle className="text-2xl">Requerimientos del Cliente</CardTitle>
              <CardDescription>
                Ingresa lo que busca tu cliente para que la IA escanee tus propiedades.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={startConsultation} className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="tipo">Tipo de Propiedad</Label>
                    <Input 
                      id="tipo" 
                      placeholder="Ej. Departamento, Casa" 
                      value={reqs.tipo}
                      onChange={e => setReqs({...reqs, tipo: e.target.value})}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="presupuesto">Presupuesto</Label>
                    <Input 
                      id="presupuesto" 
                      placeholder="Ej. USD 120.000" 
                      value={reqs.presupuesto}
                      onChange={e => setReqs({...reqs, presupuesto: e.target.value})}
                      required
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="zona">Zonas / Barrios</Label>
                    <Input 
                      id="zona" 
                      placeholder="Ej. Palermo, Belgrano" 
                      value={reqs.zona}
                      onChange={e => setReqs({...reqs, zona: e.target.value})}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="habitaciones">Dormitorios</Label>
                    <Input 
                      id="habitaciones" 
                      placeholder="Ej. 2 dormitorios" 
                      value={reqs.habitaciones}
                      onChange={e => setReqs({...reqs, habitaciones: e.target.value})}
                      required
                    />
                  </div>
                </div>

                <Button type="submit" className="w-full mt-6 bg-accent hover:bg-accent/90 gap-2 h-11" disabled={!agentId}>
                  <Bot className="h-5 w-5" />
                  Iniciar Búsqueda IA
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <div className="w-full h-full pb-4">
            <ChatInterface 
              messages={messages}
              input={input}
              handleInputChange={(e) => setInput(e.target.value)}
              handleSubmit={handleSubmit}
              isLoading={isLoading}
              agentName="Consultor Propiedades"
              placeholder="Pide buscar más opciones, ajustar el presupuesto, buscar con amenities..."
              actionButton={
                <Button variant="outline" size="sm" onClick={() => setIsChatActive(false)} className="gap-2">
                  <Search className="h-4 w-4" />
                  <span className="hidden sm:inline">Nueva Búsqueda</span>
                </Button>
              }
            />
          </div>
        )}
      </div>
    </div>
  )
}
