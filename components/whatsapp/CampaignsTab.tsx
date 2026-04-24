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
  const [contactStatuses, setContactStatuses] = useState<Record<number, "pendiente" | "enviado" | "error" | "salteado">>({})
  
  // Selection state
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

    const fileExt = file.name.split('.').pop()?.toLowerCase()
    
    clearFile()
    setFile(file)

    if (fileExt === 'csv') {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.data.length > 0) {
            processAndValidateData(results.data)
          } else {
            toast.error("El archivo CSV está vacío.")
            clearFile()
          }
        },
        error: (error) => {
          toast.error("Error al leer el CSV: " + error.message)
          clearFile()
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
            processAndValidateData(jsonData)
          } else {
            toast.error("El archivo Excel está vacío.")
            clearFile()
          }
        } catch (error) {
          toast.error("Error al procesar el Excel. Asegúrate de que sea válido.")
          clearFile()
        }
      }
      reader.readAsArrayBuffer(file)
    } else {
      toast.error("Formato no soportado. Por favor sube un CSV o Excel.")
      clearFile()
    }
  }

  const processAndValidateData = (data: any[]) => {
    // Validar headers y buscar dinámicamente el del celular/telefono
    const cols = Object.keys(data[0] as object)
    const lowerCols = cols.map(c => c.toLowerCase().trim())
    
    let pCol = ""
    if (lowerCols.includes('celular')) pCol = cols[lowerCols.indexOf('celular')]
    else if (lowerCols.includes('telefono')) pCol = cols[lowerCols.indexOf('telefono')]
    else if (lowerCols.includes('teléfono')) pCol = cols[lowerCols.indexOf('teléfono')]
    else if (lowerCols.includes('phone')) pCol = cols[lowerCols.indexOf('phone')]

    if (!pCol) {
       toast.error("❌ Archivo Inválido: Debe contener una columna exactamente llamada 'celular' o 'telefono'.")
       return clearFile()
    }

    let nCol = ""
    if (lowerCols.includes('nombre')) nCol = cols[lowerCols.indexOf('nombre')]
    else if (lowerCols.includes('name')) nCol = cols[lowerCols.indexOf('name')]

    if (!nCol) {
       toast.error("❌ Archivo Inválido: Debe contener una columna exactamente llamada 'nombre'.")
       return clearFile()
    }

    // Now strict validation for the entire dataset
    const seenPhones = new Set<string>()
    let errorMsg = ""

    for (let i = 0; i < data.length; i++) {
        const row = data[i]
        const phoneRaw = row[pCol] ? String(row[pCol]) : ""
        const phone = phoneRaw.replace(/\D/g, '')
        const name = row[nCol] ? String(row[nCol]) : ""

        if (!phone || phone.length < 8) {
           errorMsg = `Fila ${i + 2}: Teléfono inválido o vacío para el contacto "${name || 'sin nombre'}".`
           break;
        }
        if (!name.trim()) {
           errorMsg = `Fila ${i + 2}: Nombre vacío (Teléfono: ${phone}).`
           break;
        }
        if (seenPhones.has(phone)) {
           errorMsg = `Fila ${i + 2}: El teléfono ${phone} está duplicado en la lista.`
           break;
        }
        seenPhones.add(phone)
    }

    if (errorMsg) {
       toast.error("❌ No se permite cargar la lista con errores: " + errorMsg)
       return clearFile()
    }

    // Passed validation
    setColumns(cols)
    setParsedData(data)
    
    const initialStatuses: Record<number, "pendiente"> = {}
    data.forEach((_, i) => initialStatuses[i] = "pendiente")
    setContactStatuses(initialStatuses)
    
    // Setting these automatically avoids the useEffect auto-detection which is redundant now
    setTimeout(() => {
        setPhoneColumn(pCol)
        setNameColumn(nCol)
    }, 0)
  }

    const clearFile = () => {
    setFile(null)
    setParsedData([])
    setColumns([])
    setPhoneColumn("")
    setNameColumn("")
    setVariableMap({})
    setVariableMode({})
    setContactStatuses({})
    setProgress(0)
    setResults({ success: 0, error: 0, skipped: 0, total: 0 })
    const fileInput = document.getElementById('file_upload') as HTMLInputElement
    if (fileInput) fileInput.value = ''

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

  // Pre-fill mapping depends entirely on processAndValidateData now.
  // The useEffect auto-detect logic was replaced to happen INSTANTLY upon upload.

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

       if (contactStatuses[i] && contactStatuses[i] !== "pendiente") {
         // Skip contacts already processed
         continue;
       }

       if (s >= limitNumber) {
         toast.error(`Has alcanzado tu límite de ${limitNumber} envíos permitidos en esta sesión. El resto ha quedado pendiente.`);
         break;
       }

       const row = parsedData[i];
       const phone = row[phoneColumn] ? String(row[phoneColumn]) : ""
       const name = row[nameColumn] ? String(row[nameColumn]) : "Lead"

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
           const mode = variableMode[`header_${v}`] || "column"
           if (mode === "column") return String(row[variableMap[`header_${v}`]] || "")
           return variableMap[`header_${v}`] || ""
       })
       const bodyParams = bodyVars.map(v => {
           const mode = variableMode[`body_${v}`] || "column"
           if (mode === "column") return String(row[variableMap[`body_${v}`]] || "")
           return variableMap[`body_${v}`] || ""
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
           } else {
             s++;
             setContactStatuses(prev => ({...prev, [i]: "enviado"}))
           }
         } else {
           e++;
           setContactStatuses(prev => ({...prev, [i]: "error"}))
           console.error("Error envío fila", i, res.error)
         }
       } catch (err) {
         e++;
         setContactStatuses(prev => ({...prev, [i]: "error"}))
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
                 
                 <div className="text-xs text-muted-foreground flex items-center gap-2 mt-2 bg-muted/30 p-2 rounded-md">
                   <Info className="w-4 h-4 text-primary"/>
                   <span>
                     Límite de envíos por campaña: <strong>{limitNumber === Infinity ? 'Ilimitado' : limitNumber} contactos</strong>.
                     (Según tu estado actual de Meta).
                   </span>
                 </div>

                 {parsedData.length > 0 && (
                   <div className="flex items-center gap-2 text-sm text-green-600 bg-green-500/10 p-3 rounded-md mt-2">
                     <CheckCircle2 className="w-4 h-4" />
                     {parsedData.length} registros detectados y validados listos para enviar.
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

                   <p className="text-xs text-muted-foreground text-center">
                     Los leads exitosos se cargarán automáticamente en el Inbox y quedarán con el IA activo. Los "Salteados" ya recibieron esta plantilla previamente.
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
