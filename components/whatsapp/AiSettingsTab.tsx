"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { 
  Bot, 
  Settings2, 
  Save,
  Clock, 
  Globe, 
  Sparkles,
  Info,
  Building2,
  Calendar,
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  Trash2,
  AlertTriangle
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
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { removeInstance } from "@/app/actions/whatsapp"

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
  property_types: string
  min_anticipation_hours: number
  cancelation_deadline_hours: number
  knowledge_text?: string | null
}

export default function AiSettingsTab({ instance }: AiSettingsTabProps) {
  const [settings, setSettings] = useState<AiSetting[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedSetting, setSelectedSetting] = useState<AiSetting | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)

  const supabase = createClient()
  const router = useRouter()

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      // Load only the global AI settings (agent_id is null)
      const { data: settingsData, error: settingsError } = await supabase
        .from('whatsapp_ai_settings')
        .select('*')
        .eq('agency_id', instance.agency_id)
        .is('agent_id', null)
        .maybeSingle()
      
      if (settingsError) throw settingsError
      
      if (settingsData) {
        setSettings([settingsData])
      } else {
        // If not found, insert the global default configuration automatically
        const defaultSettings = {
          agency_id: instance.agency_id,
          bot_name: "Valentina",
          company_name: "",
          language: "Español rioplatense",
          tone: "Cálido, profesional y cercano",
          personality: "Empática, directa, entusiasta pero sin presionar",
          geographic_zone: "CABA y GBA Norte, Argentina",
          currency: "USD",
          working_hours: "Lunes a Sábado 9–19 h",
          property_types: "departamentos, casas, PH, locales comerciales",
          min_anticipation_hours: 4,
          cancelation_deadline_hours: 2,
        }

        const { data: newSettings, error: insertError } = await supabase
          .from('whatsapp_ai_settings')
          .insert(defaultSettings)
          .select()
          .single()

        if (insertError) {
          console.error("Error creating default settings:", insertError)
          // Fallback to local state if insert fails
          setSettings([{ ...defaultSettings, agent_id: null } as AiSetting])
        } else {
          setSettings([newSettings])
        }
      }
    } catch (err: any) {
      toast.error("Error al cargar configuración: " + err.message)
    } finally {
      setLoading(false)
    }
  }, [supabase, instance.agency_id])

  useEffect(() => {
    loadData()
  }, [loadData])

  const agencySetting = settings[0] || {
    agency_id: instance.agency_id,
    agent_id: null,
    tokko_agent_id: null,
    bot_name: "Valentina",
    company_name: "",
    language: "Español rioplatense",
    tone: "Cálido, profesional y cercano",
    personality: "Empática, directa, entusiasta pero sin presionar",
    geographic_zone: "CABA y GBA Norte, Argentina",
    currency: "USD",
    working_hours: "Lunes a Sábado 9–19 h",
    property_types: "departamentos, casas, PH, locales comerciales",
    min_anticipation_hours: 4,
    cancelation_deadline_hours: 2,
  }

  const handleEdit = () => {
    setSelectedSetting(agencySetting)
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
        // Update the local state of the selected setting to show the changes immediately
        setSelectedSetting(prev => prev ? { ...prev, knowledge_text: "Cargado" } : null)
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

  const handleRemoveInstance = async () => {
    if (!confirm("¿Estás seguro/a de que quieres desconectar este número? Se borrarán las credenciales y el estado de conexión de WhatsApp (tu instancia en Evolution API), pero se conservarán los historiales de chat guardados en la base de datos. Todo dejará de funcionar temporalmente.")) return

    setIsRemoving(true)
    const result = await removeInstance()
    setIsRemoving(false)

    if (result.success) {
      toast.success("Número desconectado correctamente")
      router.refresh()
    } else {
      toast.error(result.error || "Error al desconectar")
    }
  }



  if (loading) {
    return (
      <div className="space-y-6 p-4">
        <div className="flex items-center gap-4 border-b pb-6">
          <Skeleton className="h-12 w-12 rounded-2xl" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <Card className="border-accent/10">
          <CardHeader className="p-6">
            <Skeleton className="h-[100px] w-full rounded-2xl" />
          </CardHeader>
          <CardContent className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }

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

      <div className="grid grid-cols-1 gap-8">
        {/* Main Configuration Card */}
        <Card className="border-accent/10 shadow-xl overflow-hidden">
          <div className="bg-accent/5 border-b border-accent/10 p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-accent/20 flex items-center justify-center text-accent shadow-inner">
                  <Bot className="w-10 h-10" />
                </div>
                <div>
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    {agencySetting.bot_name || "Valentina"}
                    <Badge className="bg-accent/20 text-accent border-none text-[10px] uppercase tracking-wider">Bot Oficial</Badge>
                  </h3>
                  <p className="text-muted-foreground text-sm flex items-center gap-2 mt-1">
                    <Building2 className="w-4 h-4" />
                    Configuración única para toda la inmobiliaria
                  </p>
                </div>
              </div>
              <Button 
                size="lg" 
                className="bg-accent hover:bg-accent/90 shadow-lg shadow-accent/20 gap-2 px-8" 
                onClick={() => handleEdit(null)}
              >
                <Settings2 className="w-5 h-5" />
                Configurar Identidad y Reglas
              </Button>
            </div>
          </div>

          <CardContent className="p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-accent font-semibold text-sm uppercase tracking-wider">
                  <Sparkles className="w-4 h-4" />
                  Personalidad
                </div>
                <div className="space-y-3">
                  <div>
                    <Label className="text-[10px] text-muted-foreground uppercase">Tono</Label>
                    <p className="text-sm font-medium">{agencySetting.tone}</p>
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground uppercase">Identidad</Label>
                    <p className="text-sm text-muted-foreground line-clamp-3 italic">"{agencySetting.personality}"</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 text-accent font-semibold text-sm uppercase tracking-wider">
                  <Calendar className="w-4 h-4" />
                  Operación
                </div>
                <div className="space-y-3">
                  <div>
                    <Label className="text-[10px] text-muted-foreground uppercase">Horarios</Label>
                    <p className="text-sm font-medium">{agencySetting.working_hours}</p>
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground uppercase">Zona</Label>
                    <p className="text-sm font-medium">{agencySetting.geographic_zone}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 text-accent font-semibold text-sm uppercase tracking-wider">
                  <Globe className="w-4 h-4" />
                  Negocio
                </div>
                <div className="space-y-3">
                  <div>
                    <Label className="text-[10px] text-muted-foreground uppercase">Moneda</Label>
                    <p className="text-sm font-medium font-mono">{agencySetting.currency}</p>
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground uppercase">Tipos de Propiedad</Label>
                    <p className="text-sm font-medium">{agencySetting.property_types}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 text-accent font-semibold text-sm uppercase tracking-wider">
                  <FileText className="w-4 h-4" />
                  Conocimiento
                </div>
                <div className="bg-accent/5 rounded-xl p-4 border border-accent/10">
                  {agencySetting.knowledge_text ? (
                    <div className="flex items-center gap-2 text-green-500 font-medium text-sm">
                      <CheckCircle2 className="w-4 h-4" /> 
                      <span>Cargado (RAG Activo)</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm italic">
                      <Info className="w-4 h-4" />
                      <span>Sin base de datos</span>
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-2 leading-tight">
                    El bot utiliza esta información para responder preguntas específicas sobre la empresa.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-10 pt-8 border-t border-accent/5">
              <div className="flex items-start gap-4 p-4 bg-blue-500/5 rounded-2xl border border-blue-500/10 max-w-2xl">
                <Info className="w-6 h-6 text-blue-400 shrink-0 mt-1" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-blue-200">Consistencia de Marca Garantizada</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Esta configuración se aplica automáticamente a todos los asesores (Tokko y PRISMA). No es necesario configurar uno por uno. 
                    Cualquier cambio realizado aquí se reflejará instantáneamente en todas las conversaciones de WhatsApp.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Danger Zone */}
      <div className="mt-12">
        <div className="flex flex-col gap-2 mb-4">
          <h2 className="text-xl font-bold flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-6 h-6" />
            Zona Peligrosa
          </h2>
          <p className="text-muted-foreground text-sm">
            Estas acciones son destructivas y afectarán el funcionamiento operativo de la inmobiliaria en WhatsApp.
          </p>
        </div>
        <Card className="border-destructive/20 bg-destructive/5">
          <CardContent className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1">
              <h3 className="font-bold text-destructive">Desconectar Número de WhatsApp</h3>
              <p className="text-sm text-muted-foreground">
                Elimina la instancia de conexión y desconecta el número del sistema. 
                Se conservará todo el historial de conversaciones y leads, pero los bots dejarán de responder hasta que se vuelva a vincular.
              </p>
            </div>
            <Button 
              variant="destructive" 
              onClick={handleRemoveInstance} 
              disabled={isRemoving}
              className="whitespace-nowrap"
            >
              {isRemoving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Desconectar Número
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Edit Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Settings2 className="w-6 h-6 text-accent" />
              Configuración Global del Chatbot
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
