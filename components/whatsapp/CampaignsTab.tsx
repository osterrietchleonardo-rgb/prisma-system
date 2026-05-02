"use client"

import { useState, useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { 
  Megaphone, 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Play, 
  StopCircle,
  RefreshCw,
  Info,
  Eye,
  Loader2,
  Send
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { EmptyState } from "./EmptyState"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { syncTemplatesFromMeta, sendCampaignMessage, updateContactCampaignStatus } from "@/app/actions/whatsapp"
import type { WATemplate, WAContact } from "@/types/whatsapp"
import { CampaignState } from "./CampaignState"
import Papa from "papaparse"
import * as XLSX from "xlsx"

interface CampaignsTabProps {
  instance: any;
}

export default function CampaignsTab({ instance }: CampaignsTabProps) {
  const [templates, setTemplates] = useState<WATemplate[]>([])
  const [loading, setLoading] = useState(true)
  
  // Selection state
  const [selectedContactsList, setSelectedContactsList] = useState<WAContact[]>([])
  const [parsedData, setParsedData] = useState<any[]>([])
  const [columns, setColumns] = useState<string[]>([])
  const [contactStatuses, setContactStatuses] = useState<Record<number, "pendiente" | "enviado" | "error" | "salteado">>({})
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("")
  
  // Mapping state
  const [phoneColumn, setPhoneColumn] = useState<string>("")
  const [nameColumn, setNameColumn] = useState<string>("")
  const [variableMap, setVariableMap] = useState<Record<string, string>>({}) // e.g. "body_1": "ColumnName" OR "body_1": "Static text"
  const [variableMode, setVariableMode] = useState<Record<string, "column" | "manual">>({}) // e.g. "body_1": "manual"

  // Execution state
  const [isSending, setIsSending] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<{success: number, error: number, skipped: number, total: number}>({ success: 0, error: 0, skipped: 0, total: 0 })
  const abortControllerRef = useRef<AbortController | null>(null)

  const getMessagingLimitNumber = (tier: string | null | undefined): number => {
    if (!tier) return 250; // default Meta limit
    switch (tier) {
      case 'TIER_50': return 50;
      case 'TIER_250': return 250;
      case 'TIER_1K': return 1000;
      case 'TIER_10K': return 10000;
      case 'TIER_100K': return 100000;
      case 'TIER_UNLIMITED': return Infinity;
      default: return 250;
    }
  }

  const limitNumber = getMessagingLimitNumber(instance?.messaging_limit_tier);

  const supabase = createClient()

  useEffect(() => {
    loadApprovedTemplates()
    
    const sync = (c: WAContact[]) => {
      setSelectedContactsList(c)
      if (c.length === 0) {
        setParsedData([])
        setColumns([])
        setContactStatuses({})
        return
      }
      
      const convertedData = c.map(contact => ({
         _id: contact.id,
         celular: contact.phone,
         nombre: contact.name,
         ...(contact.metadata || {})
      }))
      
      setParsedData(convertedData)
      
      const allCols = new Set(["celular", "nombre"])
      c.forEach(contact => {
        if (contact.metadata) Object.keys(contact.metadata).forEach(k => allCols.add(k))
      })
      setColumns(Array.from(allCols))
      
      setPhoneColumn("celular")
      setNameColumn("nombre")
      
      const initialStatuses: Record<number, "pendiente"> = {}
      c.forEach((_, i) => initialStatuses[i] = "pendiente")
      setContactStatuses(initialStatuses)
    }
    
    sync(CampaignState.getContacts())
    return CampaignState.subscribe(sync)
  }, [])

  const loadApprovedTemplates = async () => {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('wa_templates')
        .select('*')
        .eq('agency_id', instance.agency_id)
        .eq('status', 'APPROVED')
        .order('created_at', { ascending: false })
      
      if (data) setTemplates(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId)

  // Extract variables
  const getTemplateVars = (template: WATemplate) => {
    let headerVars: string[] = []
    let bodyVars: string[] = []
    
    if (template.components && Array.isArray(template.components)) {
      template.components.forEach((c: any) => {
        if (c.type === 'HEADER' && c.text) {
          const matches = c.text.match(/\{\{(\d+)\}\}/g) || []
          headerVars = Array.from(new Set(matches.map((m: string) => m.replace(/\D/g, ''))))
        }
        if (c.type === 'BODY' && c.text) {
           const matches = c.text.match(/\{\{(\d+)\}\}/g) || []
           bodyVars = Array.from(new Set(matches.map((m: string) => m.replace(/\D/g, ''))))
        }
      })
    }
    return { headerVars, bodyVars }
  }

  // Mapeo automático ya realizado en el state sync

    const getRowValue = (row: any, col: string) => {
      if (row[col] !== undefined && row[col] !== null) return String(row[col])
      if (row.metadata && row.metadata[col] !== undefined && row.metadata[col] !== null) return String(row.metadata[col])
      return ""
    }

    const startCampaign = async () => {
    if (!selectedTemplate || !phoneColumn || !nameColumn || parsedData.length === 0) {
      toast.error("Faltan configurar campos o seleccionar la plantilla.")
      return
    }

    const { headerVars, bodyVars } = getTemplateVars(selectedTemplate)
    
    // validaciones variables
    let missingMap = false;
    headerVars.forEach(v => {
       const m = variableMode[`header_${v}`] || "column"
       if (m === "column" && !variableMap[`header_${v}`]) missingMap = true
       if (m === "manual" && !variableMap[`header_${v}`]) missingMap = true // Require something even manual
    })
    bodyVars.forEach(v => {
       const m = variableMode[`body_${v}`] || "column"
       if (m === "column" && !variableMap[`body_${v}`]) missingMap = true
       if (m === "manual" && !variableMap[`body_${v}`]) missingMap = true
    })
    if (missingMap) {
      toast.error("Falta mapear o rellenar una o más variables de la plantilla.")
      return
    }

    // Eliminamos la validación de filas aquí ya que ahora se forza inmediatamente AL SUBIR el archivo.

    setIsSending(true)
    setProgress(0)
    setResults({ success: 0, error: 0, skipped: 0, total: parsedData.length })
    
    abortControllerRef.current = new AbortController()

    let s = 0;
    let e = 0;
    let skipCount = 0;

    for (let i = 0; i < parsedData.length; i++) {
      if (abortControllerRef.current.signal.aborted) {
        toast.info("Campaña detenida por el usuario.")
        break;
      }

      const row = parsedData[i];
      
      // 2. NUEVA VALIDACIÓN: Si ya se envió esta plantilla, saltear.
      const campaignData = row.campaign_statuses?.[selectedTemplate.template_name]
      const currentStatus = typeof campaignData === 'string' ? campaignData : campaignData?.status
      
      if (currentStatus === "enviado") {
        skipCount++;
        setContactStatuses(prev => ({...prev, [i]: "salteado"}))
        setResults(prev => ({ ...prev, skipped: skipCount }))
        continue;
      }

      if (s >= limitNumber) {
        toast.error(`Has alcanzado tu límite de ${limitNumber} envíos permitidos en esta sesión. El resto ha quedado pendiente.`);
        break;
      }
       const phone = getRowValue(row, phoneColumn)
       const name = getRowValue(row, nameColumn)

       // Esto técnicamente ya no se arrojará debido a la pre-validación estricta de arriba
       if (!phone || phone.replace(/\D/g, '').length < 8) {
          e++;
          setContactStatuses(prev => ({...prev, [i]: "error"}))
          setResults(prev => ({ ...prev, error: e }))
          setProgress(Math.round(((i + 1) / parsedData.length) * 100))
          continue;
       }

       // Armar construct variables
       const headerParams = headerVars.map(v => {
           const key = `header_${v}`
           const mode = variableMode[key] || "column"
           const mapVal = variableMap[key]
           return mode === "column" ? getRowValue(row, mapVal) : mapVal
       })
       const bodyParams = bodyVars.map(v => {
           const key = `body_${v}`
           const mode = variableMode[key] || "column"
           const mapVal = variableMap[key]
           return mode === "column" ? getRowValue(row, mapVal) : mapVal
       })

       let fullText = ""
       selectedTemplate.components?.forEach((c: any) => {
         if (c.type === 'BODY' && c.text) {
            let t = c.text
            bodyVars.forEach((v, idx) => {
               t = t.replace(`{{${v}}}`, bodyParams[idx])
            })
            fullText += t + "\n\n"
         }
       })

       try {
         const res = await sendCampaignMessage({
           //...
           phone,
           name,
           template_name: selectedTemplate.template_name,
           template_language: selectedTemplate.language || "es_AR",
           header_variables: headerParams.length > 0 ? headerParams : undefined,
           body_variables: bodyParams,
           template_full_text: fullText.trim() || `[Plantilla enviada: ${selectedTemplate.template_name}]`
         })

         if (res.success) {
           // @ts-ignore
           if (res.warning === 'skipped_duplicate') {
             skipCount++;
             setContactStatuses(prev => ({...prev, [i]: "salteado"}))
             if (row.id) await updateContactCampaignStatus([row.id], 'salteado', selectedTemplate.template_name)
           } else {
             s++;
             setContactStatuses(prev => ({...prev, [i]: "enviado"}))
             if (row.id) await updateContactCampaignStatus([row.id], 'enviado', selectedTemplate.template_name)
           }
         } else {
           e++;
           setContactStatuses(prev => ({...prev, [i]: "error"}))
           if (row.id) await updateContactCampaignStatus([row.id], 'error', selectedTemplate.template_name)
           console.error("Error envío fila", i, res.error)
         }
       } catch (err) {
         e++;
         setContactStatuses(prev => ({...prev, [i]: "error"}))
          if (row.id) await updateContactCampaignStatus([row.id], 'error', selectedTemplate.template_name)
       }

       setResults(prev => ({ ...prev, success: s, error: e, skipped: skipCount }))
       setProgress(Math.round(((i + 1) / parsedData.length) * 100))
       
       // Retraso artificial amigable para prevenir rate-limit y timeouts de Vercel/Meta
       await new Promise(r => setTimeout(r, 600))
    }

    setIsSending(false)
    if (!abortControllerRef.current.signal.aborted) {
       toast.success("Campaña finalizada exitosamente.")
    }
  }

  const stopCampaign = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    setIsSending(false)
  }

  if (loading) {
    return <div className="h-full flex items-center justify-center"><RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" /></div>
  }

  if (templates.length === 0) {
    return (
      <EmptyState 
        icon={Megaphone} 
        title="Sin plantillas aprobadas" 
        subtitle="Para crear una campaña, primero debes crear y tener aprobada al menos una plantilla en la pestaña Plantillas." 
      />
    )
  }

  const { headerVars, bodyVars } = selectedTemplate ? getTemplateVars(selectedTemplate) : { headerVars: [], bodyVars: [] }

  return (
    <div className="flex flex-col h-full gap-6">
      <div className="flex items-center justify-between">
         <div>
           <h2 className="text-2xl font-semibold tracking-tight">Campaña Masiva</h2>
           <p className="text-sm text-muted-foreground mt-1">
             Sube tus contactos y envía un mensaje a múltiples destinatarios de una vez. Ideal para Base de Datos Inmobiliaria.
           </p>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start pb-20">
        {/* Left Column: Config */}
        <div className="space-y-6">
            <Card>
             <CardHeader className="pb-3">
               <CardTitle className="text-lg">1. Contactos Seleccionados</CardTitle>
               <CardDescription>Los contactos provienen de la pestaña de Contactos.</CardDescription>
             </CardHeader>
             <CardContent>
               <div className="flex flex-col gap-4">
                 <div className="text-xs text-muted-foreground flex items-center gap-2 mt-2 bg-muted/30 p-2 rounded-md">
                   <Info className="w-4 h-4 text-primary"/>
                   <span>
                     Límite de envíos por campaña: <strong>{limitNumber === Infinity ? 'Ilimitado' : limitNumber} contactos</strong>.
                     (Según tu estado actual de Meta).
                   </span>
                 </div>

                 {parsedData.length > 0 ? (
                   <div className="flex items-center gap-2 text-sm text-green-600 bg-green-500/10 p-3 rounded-md mt-2">
                     <CheckCircle2 className="w-4 h-4" />
                     {parsedData.length} contactos cargados listos para enviar.
                   </div>
                 ) : (
                   <div className="flex items-center gap-2 text-sm text-yellow-600 bg-yellow-500/10 p-3 rounded-md mt-2">
                     <AlertCircle className="w-4 h-4" />
                     Ve a la pestaña Contactos y selecciona a quienes deseas enviar.
                   </div>
                 )}
               </div>
             </CardContent>
           </Card>

            <Card className={cn("shadow-md border-primary/10", parsedData.length === 0 ? 'opacity-50 pointer-events-none' : '')}>
             <CardHeader className="pb-3">
               <CardTitle className="text-lg">2. Seleccionar Plantilla Aprobada</CardTitle>
             </CardHeader>
              <CardContent className="space-y-4">
                 <div className="flex items-center gap-2">
                   <div className="flex-1">
                     <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId} disabled={isSending}>
                       <SelectTrigger>
                         <SelectValue placeholder="Elige la plantilla de envío" />
                       </SelectTrigger>
                       <SelectContent>
                         {templates.length === 0 ? (
                           <div className="p-2 text-sm text-muted-foreground text-center">No hay plantillas aprobadas.</div>
                         ) : (
                           templates.map(t => (
                             <SelectItem key={t.id} value={t.id}>
                               {t.template_name} {t.category ? `(${t.category})` : ""}
                             </SelectItem>
                           ))
                         )}
                       </SelectContent>
                     </Select>
                   </div>
                   <Button 
                     variant="outline" 
                     size="icon" 
                     onClick={async () => {
                        const res = await syncTemplatesFromMeta()
                        if (res.success) {
                          toast.success("Plantillas sincronizadas")
                          // Forzar recarga (el useEffect de templates lo hará si cambia el estado)
                          window.location.reload()
                        } else {
                          toast.error(res.error || "Error al sincronizar")
                        }
                     }}
                     disabled={isSending}
                     title="Sincronizar de Meta"
                   >
                     <RefreshCw className={cn("w-4 h-4", isSending && "animate-spin")} />
                   </Button>
                 </div>
                 <p className="text-[10px] text-muted-foreground">
                   Solo aparecen plantillas con estado <b>APPROVED</b> en Meta.
                 </p>
              </CardContent>
           </Card>

            <Card className={cn("shadow-md border-primary/10", !selectedTemplate || parsedData.length === 0 ? 'opacity-50 pointer-events-none' : '')}>
             <CardHeader className="pb-3">
               <CardTitle className="text-lg">3. Mapeo de Columnas</CardTitle>
               <CardDescription>Asigna las columnas de tu Excel a las variables necesarias.</CardDescription>
             </CardHeader>
              <CardContent className="space-y-4 max-h-[600px] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-destructive font-medium">Teléfono (Celular) *</Label>
                    <Select value={phoneColumn} onValueChange={setPhoneColumn} disabled={isSending}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                      <SelectContent>
                        {columns.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Nombre Contacto *</Label>
                    <Select value={nameColumn} onValueChange={setNameColumn} disabled={isSending}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                      <SelectContent>
                        {columns.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="pt-2 border-t mt-4 gap-4 flex flex-col">
                  {headerVars.map(v => (
                    <div key={`header_${v}`} className="space-y-2 p-3 bg-muted/30 rounded-lg border">
                      <div className="flex justify-between items-center mb-2">
                        <Label className="text-accent font-medium">Variable Header {`{{${v}}}`}</Label>
                        <Select value={variableMode[`header_${v}`] || "column"} onValueChange={val => setVariableMode(p => ({...p, [`header_${v}`]: val as "column" | "manual"}))} disabled={isSending}>
                          <SelectTrigger className="h-7 w-[130px] text-xs bg-background"><SelectValue/></SelectTrigger>
                          <SelectContent>
                             <SelectItem value="column">De columna</SelectItem>
                             <SelectItem value="manual">Texto manual fijo</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      {(variableMode[`header_${v}`] || "column") === "column" ? (
                        <Select value={variableMap[`header_${v}`] || ""} onValueChange={val => setVariableMap(p => ({...p, [`header_${v}`]: val}))} disabled={isSending}>
                          <SelectTrigger className="bg-background"><SelectValue placeholder="Matchear columna..." /></SelectTrigger>
                          <SelectContent>{columns.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : (
                        <Input value={variableMap[`header_${v}`] || ""} onChange={e => setVariableMap(p => ({...p, [`header_${v}`]: e.target.value}))} placeholder="Escribe el texto fijo para todos..." className="bg-background" disabled={isSending} />
                      )}
                    </div>
                  ))}
                  
                  {bodyVars.map(v => (
                    <div key={`body_${v}`} className="space-y-2 p-3 bg-muted/30 rounded-lg border">
                      <div className="flex justify-between items-center mb-2">
                        <Label className="text-accent font-medium">Variable Body {`{{${v}}}`}</Label>
                        <Select value={variableMode[`body_${v}`] || "column"} onValueChange={val => setVariableMode(p => ({...p, [`body_${v}`]: val as "column" | "manual"}))} disabled={isSending}>
                          <SelectTrigger className="h-7 w-[130px] text-xs bg-background"><SelectValue/></SelectTrigger>
                          <SelectContent>
                             <SelectItem value="column">De columna</SelectItem>
                             <SelectItem value="manual">Texto manual fijo</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {(variableMode[`body_${v}`] || "column") === "column" ? (
                        <Select value={variableMap[`body_${v}`] || ""} onValueChange={val => setVariableMap(p => ({...p, [`body_${v}`]: val}))} disabled={isSending}>
                          <SelectTrigger className="bg-background"><SelectValue placeholder="Matchear columna..." /></SelectTrigger>
                          <SelectContent>{columns.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : (
                        <Input value={variableMap[`body_${v}`] || ""} onChange={e => setVariableMap(p => ({...p, [`body_${v}`]: e.target.value}))} placeholder="Escribe el texto fijo para todos..." className="bg-background" disabled={isSending} />
                      )}
                    </div>
                  ))}
                  {headerVars.length === 0 && bodyVars.length === 0 && (
                    <div className="text-center py-6 text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
                      <p className="text-sm">Esta plantilla no requiere variables adicionales.</p>
                    </div>
                  )}
                </div>
                <div className="pt-6 border-t mt-6">
                  <Button 
                    className="w-full h-12 text-lg font-bold shadow-lg shadow-primary/20" 
                    size="lg"
                    onClick={startCampaign}
                    disabled={isSending || parsedData.length === 0 || !selectedTemplate}
                  >
                    {isSending ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-5 w-5" />
                        {progress === 100 ? "Volver a Iniciar Campaña" : `Lanzar Campaña para ${parsedData.length} contactos`}
                      </>
                    )}
                  </Button>
                  <p className="text-[10px] text-center text-muted-foreground mt-2 font-medium">
                    {isSending ? "Procesando cola de envíos..." : "Respeta los límites de Meta para evitar bloqueos."}
                  </p>
                </div>

                {/* Progreso de Ejecución integrado en la columna principal */}
                {(isSending || progress > 0) && (
                  <div className="mt-8 pt-6 border-t space-y-6">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm font-medium">
                        <span>Progreso de envíos</span>
                        <span>{progress}% ({results.success + results.error + results.skipped}/{results.total})</span>
                      </div>
                      <Progress value={progress} className="h-3" />
                    </div>
                    
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 flex flex-col items-center">
                        <CheckCircle2 className="w-6 h-6 text-green-500 mb-1" />
                        <span className="text-xl font-bold text-green-700 dark:text-green-400">{results.success}</span>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Enviados</span>
                      </div>
                      <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 flex flex-col items-center">
                        <Info className="w-6 h-6 text-yellow-500 mb-1" />
                        <span className="text-xl font-bold text-yellow-700 dark:text-yellow-400">{results.skipped}</span>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Salteados</span>
                      </div>
                      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex flex-col items-center">
                        <AlertCircle className="w-6 h-6 text-red-500 mb-1" />
                        <span className="text-xl font-bold text-red-700 dark:text-red-400">{results.error}</span>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Errores</span>
                      </div>
                    </div>
                    
                    {isSending && (
                      <Button 
                        variant="outline" 
                        className="w-full border-destructive text-destructive hover:bg-destructive/10" 
                        onClick={stopCampaign}
                      >
                        <StopCircle className="w-4 h-4 mr-2" /> Detener Proceso
                      </Button>
                    )}
                  </div>
                )}
             </CardContent>
           </Card>
        </div>

        {/* Columna Derecha: Vista Previa y Estado */}
        <div className="flex flex-col gap-6">
          {selectedTemplate && (
            <Card className="shadow-md border-primary/10 bg-gradient-to-br from-background to-muted/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Eye className="w-5 h-5 text-primary" />
                  Vista Previa del Mensaje
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-emerald-50 dark:bg-emerald-950/20 p-4 rounded-xl border border-emerald-100 dark:border-emerald-900/30 relative shadow-sm">
                  <div className="absolute top-2 left-[-8px] w-0 h-0 border-t-[8px] border-t-transparent border-r-[12px] border-r-emerald-50 dark:border-r-emerald-950/20 border-b-[8px] border-b-transparent"></div>
                  
                  {selectedTemplate.components?.map((c: any, i: number) => {
                    if (c.type === 'HEADER' && c.text) {
                      return <div key={i} className="font-bold text-sm mb-1 text-emerald-900 dark:text-emerald-100 border-b border-emerald-100 dark:border-emerald-800 pb-1 mb-2">{c.text}</div>
                    }
                    if (c.type === 'BODY' && c.text) {
                      return <div key={i} className="text-sm whitespace-pre-wrap text-foreground">{c.text}</div>
                    }
                    if (c.type === 'FOOTER' && c.text) {
                      return <div key={i} className="text-[10px] text-muted-foreground mt-2 uppercase tracking-wider">{c.text}</div>
                    }
                    return null
                  })}
                </div>
                <div className="mt-4 flex flex-col gap-2">
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Las variables se reemplazarán automáticamente al enviar.
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

        </div>

      </div>

      {parsedData.length > 0 && (
        <Card className="mt-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Contactos Procesados</CardTitle>
            <CardDescription>Visualiza el estado de cada contacto. El sistema respetará tu límite de envío de forma automática.</CardDescription>
          </CardHeader>
          <CardContent>
             <ScrollArea className="h-[300px] rounded-md border bg-card">
               <table className="w-full text-sm">
                 <thead className="bg-muted sticky top-0 z-10">
                   <tr>
                     <th className="p-3 text-left font-medium text-muted-foreground w-16">#</th>
                     <th className="p-3 text-left font-medium text-muted-foreground">Nombre</th>
                     <th className="p-3 text-left font-medium text-muted-foreground">Teléfono</th>
                     <th className="p-3 text-right font-medium text-muted-foreground w-32">Estado</th>
                   </tr>
                 </thead>
                 <tbody>
                   {parsedData.map((row, i) => {
                      const name = nameColumn ? row[nameColumn] : "Lead"
                      const phone = phoneColumn ? row[phoneColumn] : ""
                      const status = contactStatuses[i] || "pendiente"
                      
                      return (
                        <tr key={i} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                           <td className="p-3 text-muted-foreground">{i + 1}</td>
                           <td className="p-3 font-medium">{String(name)}</td>
                           <td className="p-3">{String(phone)}</td>
                           <td className="p-3 text-right">
                             <Badge 
                               variant={
                                  status === "enviado" ? "default" :
                                  status === "salteado" ? "secondary" :
                                  status === "error" ? "destructive" : "outline"
                               }
                               className={status === "enviado" ? "bg-green-500 hover:bg-green-600 text-white" : ""}
                             >
                               {status.toUpperCase()}
                             </Badge>
                           </td>
                        </tr>
                      )
                   })}
                 </tbody>
               </table>
             </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
