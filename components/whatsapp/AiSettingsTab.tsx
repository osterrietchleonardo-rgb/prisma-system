"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { 
  Bot, 
  User, 
  Settings2, 
  Save, 
  Clock, 
  MapPin, 
  Globe, 
  Languages,
  MessageSquare,
  Sparkles,
  Search,
  ChevronRight,
  Info,
  Building2,
  Calendar,
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  Trash2
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { toast } from "sonner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface AiSettingsTabProps {
  instance: any
}

interface AiSetting {
  id?: string
  agency_id: string
  agent_id: string | null
  bot_name: string
  company_name: string
  language: string
  tone: string
  personality: string
  geographic_zone: string
  currency: string
  working_hours: string
  human_advisor_name: string
  property_types: string
  catalog_url: string
  min_anticipation_hours: number
  cancelation_deadline_hours: number
  knowledge_text?: string | null
}

export default function AiSettingsTab({ instance }: AiSettingsTabProps) {
  const [agents, setAgents] = useState<any[]>([])
  const [tokkoAgents, setTokkoAgents] = useState<any[]>([])
  const [settings, setSettings] = useState<AiSetting[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedSetting, setSelectedSetting] = useState<AiSetting | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [uploading, setUploading] = useState(false)

  const supabase = createClient()

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      // Load agency profiles (PRISMA users)
      const { data: agentsData, error: agentsError } = await supabase
        .from('profiles')
        .select('*')
        .eq('agency_id', instance.agency_id)
      
      if (agentsError) throw agentsError
      setAgents(agentsData || [])

      // Load Tokko agents
      const { data: tokkoData, error: tokkoError } = await supabase
        .from('tokko_agents')
        .select('*')
        .eq('agency_id', instance.agency_id)
      
      if (tokkoError) throw tokkoError
      setTokkoAgents(tokkoData || [])

      // Load AI settings
      const { data: settingsData, error: settingsError } = await supabase
        .from('whatsapp_ai_settings')
        .select('*')
        .eq('agency_id', instance.agency_id)
      
      if (settingsError) throw settingsError
      setSettings(settingsData || [])
    } catch (err: any) {
      toast.error("Error al cargar configuración: " + err.message)
    } finally {
      setLoading(false)
    }
  }, [supabase, instance.agency_id])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Merge PRISMA profiles and Tokko agents for display
  const combinedAgentsList = (() => {
    const list: any[] = []
    
    // Add Tokko agents as base
    tokkoAgents.forEach(ta => {
      // Find matching PRISMA profile
      const profile = agents.find(p => p.email?.toLowerCase() === ta.email?.toLowerCase())
      list.push({
        id: profile?.id || null,
        tokko_id: ta.tokko_id,
        full_name: ta.full_name,
        email: ta.email,
        avatar_url: ta.avatar_url,
        is_prisma_user: !!profile,
        source: 'Tokko'
      })
    })

    // Add PRISMA profiles that don't match any Tokko agent
    agents.forEach(p => {
      if (!tokkoAgents.some(ta => ta.email?.toLowerCase() === p.email?.toLowerCase())) {
        list.push({
          id: p.id,
          tokko_id: null,
          full_name: p.full_name,
          email: p.email,
          avatar_url: p.avatar_url,
          is_prisma_user: true,
          source: 'PRISMA'
        })
      }
    })

    return list
  })()

  const getAgentSetting = (agentId: string | null, tokkoId?: string | null) => {
    // Try to find by profile ID first
    if (agentId) {
      const s = settings.find(s => s.agent_id === agentId)
      if (s) return s
    }
    // Then try by Tokko ID
    if (tokkoId) {
      const s = settings.find(s => s.tokko_agent_id === tokkoId)
      if (s) return s
    }
    
    // Default fallback
    return {
      agency_id: instance.agency_id,
      agent_id: agentId || null,
      tokko_agent_id: tokkoId || null,
      bot_name: "Valentina",
      company_name: "",
      language: "Español rioplatense",
      tone: "Cálido, profesional y cercano",
      personality: "Empática, directa, entusiasta pero sin presionar",
      geographic_zone: "CABA y GBA Norte, Argentina",
      currency: "USD",
      working_hours: "Lunes a Sábado 9–19 h",
      human_advisor_name: "",
      property_types: "departamentos, casas, PH, locales comerciales",
      catalog_url: "",
      min_anticipation_hours: 4,
      cancelation_deadline_hours: 2,
    }
  }

  const handleEdit = (agentData: any | null) => {
    const setting = agentData === null 
      ? getAgentSetting(null) 
      : getAgentSetting(agentData.id, agentData.tokko_id)

    if (!setting.id && agentData !== null) {
      const agencyDefault = getAgentSetting(null)
      setSelectedSetting({
        ...agencyDefault,
        id: undefined,
        agent_id: agentData.id,
        tokko_agent_id: agentData.tokko_id,
        human_advisor_name: agentData.full_name || ""
      })
    } else {
      setSelectedSetting(setting)
    }
    setIsModalOpen(true)
  }

  const handleSave = async () => {
    if (!selectedSetting) return
    setSaving(true)
    try {
      const { id, ...dataToSave } = selectedSetting
      
      let error
      if (id) {
        ({ error } = await supabase
          .from('whatsapp_ai_settings')
          .update(dataToSave)
          .eq('id', id))
      } else {
        // Double check uniqueness for upsert behavior if needed, but insert is fine here
        ({ error } = await supabase
          .from('whatsapp_ai_settings')
          .insert(dataToSave))
      }

      if (error) throw error
      
      toast.success("Configuración guardada exitosamente")
      setIsModalOpen(false)
      loadData()
    } catch (err: any) {
      toast.error("Error al guardar: " + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !selectedSetting?.id) {
      if (!selectedSetting?.id) toast.error("Primero guarda la configuración antes de subir el archivo")
      return
    }

    if (!file.name.endsWith('.docx')) {
      toast.error("Solo se permiten archivos Word (.docx)")
      return
    }

    setUploading(true)
    const formData = new FormData()
    formData.append("file", file)
    formData.append("settingId", selectedSetting.id)

    try {
      const res = await fetch("/api/whatsapp/ai-settings/knowledge-upload", {
        method: "POST",
        body: formData
      })
      const data = await res.json()

      if (res.ok) {
        toast.success("Documento procesado y guardado correctamente")
        loadData()
      } else {
        throw new Error(data.error)
      }
    } catch (err: any) {
      toast.error("Error al procesar archivo: " + err.message)
    } finally {
      setUploading(false)
    }
  }

  const handleRemoveKnowledge = async () => {
    if (!selectedSetting?.id) return
    
    setUploading(true)
    try {
      const { error } = await supabase
        .from('whatsapp_ai_settings')
        .update({
          knowledge_text: null,
          knowledge_embedding: null
        })
        .eq('id', selectedSetting.id)

      if (error) throw error
      
      toast.success("Conocimiento eliminado correctamente")
      setSelectedSetting(prev => prev ? { ...prev, knowledge_text: null } : null)
      loadData()
    } catch (err: any) {
      toast.error("Error al eliminar: " + err.message)
    } finally {
      setUploading(false)
    }
  }

  const filteredAgents = combinedAgentsList.filter(a => 
    a.full_name?.toLowerCase().includes(search.toLowerCase()) || 
    a.email?.toLowerCase().includes(search.toLowerCase())
  )

  const agencySetting = getAgentSetting(null)

  return (
    <div className="flex flex-col gap-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="w-8 h-8 text-accent" />
            Configuración del Asesor IA
          </h2>
          <p className="text-muted-foreground mt-1">
            Personaliza la identidad, tono y reglas de negocio del chatbot para tus flujos de n8n.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="gap-2" onClick={loadData}>
            <Clock className="w-4 h-4" />
            Actualizar
          </Button>
          <Button className="bg-accent hover:bg-accent/90" onClick={() => handleEdit(null)}>
            <Settings2 className="w-4 h-4 mr-2" />
            Configuración Global
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Summary Card */}
        <Card className="lg:col-span-1 border-accent/10 bg-accent/5 backdrop-blur-sm shadow-xl">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-accent" />
              Estado Global
            </CardTitle>
            <CardDescription>Resumen de la configuración por defecto de la inmobiliaria.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Nombre del Bot:</span>
                <span className="font-bold text-accent">{agencySetting.bot_name}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Tono:</span>
                <Badge variant="outline" className="border-accent/20 text-accent bg-accent/5">{agencySetting.tone}</Badge>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Moneda:</span>
                <span className="font-medium">{agencySetting.currency}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Horario:</span>
                <span className="text-xs">{agencySetting.working_hours}</span>
              </div>
            </div>
            
            <div className="pt-4 border-t border-accent/10">
              <h4 className="text-xs font-bold uppercase text-muted-foreground mb-3 tracking-wider text-center">Prompt para n8n</h4>
              <div className="bg-black/80 rounded-lg p-3 text-[10px] font-mono text-green-400 overflow-hidden line-clamp-6 opacity-80">
                # ZONA DE CONFIGURACIÓN<br/>
                NOMBRE_INMOBILIARIA = "{agencySetting.company_name}"<br/>
                NOMBRE_AGENTE_IA = "{agencySetting.bot_name}"<br/>
                TONO = "{agencySetting.tone}"<br/>
                ZONA = "{agencySetting.geographic_zone}"
              </div>
              <p className="text-[10px] text-center text-muted-foreground mt-2 italic">
                Usa el nodo Postgres de n8n para inyectar estos valores dinámicamente.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Advisors Table */}
        <Card className="lg:col-span-2 border-accent/10 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-lg">Configuración por Asesor</CardTitle>
              <CardDescription>Personaliza el bot para cada miembro del equipo.</CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar asesor..."
                className="pl-9 h-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-accent/10">
                    <TableHead className="w-[200px]">Asesor</TableHead>
                    <TableHead>Bot Name</TableHead>
                    <TableHead>Identidad</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="bg-accent/5 font-medium border-accent/20">
                    <TableCell className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-white">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-bold">Global / Por Defecto</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Inmobiliaria</p>
                      </div>
                    </TableCell>
                    <TableCell>{agencySetting.bot_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-background text-[10px]">{agencySetting.personality.substring(0, 20)}...</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" className="text-accent hover:text-accent hover:bg-accent/10" onClick={() => handleEdit(null)}>
                        Configurar
                      </Button>
                    </TableCell>
                  </TableRow>
                  {filteredAgents.map((agent) => {
                    const agentSetting = getAgentSetting(agent.id, agent.tokko_id)
                    const hasCustomSetting = !!agentSetting.id
                    return (
                      <TableRow key={agent.id || agent.tokko_id} className="group border-accent/5">
                        <TableCell className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={agent.avatar_url} />
                            <AvatarFallback className="text-[10px]">{agent.full_name?.substring(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium">{agent.full_name}</p>
                              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-muted/30">
                                {agent.source}
                              </Badge>
                            </div>
                            <p className="text-[10px] text-muted-foreground">{agent.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {hasCustomSetting ? <span className="text-accent font-medium">{agentSetting.bot_name}</span> : <span className="text-muted-foreground italic text-xs">Global</span>}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                             <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                               <Sparkles className="w-3 h-3" /> {agentSetting.tone}
                             </div>
                             <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono italic">
                               <User className="w-3 h-3" /> Asesor: {agentSetting.human_advisor_name || agent.full_name}
                             </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" className="group-hover:bg-accent/5 group-hover:text-accent transition-all" onClick={() => handleEdit(agent)}>
                            {hasCustomSetting ? "Editar" : "Personalizar"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Settings2 className="w-6 h-6 text-accent" />
              Configuración de {selectedSetting?.agent_id ? "Asesor Individual" : "General Inmobiliaria"}
            </DialogTitle>
            <DialogDescription>
              Completa todos los detalles para que la IA tenga el contexto correcto en WhatsApp.
            </DialogDescription>
          </DialogHeader>

          {selectedSetting && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 py-4 px-1">
              {/* Identity Section */}
              <div className="space-y-4">
                <h3 className="font-bold text-base flex items-center gap-2 border-b pb-2">
                  <Bot className="w-4 h-4 text-accent" /> Identidad del Bot
                </h3>
                
                <div className="grid gap-2">
                  <Label htmlFor="bot_name">Nombre del Agente IA</Label>
                  <Input 
                    id="bot_name" 
                    value={selectedSetting.bot_name} 
                    onChange={e => setSelectedSetting({...selectedSetting, bot_name: e.target.value})}
                    placeholder="Ej: Valentina" 
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="company_name">Nombre de la Inmobiliaria</Label>
                  <Input 
                    id="company_name" 
                    value={selectedSetting.company_name} 
                    onChange={e => setSelectedSetting({...selectedSetting, company_name: e.target.value})}
                    placeholder="Ej: PropMax Realty" 
                  />
                </div>


                <div className="grid gap-2">
                  <Label htmlFor="language">Idioma / Dialecto</Label>
                  <Input 
                    id="language" 
                    value={selectedSetting.language} 
                    onChange={e => setSelectedSetting({...selectedSetting, language: e.target.value})}
                    placeholder="Ej: Español rioplatense" 
                  />
                </div>

                {/* Knowledge Base Section */}
                <div className="pt-4 mt-4 border-t border-accent/10">
                   <h3 className="font-bold text-sm flex items-center gap-2 mb-4 text-accent">
                    <FileText className="w-4 h-4" /> Base de Conocimiento (RAG)
                  </h3>
                  
                  <div className="bg-card/50 border border-dashed border-accent/20 rounded-xl p-6 text-center space-y-4">
                    {selectedSetting.id ? (
                      <>
                        <div className="flex flex-col items-center gap-2">
                          {selectedSetting.knowledge_text ? (
                            <div className="flex items-center gap-2 text-green-500 font-medium text-sm">
                              <CheckCircle2 className="w-4 h-4" /> Conocimiento cargado
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-muted-foreground text-sm">
                              <XCircle className="w-4 h-4" /> Sin información extra
                            </div>
                          )}
                          <p className="text-[10px] text-muted-foreground px-4">
                            Sube un archivo Word con la historia, servicios y procesos de la inmobiliaria para que el bot sea experto.
                          </p>
                        </div>
                        
                        <div className="relative">
                          <input
                            type="file"
                            id="docx-upload"
                            className="hidden"
                            accept=".docx"
                            onChange={handleFileUpload}
                            disabled={uploading}
                          />
                          <Button 
                            variant="outline" 
                            className="bg-background/50 gap-2 w-full"
                            asChild
                            disabled={uploading}
                          >
                            <label htmlFor="docx-upload">
                              {uploading ? (
                                <Loader2 className="w-4 h-4 animate-spin text-accent" />
                              ) : (
                                <FileText className="w-4 h-4 text-accent" />
                              )}
                              {uploading ? "Procesando..." : (selectedSetting.knowledge_text ? "Cambiar Documento" : "Subir Word (.docx)")}
                            </label>
                          </Button>
                          
                          {selectedSetting.knowledge_text && !uploading && (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 gap-2 mt-2"
                              onClick={handleRemoveKnowledge}
                            >
                              <Trash2 className="w-3 h-3" />
                              Eliminar conocimiento actual
                            </Button>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">
                        Guarda la configuración básica primero para habilitar la base de conocimiento.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Personality Section */}
              <div className="space-y-4">
                <h3 className="font-bold text-base flex items-center gap-2 border-b pb-2">
                  < Sparkles className="w-4 h-4 text-accent" /> Personalidad y Tono
                </h3>
                
                <div className="grid gap-2">
                  <Label htmlFor="tone">Tono de Comunicación</Label>
                  <Input 
                    id="tone" 
                    value={selectedSetting.tone} 
                    onChange={e => setSelectedSetting({...selectedSetting, tone: e.target.value})}
                    placeholder="Ej: Cálido, profesional y cercano" 
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="personality">Personalidad Detallada</Label>
                  <Textarea 
                    id="personality" 
                    className="min-h-[100px]"
                    value={selectedSetting.personality} 
                    onChange={e => setSelectedSetting({...selectedSetting, personality: e.target.value})}
                    placeholder="Describe cómo actúa la IA..." 
                  />
                </div>
              </div>

              {/* Business Rules Section */}
              <div className="space-y-4">
                <h3 className="font-bold text-base flex items-center gap-2 border-b pb-2">
                  <Calendar className="w-4 h-4 text-accent" /> Reglas de Negocio
                </h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="currency">Moneda</Label>
                    <Input 
                      id="currency" 
                      value={selectedSetting.currency} 
                      onChange={e => setSelectedSetting({...selectedSetting, currency: e.target.value})}
                      placeholder="Ej: USD" 
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="geographic_zone">Zona Geográfica</Label>
                    <Input 
                      id="geographic_zone" 
                      value={selectedSetting.geographic_zone} 
                      onChange={e => setSelectedSetting({...selectedSetting, geographic_zone: e.target.value})}
                      placeholder="Ej: CABA y GBA Norte" 
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="working_hours">Horarios de Atención</Label>
                  <Input 
                    id="working_hours" 
                    value={selectedSetting.working_hours} 
                    onChange={e => setSelectedSetting({...selectedSetting, working_hours: e.target.value})}
                    placeholder="Ej: Lunes a Sábado 9–19 h" 
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="min_anticip">Anticipación Visita (hs)</Label>
                    <Input 
                      id="min_anticip" 
                      type="number"
                      value={selectedSetting.min_anticipation_hours} 
                      onChange={e => setSelectedSetting({...selectedSetting, min_anticipation_hours: parseInt(e.target.value) || 0})}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="cancel_deadline">Plazo Cancelación (hs)</Label>
                    <Input 
                      id="cancel_deadline" 
                      type="number"
                      value={selectedSetting.cancelation_deadline_hours} 
                      onChange={e => setSelectedSetting({...selectedSetting, cancelation_deadline_hours: parseInt(e.target.value) || 0})}
                    />
                  </div>
                </div>
              </div>

              {/* Property Section */}
              <div className="space-y-4">
                <h3 className="font-bold text-base flex items-center gap-2 border-b pb-2">
                  <Building2 className="w-4 h-4 text-accent" /> Catálogo y Propiedades
                </h3>
                
                <div className="grid gap-2">
                  <Label htmlFor="prop_types">Tipos de Propiedad</Label>
                  <Textarea 
                    id="prop_types" 
                    value={selectedSetting.property_types} 
                    onChange={e => setSelectedSetting({...selectedSetting, property_types: e.target.value})}
                    placeholder="Ej: departamentos, casas, locales..." 
                  />
                </div>

                
                <div className="mt-4 p-4 bg-accent/5 rounded-xl border border-accent/10 flex items-start gap-3">
                  <Info className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Estas variables se inyectarán en el prompt dinámicamente cuando n8n consulte la tabla 
                    <code className="bg-accent/10 px-1 rounded mx-1 font-bold">whatsapp_ai_settings</code> 
                    usando el ID del asesor asignado o el agency_id por defecto.
                  </p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="border-t pt-6">
            <Button variant="outline" onClick={() => setIsModalOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button className="bg-accent hover:bg-accent/90 min-w-[120px]" onClick={handleSave} disabled={saving}>
              {saving ? <Sparkles className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              {selectedSetting?.id ? "Guardar Cambios" : "Crear Configuración"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
