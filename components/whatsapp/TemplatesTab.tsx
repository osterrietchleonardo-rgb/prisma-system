"use client"

import { useState, useEffect, useDeferredValue } from "react"
import { createClient } from "@/lib/supabase/client"
import { createTemplate, syncTemplatesFromMeta, editTemplate, deleteTemplate } from "@/app/actions/whatsapp"
import type { WATemplate, TemplateCategory } from "@/types/whatsapp"
import { 
  Plus, 
  MessageSquare, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Eye, 
  Edit3, 
  Trash2,
  RefreshCw, 
  ArrowLeft,
  Loader2
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "./EmptyState"
import { toast } from "sonner"
import { Info } from "lucide-react"

interface TemplatesTabProps {
  instance: any
}

interface NewTemplate {
  id?: string
  meta_template_id?: string
  template_name: string
  category: TemplateCategory
  language: string
  header: string
  body: string
  footer: string
  buttonType: "NONE" | "QUICK_REPLY" | "URL"
  buttons: any[]
  header_examples?: string[]
  body_examples?: string[]
}

const parseVariables = (text: string) => {
  const matches = text.match(/{{(?:[1-9][0-9]*)}}/g) || [];
  return Array.from(new Set(matches));
}

export default function TemplatesTab({ instance }: TemplatesTabProps) {
  const [templates, setTemplates] = useState<WATemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [showBuilder, setShowBuilder] = useState(false)
  
  // Builder state
  const [formData, setFormData] = useState<NewTemplate>({
    id: undefined,
    meta_template_id: undefined,
    template_name: "",
    category: "MARKETING",
    language: "es_AR",
    header: "",
    body: "",
    footer: "",
    buttonType: "NONE",
    buttons: [],
    header_examples: [],
    body_examples: []
  })
  
  const deferredBody = useDeferredValue(formData.body)
  const deferredHeader = useDeferredValue(formData.header)
  const deferredFooter = useDeferredValue(formData.footer)

  const supabase = createClient()

  const loadTemplates = async () => {
    try {
      const { data } = await supabase
        .from('wa_templates')
        .select('*')
        .eq('agency_id', instance.agency_id)
        .order('created_at', { ascending: false })
      
      if (data) {
        setTemplates(data)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTemplates()
  }, [])

  const handleSync = async () => {
    setSyncing(true)
    const result = await syncTemplatesFromMeta()
    if (result.success) {
      toast.success(`Sincronización exitosa. ${result.count || 0} plantillas procesadas.`)
      if (result.messaging_limit_tier) {
        instance.messaging_limit_tier = result.messaging_limit_tier
      }
      await loadTemplates()
    } else {
      toast.error(result.error || "Error al sincronizar plantillas.")
    }
    setSyncing(false)
  }

  const formatMessagingLimit = (tier: string | null | undefined) => {
    if (!tier) return "Desconocido"
    const tiers: Record<string, string> = {
      'TIER_50': '50 / día',
      'TIER_250': '250 / día',
      'TIER_1K': '1.000 / día',
      'TIER_10K': '10.000 / día',
      'TIER_100K': '100.000 / día',
      'TIER_UNLIMITED': 'Ilimitado',
    }
    return tiers[tier] || tier
  }

  const handleNameChange = (val: string) => {
    // Si estamos editando y la plantilla ya está aprobada, podríamos advertir, pero dejaremos editar componentes
    const formatted = val.toLowerCase().replace(/[\s-]/g, '_').replace(/[^a-z0-9_]/g, '')
    setFormData(prev => ({ ...prev, template_name: formatted.substring(0, 512) }))
  }

  const handleEdit = (t: WATemplate) => {
    let header = "";
    let body = "";
    let footer = "";
    let buttonType: "NONE" | "QUICK_REPLY" | "URL" = "NONE";
    let buttons: any[] = [];
    let header_examples: string[] = [];
    let body_examples: string[] = [];

    if (t.components && Array.isArray(t.components)) {
      t.components.forEach((c: any) => {
        if (c.type === 'HEADER') {
          header = c.text || "";
          if (c.example?.header_text && Array.isArray(c.example.header_text)) {
            header_examples = c.example.header_text;
          }
        }
        if (c.type === 'BODY') {
          body = c.text || "";
          if (c.example?.body_text && Array.isArray(c.example.body_text)) {
             const bTexts = c.example.body_text[0];
             if (Array.isArray(bTexts)) body_examples = bTexts;
             else if (typeof bTexts === 'string') body_examples = [bTexts];
          }
        }
        if (c.type === 'FOOTER') footer = c.text || "";
        if (c.type === 'BUTTONS') {
           buttons = c.buttons || [];
           if (buttons.length > 0) {
             if (buttons[0].type === 'URL') buttonType = 'URL';
             else if (buttons[0].type === 'QUICK_REPLY') buttonType = 'QUICK_REPLY';
           }
        }
      });
    }

    setFormData({
      id: t.id,
      meta_template_id: t.meta_template_id || undefined,
      template_name: t.template_name,
      category: t.category || "MARKETING",
      language: t.language || "es_AR",
      header,
      body,
      footer,
      buttonType,
      buttons,
      header_examples,
      body_examples
    })
    setShowBuilder(true)
  }

  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleDelete = async (t: WATemplate) => {
    if (!confirm(`¿Estás seguro que deseas eliminar la plantilla "${t.template_name}"? Esta acción no se puede deshacer.`)) return;

    setDeletingId(t.id)
    const result = await deleteTemplate(t.id, t.template_name)
    if (result.success) {
      toast.success("Plantilla eliminada correctamente.")
      loadTemplates()
    } else {
      toast.error(result.error || "Error al eliminar la plantilla.")
    }
    setDeletingId(null)
  }

  const handleSubmit = async () => {
    if (!formData.template_name || !formData.body) return
    
    setLoading(true)
    
    let finalButtons: any[] = []
    if (formData.buttonType === "QUICK_REPLY" && formData.buttons.length > 0) {
      finalButtons = formData.buttons.filter((b: any) => b.text.trim() !== "").map((b: any) => ({
        type: 'QUICK_REPLY',
        text: b.text
      }))
    } else if (formData.buttonType === "URL" && formData.buttons.length > 0 && formData.buttons[0].text && formData.buttons[0].url) {
      finalButtons = [{
        type: 'URL',
        text: formData.buttons[0].text,
        url: formData.buttons[0].url
      }]
    }

    let result;
    
    if (formData.id && formData.meta_template_id) {
      result = await editTemplate({
        template_id: formData.id,
        meta_template_id: formData.meta_template_id,
        template_name: formData.template_name,
        category: formData.category,
        language: formData.language,
        header: formData.header.trim() || undefined,
        body: formData.body.trim(),
        footer: formData.footer.trim() || undefined,
        buttons: finalButtons.length > 0 ? finalButtons : undefined,
        header_examples: formData.header_examples,
        body_examples: formData.body_examples
      })
    } else {
      result = await createTemplate({
        template_name: formData.template_name,
        category: formData.category,
        language: formData.language,
        header: formData.header.trim() || undefined,
        body: formData.body.trim(),
        footer: formData.footer.trim() || undefined,
        buttons: finalButtons.length > 0 ? finalButtons : undefined,
        header_examples: formData.header_examples,
        body_examples: formData.body_examples
      })
    }

    if (result.success) {
      toast.success(formData.id ? "Plantilla actualizada exitosamente." : "Plantilla enviada exitosamente a Meta.")
      setShowBuilder(false)
      loadTemplates()
    } else {
      toast.error(result.error || "Error al procesar la plantilla.")
    }
    setLoading(false)
  }

  const getStatusBadge = (status: string, reason?: string | null) => {
    if (status === 'APPROVED') return <Badge className="bg-green-500/10 text-green-600 border-green-500/20"><CheckCircle2 className="w-3 h-3 mr-1" />Aprobado</Badge>
    if (status === 'REJECTED') {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge className="bg-red-500/10 text-red-600 border-red-500/20 cursor-help"><AlertCircle className="w-3 h-3 mr-1" />Rechazado</Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>{reason || 'Sin razón específica'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )
    }
    if (status === 'PENDING') return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20"><Clock className="w-3 h-3 mr-1" />Pendiente</Badge>
    return <Badge variant="outline">{status}</Badge>
  }

  if (showBuilder) {
    const requiredVars = parseVariables(formData.body)
    const headerRequiredVars = parseVariables(formData.header)
    const disableSubmit = !formData.template_name || !formData.body

    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => setShowBuilder(false)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            {formData.template_name ? formData.template_name : "Nueva Plantilla"}
          </h2>
        </div>

        <div className="flex-1 grid md:grid-cols-2 gap-8 min-h-0">
          {/* Editor Column */}
          <div className="flex flex-col gap-6 overflow-auto px-1 pb-8">
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="templateName" className="text-sm font-medium">Nombre de la plantilla</label>
                <Input 
                  id="templateName"
                  value={formData.template_name} 
                  onChange={(e) => handleNameChange(e.target.value)} 
                  placeholder="ejemplo_bienvenida"
                />
                <p className="text-xs text-muted-foreground">Admite snake_case (minúsculas, guiones bajos). Máx 512 caract.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Categoría</label>
                  <Select value={formData.category} onValueChange={(v: TemplateCategory) => setFormData({...formData, category: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MARKETING">Marketing (Promociones)</SelectItem>
                      <SelectItem value="UTILITY">Utilidad (Avisos, Updates)</SelectItem>
                      <SelectItem value="AUTHENTICATION">Autenticación</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Idioma</label>
                  <Select value={formData.language} onValueChange={(v) => setFormData({...formData, language: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="es_AR">Español (Argentina)</SelectItem>
                      <SelectItem value="es">Español (General)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="templateHeader" className="text-sm font-medium">Header <span className="text-muted-foreground font-normal">(Opcional)</span></label>
                <Input 
                  id="templateHeader"
                  maxLength={60} 
                  value={formData.header} 
                  onChange={e => setFormData({...formData, header: e.target.value})} 
                  placeholder="Ej: ¡Nuevo Ingreso!" 
                />
                <p className="text-xs text-muted-foreground text-right">{formData.header.length}/60</p>
                {headerRequiredVars.length > 0 && (
                  <div className="mt-2 space-y-3 p-3 bg-muted/30 rounded-lg border">
                    <p className="text-xs font-medium">Ejemplo para variable del Header</p>
                    <div className="grid gap-2">
                    {headerRequiredVars.map((v, idx) => (
                      <div key={v} className="flex flex-col gap-1.5">
                        <Input 
                          className="h-8 text-xs bg-background" 
                          placeholder={`Ejemplo para ${v}`}
                          value={formData.header_examples?.[idx] || ""}
                          onChange={(e) => {
                             const newEx = [...(formData.header_examples || [])];
                             newEx[idx] = e.target.value;
                             setFormData({...formData, header_examples: newEx});
                          }}
                        />
                      </div>
                    ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="templateBody" className="text-sm font-medium">Body <span className="text-red-500">*</span></label>
                <Textarea 
                  id="templateBody"
                  rows={5} 
                  maxLength={1024} 
                  value={formData.body} 
                  onChange={e => setFormData({...formData, body: e.target.value})} 
                  placeholder="Hola {{1}}, tenemos una propuesta para vos..." 
                />
                <div className="flex justify-between items-center text-xs text-muted-foreground">
                  <div className="flex gap-1 flex-wrap">
                    {requiredVars.length > 0 && <span className="font-medium mr-1">Variables detectadas:</span>}
                    {requiredVars.map(v => <Badge key={v} variant="secondary" className="text-[10px] py-0">{v}</Badge>)}
                  </div>
                  <span>{formData.body.length}/1024</span>
                </div>
                {requiredVars.length > 0 && (
                  <div className="mt-4 space-y-3 p-4 bg-muted/30 rounded-lg border">
                    <p className="text-sm font-medium">Ejemplos para variables del Body</p>
                    <p className="text-xs text-muted-foreground mb-2">Meta exige enviar un ejemplo claro por cada variable para aprobar la plantilla.</p>
                    <div className="grid gap-3">
                    {requiredVars.map((v, idx) => (
                      <div key={v} className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium">Variable {v}</label>
                        <Input 
                          className="h-8 text-sm bg-background" 
                          placeholder={`Ej: Juan / 15-04 / Link`}
                          value={formData.body_examples?.[idx] || ""}
                          onChange={(e) => {
                             const newEx = [...(formData.body_examples || [])];
                             newEx[idx] = e.target.value;
                             setFormData({...formData, body_examples: newEx});
                          }}
                        />
                      </div>
                    ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="templateFooter" className="text-sm font-medium">Footer <span className="text-muted-foreground font-normal">(Opcional)</span></label>
                <Input 
                  id="templateFooter"
                  maxLength={60} 
                  value={formData.footer} 
                  onChange={e => setFormData({...formData, footer: e.target.value})} 
                  placeholder="Prisma Real Estate" 
                />
                <p className="text-xs text-muted-foreground text-right">{formData.footer.length}/60</p>
              </div>

              <div className="space-y-4 pt-4 border-t">
                <label className="text-sm font-medium">Botones</label>
                <Select 
                  value={formData.buttonType} 
                  onValueChange={(v: any) => setFormData({...formData, buttonType: v, buttons: v === "QUICK_REPLY" ? [{text: ""}] : v === "URL" ? [{text: "", url: ""}] : []})}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Ninguno</SelectItem>
                    <SelectItem value="QUICK_REPLY">Respuesta rápida (Botones extra)</SelectItem>
                    <SelectItem value="URL">Enlace / URL</SelectItem>
                  </SelectContent>
                </Select>

                {formData.buttonType === "QUICK_REPLY" && (
                  <div className="space-y-2">
                    {formData.buttons.map((btn, idx) => (
                       <Input 
                         key={idx} 
                         maxLength={20} 
                         placeholder={`Botón ${idx + 1}`} 
                         value={btn.text} 
                         onChange={e => {
                           const newBtns = [...formData.buttons]
                           newBtns[idx].text = e.target.value
                           setFormData({...formData, buttons: newBtns})
                         }} 
                       />
                    ))}
                    {formData.buttons.length < 3 && (
                       <Button variant="outline" size="sm" onClick={() => setFormData({...formData, buttons: [...formData.buttons, {text: ""}]})}>
                          + Agregar botón (Máx 3)
                       </Button>
                    )}
                  </div>
                )}

                {formData.buttonType === "URL" && (
                  <div className="space-y-2">
                    <Input 
                      placeholder="Texto del botón (Ej: Ver propiedad)" 
                      maxLength={20} 
                      value={formData.buttons[0]?.text || ""} 
                      onChange={e => setFormData({...formData, buttons: [{...formData.buttons[0], text: e.target.value}]})} 
                    />
                    <Input 
                      placeholder="URL (Ej: https://prisma.com/propiedad)" 
                      value={formData.buttons[0]?.url || ""} 
                      onChange={e => setFormData({...formData, buttons: [{...formData.buttons[0], url: e.target.value}]})} 
                    />
                  </div>
                )}
              </div>

            </div>
            
            <div className="pt-4 border-t flex justify-end">
              <Button 
                onClick={handleSubmit} 
                disabled={disableSubmit || loading} 
                className="bg-accent hover:bg-accent/90 text-white"
              >
                {loading ? "Enviando..." : "Enviar a Meta"}
              </Button>
            </div>
          </div>

          {/* Preview Column */}
          <div className="hidden md:flex flex-col items-center justify-start bg-neutral-900/5 dark:bg-black/20 rounded-xl p-8 sticky top-0 min-h-[500px]">
            <p className="text-sm font-medium text-muted-foreground mb-4 w-full text-center">Preview de WhatsApp</p>
            
            <div className="relative w-[320px] rounded-3xl border-8 border-neutral-800 bg-[#ECE5DD] overflow-hidden shadow-2xl h-[550px] flex flex-col">
              {/* WhatsApp Mock Header */}
              <div className="bg-[#075E54] px-4 py-3 text-white flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div className="font-medium text-sm">Empresa Verificada</div>
              </div>

              {/* Chat Canvas */}
              <div className="flex-1 p-4 bg-[#ECE5DD] flex flex-col justify-center">
                {(deferredHeader || deferredBody || deferredFooter) && (
                  <div className="bg-white rounded-lg p-3 shadow-sm max-w-[90%] w-full self-start">
                    {deferredHeader && <p className="font-bold text-sm text-black mb-1">{deferredHeader}</p>}
                    {deferredBody && (
                      <p className="text-sm text-neutral-800 whitespace-pre-wrap break-words">
                        {deferredBody.replace(/{{[1-9][0-9]*}}/g, '[variable]')}
                      </p>
                    )}
                    {deferredFooter && <p className="text-[10px] text-neutral-500 mt-2">{deferredFooter}</p>}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // List View
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Plantillas</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Administra tus plantillas de WhatsApp aprobadas por Meta.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            Sincronizar desde Meta
          </Button>
          <Button 
            className="bg-accent hover:bg-accent/90 text-white" 
            size="sm"
            onClick={() => {
              setFormData({ template_name: "", category: "MARKETING", language: "es_AR", header: "", body: "", footer: "", buttonType: "NONE", buttons: [] })
              setShowBuilder(true)
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            Nueva plantilla
          </Button>
        </div>
      </div>

      <div className="border rounded-md">
        <div className="grid grid-cols-12 gap-4 border-b bg-muted/40 p-4 text-sm font-medium text-muted-foreground items-center">
          <div className="col-span-4">Nombre</div>
          <div className="col-span-2">Categoría</div>
          <div className="col-span-2 flex items-center gap-1">
            Límite (24hs)
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-sm">
                  <p>Es la cantidad máxima de conversaciones (con plantilla) que puedes iniciar en 24 horas.</p>
                  <p className="mt-2 font-medium">¿Cómo aumentarlo?</p>
                  <ul className="list-disc pl-4 mt-1">
                    <li>Verifica tu empresa en el administrador comercial de Meta.</li>
                    <li>Mantén una calificación de calidad alta.</li>
                    <li>Inicia conversaciones con nuevos usuarios frecuentemente. Meta aumentará el límite de forma automática.</li>
                  </ul>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="col-span-2">Estado</div>
          <div className="col-span-2 text-right">Acciones</div>
        </div>

        <div className="divide-y relative">
          {loading && (
            <div className="flex flex-col w-full">
              {[1, 2, 3].map((i) => (
                <div key={i} className="grid grid-cols-12 gap-4 p-4 border-b">
                  <div className="col-span-4"><Skeleton className="h-5 w-[150px]" /></div>
                  <div className="col-span-2"><Skeleton className="h-5 w-[80px]" /></div>
                  <div className="col-span-2"><Skeleton className="h-5 w-[60px]" /></div>
                  <div className="col-span-2"><Skeleton className="h-5 w-[80px]" /></div>
                  <div className="col-span-2 flex justify-end"><Skeleton className="h-8 w-8 rounded-md" /></div>
                </div>
              ))}
            </div>
          )}
          {!loading && templates.length === 0 && (
            <EmptyState 
              icon={MessageSquare} 
              title="No tenés plantillas todavía." 
              subtitle="Las plantillas de WhatsApp son necesarias para iniciar conversaciones con tus clientes." 
              action={{ label: "Crear primera plantilla", onClick: () => setShowBuilder(true) }}
            />
          )}
          {templates.map(t => (
            <div key={t.id} className="grid grid-cols-12 gap-4 p-4 text-sm items-center hover:bg-muted/10 transition-colors">
              <div className="col-span-4 font-medium break-words">{t.template_name}</div>
              <div className="col-span-2 text-muted-foreground">{t.category}</div>
              <div className="col-span-2 font-mono text-xs bg-muted/30 px-2 py-1 rounded-md w-fit">
                {formatMessagingLimit(instance.messaging_limit_tier)}
              </div>
              <div className="col-span-2">
                {getStatusBadge(t.status, t.rejection_reason)}
              </div>
              <div className="col-span-2 flex items-center justify-end gap-2">
                {t.meta_template_id && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-muted-foreground hover:text-accent hover:bg-accent/10"
                    onClick={() => handleEdit(t)}
                  >
                    <Edit3 className="w-4 h-4" />
                  </Button>
                )}
                
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  onClick={() => handleDelete(t)}
                  disabled={deletingId === t.id}
                >
                  {deletingId === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </Button>

                <Drawer>
                  <DrawerTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                      <Eye className="w-4 h-4" />
                    </Button>
                  </DrawerTrigger>
                  <DrawerContent>
                    <div className="mx-auto w-full max-w-md">
                      <DrawerHeader>
                        <DrawerTitle>{t.template_name}</DrawerTitle>
                      </DrawerHeader>
                      <div className="p-4 pb-8">
                        <div className="bg-[#ECE5DD] p-6 rounded-2xl">
                          <div className="bg-white rounded-lg p-4 shadow-sm">
                            {t.components?.map((c: any, idx: number) => {
                               if (c.type === 'HEADER') return <p key={idx} className="font-bold text-black text-sm mb-2">{c.text}</p>
                               if (c.type === 'BODY') return <p key={idx} className="text-sm text-neutral-800 whitespace-pre-wrap">{c.text}</p>
                               if (c.type === 'FOOTER') return <p key={idx} className="text-xs text-neutral-500 mt-2">{c.text}</p>
                               return null
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </DrawerContent>
                </Drawer>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
