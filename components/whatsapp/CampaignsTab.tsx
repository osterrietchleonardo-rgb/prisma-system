"use client"

import { useState, useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { sendCampaignMessage } from "@/app/actions/whatsapp"
import type { WATemplate } from "@/types/whatsapp"
import { 
  Megaphone, 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Play, 
  StopCircle,
  RefreshCw,
  Info
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
import Papa from "papaparse"
import * as XLSX from "xlsx"

interface CampaignsTabProps {
  instance: any;
}

export default function CampaignsTab({ instance }: CampaignsTabProps) {
  const [templates, setTemplates] = useState<WATemplate[]>([])
  const [loading, setLoading] = useState(true)
  
  // File state
  const [file, setFile] = useState<File | null>(null)
  const [parsedData, setParsedData] = useState<any[]>([])
  const [columns, setColumns] = useState<string[]>([])
  
  // Selection state
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("")
  
  // Mapping state
  const [phoneColumn, setPhoneColumn] = useState<string>("")
  const [nameColumn, setNameColumn] = useState<string>("")
  const [variableMap, setVariableMap] = useState<Record<string, string>>({}) // e.g. "body_1": "ColumnName"

  // Execution state
  const [isSending, setIsSending] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<{success: number, error: number, total: number}>({ success: 0, error: 0, total: 0 })
  const abortControllerRef = useRef<AbortController | null>(null)

  const supabase = createClient()

  useEffect(() => {
    loadApprovedTemplates()
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFile(file)
    setParsedData([])
    setColumns([])
    setPhoneColumn("")
    setNameColumn("")
    setVariableMap({})
    setProgress(0)
    setResults({ success: 0, error: 0, total: 0 })

    const fileExt = file.name.split('.').pop()?.toLowerCase()

    if (fileExt === 'csv') {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.data.length > 0) {
            setColumns(Object.keys(results.data[0] as object))
            setParsedData(results.data)
          }
        },
        error: (error) => {
          toast.error("Error al leer el CSV: " + error.message)
        }
      })
    } else if (fileExt === 'xls' || fileExt === 'xlsx') {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer)
          const workbook = XLSX.read(data, { type: 'array' })
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
          const jsonData = XLSX.utils.sheet_to_json(firstSheet)
          if (jsonData.length > 0) {
            setColumns(Object.keys(jsonData[0] as object))
            setParsedData(jsonData)
          }
        } catch (error) {
          toast.error("Error al procesar el Excel. Asegúrate de que sea válido.")
        }
      }
      reader.readAsArrayBuffer(file)
    } else {
      toast.error("Formato no soportado. Por favor sube un CSV o Excel.")
    }
  }

  // Pre-fill variable mapping if columns match by name
  useEffect(() => {
    if (columns.length > 0) {
      const lowerCols = columns.map(c => c.toLowerCase())
      
      // Auto-detect phone
      let pCol = ""
      if (lowerCols.includes('celular')) pCol = columns[lowerCols.indexOf('celular')]
      else if (lowerCols.includes('telefono')) pCol = columns[lowerCols.indexOf('telefono')]
      else if (lowerCols.includes('phone')) pCol = columns[lowerCols.indexOf('phone')]
      if (pCol) setPhoneColumn(pCol)

      // Auto-detect name
      let nCol = ""
      if (lowerCols.includes('nombre')) nCol = columns[lowerCols.indexOf('nombre')]
      else if (lowerCols.includes('name')) nCol = columns[lowerCols.indexOf('name')]
      if (nCol) setNameColumn(nCol)
    }
  }, [columns])

  const startCampaign = async () => {
    if (!selectedTemplate || !phoneColumn || !nameColumn || parsedData.length === 0) {
      toast.error("Faltan configurar campos o seleccionar la plantilla.")
      return
    }

    const { headerVars, bodyVars } = getTemplateVars(selectedTemplate)
    
    // validaciones variables
    let missingMap = false;
    headerVars.forEach(v => { if (!variableMap[`header_${v}`]) missingMap = true })
    bodyVars.forEach(v => { if (!variableMap[`body_${v}`]) missingMap = true })
    if (missingMap) {
      toast.error("Falta mapear una o más variables de la plantilla.")
      return
    }

    setIsSending(true)
    setProgress(0)
    setResults({ success: 0, error: 0, total: parsedData.length })
    
    abortControllerRef.current = new AbortController()

    let s = 0;
    let e = 0;

    for (let i = 0; i < parsedData.length; i++) {
       if (abortControllerRef.current.signal.aborted) {
         toast.info("Campaña detenida por el usuario.")
         break;
       }

       const row = parsedData[i];
       const phone = row[phoneColumn] ? String(row[phoneColumn]) : ""
       const name = row[nameColumn] ? String(row[nameColumn]) : "Lead"

       // Limpiar teléfono
       if (!phone || phone.replace(/\D/g, '').length < 8) {
          e++;
          setResults(prev => ({ ...prev, error: e }))
          setProgress(Math.round(((i + 1) / parsedData.length) * 100))
          continue;
       }

       // Armar construct variables
       const headerParams = headerVars.map(v => String(row[variableMap[`header_${v}`]] || ""))
       const bodyParams = bodyVars.map(v => String(row[variableMap[`body_${v}`]] || ""))

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
           phone,
           name,
           template_name: selectedTemplate.template_name,
           template_language: selectedTemplate.language || "es_AR",
           header_variables: headerParams.length > 0 ? headerParams : undefined,
           body_variables: bodyParams,
           template_full_text: fullText.trim() || `[Plantilla enviada: ${selectedTemplate.template_name}]`
         })

         if (res.success) {
           s++;
         } else {
           e++;
           console.error("Error envío fila", i, res.error)
         }
       } catch (err) {
         e++;
       }

       setResults(prev => ({ ...prev, success: s, error: e }))
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

      <div className="grid md:grid-cols-2 gap-6 h-full pb-8">
        {/* Left Column: Config */}
        <div className="space-y-6">
           <Card>
             <CardHeader className="pb-3">
               <CardTitle className="text-lg">1. Cargar Base de Contactos</CardTitle>
               <CardDescription>Formatos soportados: .csv, .xls, .xlsx</CardDescription>
             </CardHeader>
             <CardContent>
               <div className="flex flex-col gap-4">
                 <Label htmlFor="file_upload" className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                   <Upload className="w-8 h-8 text-muted-foreground mb-4" />
                   <div className="text-sm font-medium">Seleccionar Archivo</div>
                   <div className="text-xs text-muted-foreground mt-1">
                     {file ? file.name : 'Haz clic para explorar'}
                   </div>
                   <Input id="file_upload" type="file" accept=".csv, .xls, .xlsx" className="hidden" onChange={handleFileUpload} disabled={isSending} />
                 </Label>
                 
                 {parsedData.length > 0 && (
                   <div className="flex items-center gap-2 text-sm text-green-600 bg-green-500/10 p-3 rounded-md">
                     <CheckCircle2 className="w-4 h-4" />
                     {parsedData.length} registros detectados.
                   </div>
                 )}
               </div>
             </CardContent>
           </Card>

           <Card className={parsedData.length === 0 ? 'opacity-50 pointer-events-none' : ''}>
             <CardHeader className="pb-3">
               <CardTitle className="text-lg">2. Seleccionar Plantilla Aprobada</CardTitle>
             </CardHeader>
             <CardContent>
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId} disabled={isSending}>
                  <SelectTrigger>
                    <SelectValue placeholder="Elige la plantilla de envío" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.template_name} ({t.category})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
             </CardContent>
           </Card>

           <Card className={!selectedTemplate || parsedData.length === 0 ? 'opacity-50 pointer-events-none' : ''}>
             <CardHeader className="pb-3">
               <CardTitle className="text-lg">3. Mapeo de Columnas</CardTitle>
               <CardDescription>Asigna las columnas de tu Excel a las variables necesarias.</CardDescription>
             </CardHeader>
             <CardContent className="space-y-4">
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
                    <div key={`header_${v}`} className="space-y-2">
                      <Label className="text-accent">Variable Header {`{{${v}}}`}</Label>
                      <Select value={variableMap[`header_${v}`] || ""} onValueChange={val => setVariableMap(p => ({...p, [`header_${v}`]: val}))} disabled={isSending}>
                        <SelectTrigger><SelectValue placeholder="Matchear columna..." /></SelectTrigger>
                        <SelectContent>{columns.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  ))}
                  {bodyVars.map(v => (
                    <div key={`body_${v}`} className="space-y-2">
                      <Label className="text-accent">Variable Body {`{{${v}}}`}</Label>
                      <Select value={variableMap[`body_${v}`] || ""} onValueChange={val => setVariableMap(p => ({...p, [`body_${v}`]: val}))} disabled={isSending}>
                        <SelectTrigger><SelectValue placeholder="Matchear columna..." /></SelectTrigger>
                        <SelectContent>{columns.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  ))}
                  {headerVars.length === 0 && bodyVars.length === 0 && selectedTemplate && (
                    <p className="text-sm text-muted-foreground"><Info className="w-4 h-4 inline mr-1"/>Esta plantilla no requiere variables adicionales.</p>
                  )}
                </div>
             </CardContent>
           </Card>
        </div>

        {/* Right Column: Execution */}
        <div className="space-y-6">
           <Card className="h-full flex flex-col">
             <CardHeader>
               <CardTitle className="text-lg">Ejecución de Campaña</CardTitle>
             </CardHeader>
             <CardContent className="flex-1 flex flex-col">
               
               {isSending || progress > 0 ? (
                 <div className="space-y-6 mt-4">
                   <div className="space-y-2">
                     <div className="flex justify-between text-sm font-medium">
                       <span>Progreso de envíos</span>
                       <span>{progress}% ({results.success + results.error}/{results.total})</span>
                     </div>
                     <Progress value={progress} className="h-3" />
                   </div>
                   
                   <div className="grid grid-cols-2 gap-4">
                     <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 flex flex-col items-center">
                       <CheckCircle2 className="w-8 h-8 text-green-500 mb-2" />
                       <span className="text-2xl font-bold text-green-700 dark:text-green-400">{results.success}</span>
                       <span className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Enviados</span>
                     </div>
                     <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex flex-col items-center">
                       <AlertCircle className="w-8 h-8 text-red-500 mb-2" />
                       <span className="text-2xl font-bold text-red-700 dark:text-red-400">{results.error}</span>
                       <span className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Errores</span>
                     </div>
                   </div>

                   <p className="text-xs text-muted-foreground text-center">
                     Los leads exitosos se cargarán automáticamente en el Inbox y quedarán con el IA activo.
                   </p>
                 </div>
               ) : (
                 <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-muted/20 border rounded-lg">
                   <Megaphone className="w-12 h-12 text-muted-foreground mb-4" />
                   <h3 className="font-semibold text-lg">Listo para enviar</h3>
                   <p className="text-sm text-muted-foreground max-w-sm mt-2">
                     Configura el archivo, la plantilla y presiona Enviar para comenzar a notificar a todos los leads detectados.
                   </p>
                 </div>
               )}

             </CardContent>
             <CardFooter className="flex gap-4 border-t pt-6 bg-muted/10">
               {!isSending ? (
                 <Button 
                   className="w-full bg-accent hover:bg-accent/90 text-white" 
                   size="lg" 
                   onClick={startCampaign}
                   disabled={progress > 0 && progress < 100} // Disable if it finished or didn't reset
                 >
                   <Play className="w-5 h-5 mr-2" /> {progress === 100 ? "Volver a Iniciar" : "Lanzar Campaña"}
                 </Button>
               ) : (
                 <Button 
                   className="w-full bg-destructive hover:bg-destructive/90 text-white" 
                   size="lg" 
                   onClick={stopCampaign}
                 >
                   <StopCircle className="w-5 h-5 mr-2" /> Detener envíos
                 </Button>
               )}
             </CardFooter>
           </Card>
        </div>

      </div>
    </div>
  )
}
