"use client"

import { useState } from "react"
import { 
  Plus, 
  User, 
  MessageSquare, 
  FileText, 
  Zap
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogDescription
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase"

interface LeadModalProps {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  agents: Record<string, any>[]
  onSuccess: () => void
}

export function LeadModal({ isOpen, setIsOpen, agents, onSuccess }: LeadModalProps) {
  const [activeTab, setActiveTab] = useState("manual")
  const [loading, setLoading] = useState(false)
  const [aiAnalysis, setAiAnalysis] = useState<Record<string, any> | null>(null)
  const supabase = createClient()

  const [formData, setFormData] = useState({
    full_name: "",
    phone: "",
    email: "",
    source: "Manual",
    assigned_agent_id: "",
    notes: ""
  })

  const handleSubmitManual = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { toast.error("Sin sesión"); return }

      const { data: profile } = await supabase
        .from("profiles").select("agency_id").eq("id", session.user.id).single()

      const { error } = await supabase.from("leads").insert([{
        ...formData,
        agency_id: profile?.agency_id,
        pipeline_stage: "nuevo",
        status: "active"
      }])
      if (error) throw error
      toast.success("Lead creado correctamente")
      setIsOpen(false)
      onSuccess()
      
      // Limpiar form
      setFormData({
        full_name: "",
        phone: "",
        email: "",
        source: "Manual",
        assigned_agent_id: "",
        notes: ""
      })
      setAiAnalysis(null)
    } catch (_error) {
      toast.error("Error al crear lead")
    } finally {
      setLoading(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setLoading(true)
      const text = await file.text()
      const response = await fetch("/api/ai/analyze-chat", {
        method: "POST",
        body: JSON.stringify({ chatText: text })
      })
      const data = await response.json()
      if (response.ok) {
        setAiAnalysis(data)
        setFormData(prev => ({
          ...prev,
          full_name: data.lead_name || "",
          phone: data.phone || "",
          source: "WhatsApp IA",
          notes: data.summary
        }))
        toast.success("Análisis de IA completado")
      } else {
        toast.error(data.error || "Error al analizar chat")
      }
    } catch (_error) {
      toast.error("Error al procesar archivo")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="bg-accent hover:bg-accent/90 gap-2 shadow-lg shadow-accent/20 active:scale-95 transition-all">
          <Plus className="h-4 w-4" />
          <span>Nuevo Lead</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl bg-card border-accent/20 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <User className="h-6 w-6 text-accent" />
            Agregar Nuevo Lead
          </DialogTitle>
          <DialogDescription>
            Cargá un prospecto manualmente o analizá conversaciones con IA.
          </DialogDescription>
        </DialogHeader>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="grid w-full grid-cols-2 bg-accent/5">
            <TabsTrigger value="manual" className="data-[state=active]:bg-accent data-[state=active]:text-white">
              <FileText className="h-4 w-4 mr-2" />Manual
            </TabsTrigger>
            <TabsTrigger value="whatsapp" className="data-[state=active]:bg-accent data-[state=active]:text-white">
              <MessageSquare className="h-4 w-4 mr-2" />WhatsApp IA
            </TabsTrigger>
          </TabsList>

          <TabsContent value="manual" className="space-y-4 pt-4">
            <form onSubmit={handleSubmitManual} className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nombre Completo</Label>
                <Input placeholder="Ej: Juan Pérez" value={formData.full_name}
                  onChange={(e) => setFormData({...formData, full_name: e.target.value})} required />
              </div>
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input placeholder="+54 9 11..." value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" placeholder="juan@email.com" value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Asignar Asesor</Label>
                <Select value={formData.assigned_agent_id} onValueChange={(v) => setFormData({...formData, assigned_agent_id: v})}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar asesor" /></SelectTrigger>
                  <SelectContent>
                    {agents.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Notas Iniciales</Label>
                <textarea className="w-full min-h-[100px] rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                  placeholder="Detalles sobre el interés del lead..."
                  value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} />
              </div>
              <div className="col-span-2 flex justify-end gap-2 pt-4">
                <Button variant="outline" type="button" onClick={() => setIsOpen(false)}>Cancelar</Button>
                <Button type="submit" className="bg-accent hover:bg-accent/90" disabled={loading}>
                  {loading ? "Creando..." : "Crear Lead"}
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="whatsapp" className="space-y-4 pt-4">
            {!aiAnalysis ? (
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-accent/20 rounded-2xl p-12 bg-accent/5">
                <MessageSquare className="h-12 w-12 text-accent/40 mb-4" />
                <h3 className="text-lg font-semibold">Sube el historial del chat</h3>
                <p className="text-sm text-muted-foreground text-center max-w-xs mb-6">
                  Exporta el chat de WhatsApp como archivo .txt y súbelo para que PRISMA lo analice con IA.
                </p>
                <div className="relative">
                  <input type="file" accept=".txt" className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={handleFileUpload} disabled={loading} />
                  <Button variant="outline" className="gap-2" disabled={loading}>
                    <Plus className="h-4 w-4" />Seleccionar .txt
                  </Button>
                </div>
                {loading && (
                  <div className="mt-4 flex items-center gap-2 text-accent">
                    <Zap className="h-4 w-4 animate-pulse" />
                    <span>Analizando con Gemini AI...</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                <div className="bg-accent/5 p-4 rounded-xl border border-accent/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-accent flex items-center gap-2">
                      <Zap className="h-4 w-4" />Análisis de IA
                    </h4>
                    <Badge variant="outline" className="capitalize text-[10px]">Prioridad: {aiAnalysis.lead_attitude}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                    <div>
                      <span className="text-muted-foreground block text-[10px] uppercase font-bold">Intención</span>
                      <p>{aiAnalysis.search_intent}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[10px] uppercase font-bold">Actitud</span>
                      <p className="capitalize">{aiAnalysis.lead_attitude}</p>
                    </div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground block text-[10px] uppercase font-bold">Resumen</span>
                      <p>{aiAnalysis.summary}</p>
                    </div>
                    <div className="col-span-2 text-accent font-medium bg-accent/5 p-2 rounded-lg border border-accent/10">
                      <span className="text-[10px] uppercase font-bold block">Próximo paso:</span>
                      {aiAnalysis.next_step}
                    </div>
                  </div>
                </div>
                <form onSubmit={handleSubmitManual} className="grid grid-cols-2 gap-4 border-t border-accent/10 pt-4">
                  <div className="space-y-2">
                    <Label>Nombre Extraído</Label>
                    <Input value={formData.full_name} onChange={(e) => setFormData({...formData, full_name: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label>Teléfono Extraído</Label>
                    <Input value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label>Asignar Asesor</Label>
                    <Select value={formData.assigned_agent_id} onValueChange={(v) => setFormData({...formData, assigned_agent_id: v})}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar asesor" /></SelectTrigger>
                      <SelectContent>
                        {agents.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 flex justify-end gap-2 pt-4">
                    <Button variant="ghost" type="button" onClick={() => setAiAnalysis(null)}>Reintentar</Button>
                    <Button type="submit" className="bg-accent hover:bg-accent/90" disabled={loading}>
                      Guardar Lead Analizado
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
