"use client"

import { useState, useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { importContacts, sendCampaignMessage, updateContactCampaignStatus } from "@/app/actions/whatsapp"
import type { WATemplate, WAContact } from "@/types/whatsapp"
import { 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  Play, 
  StopCircle,
  RefreshCw,
  Info,
  Users,
  Search,
  MessageSquare,
  Clock
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "sonner"
import Papa from "papaparse"
import * as XLSX from "xlsx"

interface ContactsTabProps {
  instance: any;
}

export default function ContactsTab({ instance }: ContactsTabProps) {
  const supabase = createClient()
  
  // Contacts State
  const [contacts, setContacts] = useState<WAContact[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set())
  
  // Import State
  const [isImporting, setIsImporting] = useState(false)
  
  // Campaign Dialog State
  const [isCampaignDialogOpen, setIsCampaignDialogOpen] = useState(false)
  const [templates, setTemplates] = useState<WATemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("")
  const [variableMap, setVariableMap] = useState<Record<string, string>>({})
  const [variableMode, setVariableMode] = useState<Record<string, "metadata" | "manual">>({})
  
  // Execution State
  const [isSending, setIsSending] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<{success: number, error: number, skipped: number, total: number}>({ success: 0, error: 0, skipped: 0, total: 0 })
  const abortControllerRef = useRef<AbortController | null>(null)

  const getMessagingLimitNumber = (tier: string | null | undefined): number => {
    if (!tier) return 250;
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

  useEffect(() => {
    fetchContacts()
    loadApprovedTemplates()
  }, [])

  const fetchContacts = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('wa_contacts')
        .select('*')
        .eq('agency_id', instance.agency_id)
        .order('created_at', { ascending: false })
      
      if (error) throw error
      if (data) setContacts(data as WAContact[])
    } catch (err) {
      console.error(err)
      toast.error("Error al cargar los contactos")
    } finally {
      setLoading(false)
    }
  }

  const loadApprovedTemplates = async () => {
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
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const fileExt = file.name.split('.').pop()?.toLowerCase()
    setIsImporting(true)
    
    if (fileExt === 'csv') {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.data.length > 0) {
            processAndImportData(results.data)
          } else {
            toast.error("El archivo CSV está vacío.")
            setIsImporting(false)
          }
        },
        error: (error) => {
          toast.error("Error al leer el CSV: " + error.message)
          setIsImporting(false)
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
            processAndImportData(jsonData)
          } else {
            toast.error("El archivo Excel está vacío.")
            setIsImporting(false)
          }
        } catch (error) {
          toast.error("Error al procesar el Excel. Asegúrate de que sea válido.")
          setIsImporting(false)
        }
      }
      reader.readAsArrayBuffer(file)
    } else {
      toast.error("Formato no soportado. Por favor sube un CSV o Excel.")
      setIsImporting(false)
    }
    
    // Reset file input
    e.target.value = ''
  }

  const processAndImportData = async (data: any[]) => {
    const cols = Object.keys(data[0] as object)
    const lowerCols = cols.map(c => c.toLowerCase().trim())
    
    let pCol = ""
    if (lowerCols.includes('celular')) pCol = cols[lowerCols.indexOf('celular')]
    else if (lowerCols.includes('telefono')) pCol = cols[lowerCols.indexOf('telefono')]
    else if (lowerCols.includes('teléfono')) pCol = cols[lowerCols.indexOf('teléfono')]
    else if (lowerCols.includes('phone')) pCol = cols[lowerCols.indexOf('phone')]

    if (!pCol) {
       toast.error("❌ Archivo Inválido: Debe contener una columna 'celular' o 'telefono'.")
       setIsImporting(false)
       return
    }

    let nCol = ""
    if (lowerCols.includes('nombre')) nCol = cols[lowerCols.indexOf('nombre')]
    else if (lowerCols.includes('name')) nCol = cols[lowerCols.indexOf('name')]

    if (!nCol) {
       toast.error("❌ Archivo Inválido: Debe contener una columna 'nombre'.")
       setIsImporting(false)
       return
    }

    const newContacts = []
    
    for (let i = 0; i < data.length; i++) {
        const row = data[i]
        const phoneRaw = row[pCol] ? String(row[pCol]) : ""
        const phone = phoneRaw.replace(/\D/g, '')
        const name = row[nCol] ? String(row[nCol]) : ""
        
        if (phone && phone.length >= 8 && name.trim()) {
           // Rest of properties into metadata
           const metadata = { ...row }
           delete metadata[pCol]
           delete metadata[nCol]
           
           newContacts.push({
             phone,
             name,
             metadata,
             tags: []
           })
        }
    }

    if (newContacts.length === 0) {
      toast.error("No se encontraron contactos válidos en el archivo.")
      setIsImporting(false)
      return
    }

    toast.loading(`Importando ${newContacts.length} contactos...`, { id: "import-toast" })
    
    const res = await importContacts(newContacts)
    if (res.success) {
      toast.success(`${newContacts.length} contactos procesados exitosamente.`, { id: "import-toast" })
      await fetchContacts()
    } else {
      toast.error(`Error al importar: ${res.error}`, { id: "import-toast" })
    }
    
    setIsImporting(false)
  }

  const toggleSelectAll = () => {
    if (selectedContactIds.size === filteredContacts.length) {
      setSelectedContactIds(new Set())
    } else {
      setSelectedContactIds(new Set(filteredContacts.map(c => c.id)))
    }
  }

  const toggleContactSelection = (id: string) => {
    const newSet = new Set(selectedContactIds)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedContactIds(newSet)
  }

  const openCampaignDialog = () => {
    if (selectedContactIds.size === 0) {
      toast.error("Debes seleccionar al menos un contacto.")
      return
    }
    setIsCampaignDialogOpen(true)
  }

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

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId)
  const { headerVars, bodyVars } = selectedTemplate ? getTemplateVars(selectedTemplate) : { headerVars: [], bodyVars: [] }
  
  // Extraer todas las claves posibles de metadata de los contactos seleccionados para el mapeo
  const selectedContactsList = contacts.filter(c => selectedContactIds.has(c.id))
  const availableMetadataKeys = new Set<string>()
  selectedContactsList.forEach(c => {
    if (c.metadata) {
      Object.keys(c.metadata).forEach(k => availableMetadataKeys.add(k))
    }
  })
  const metadataKeysArray = Array.from(availableMetadataKeys)

  const startCampaign = async () => {
    if (!selectedTemplate || selectedContactIds.size === 0) {
      toast.error("Faltan configurar campos o seleccionar la plantilla.")
      return
    }

    let missingMap = false;
    headerVars.forEach(v => {
       const m = variableMode[`header_${v}`] || "metadata"
       if (!variableMap[`header_${v}`]) missingMap = true
    })
    bodyVars.forEach(v => {
       const m = variableMode[`body_${v}`] || "metadata"
       if (!variableMap[`body_${v}`]) missingMap = true
    })
    
    if (missingMap) {
      toast.error("Falta mapear o rellenar una o más variables de la plantilla.")
      return
    }

    setIsSending(true)
    setProgress(0)
    setResults({ success: 0, error: 0, skipped: 0, total: selectedContactIds.size })
    
    abortControllerRef.current = new AbortController()

    let s = 0;
    let e = 0;
    let skipCount = 0;
    let processed = 0;

    for (const contact of selectedContactsList) {
       if (abortControllerRef.current.signal.aborted) {
         toast.info("Campaña detenida por el usuario.")
         break;
       }

       if (s >= limitNumber) {
         toast.error(`Has alcanzado tu límite de ${limitNumber} envíos permitidos en esta sesión.`);
         break;
       }

       // Armar variables
       const headerParams = headerVars.map(v => {
           const mode = variableMode[`header_${v}`] || "metadata"
           if (mode === "metadata") return String(contact.metadata?.[variableMap[`header_${v}`]] || "")
           return variableMap[`header_${v}`] || ""
       })
       
       const bodyParams = bodyVars.map(v => {
           const mode = variableMode[`body_${v}`] || "metadata"
           if (mode === "metadata") return String(contact.metadata?.[variableMap[`body_${v}`]] || "")
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
           instance_id: instance.id,
           phone: contact.phone,
           name: contact.name || 'Lead',
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
             await updateContactCampaignStatus([contact.id], 'salteado', selectedTemplate.template_name)
           } else {
             s++;
             await updateContactCampaignStatus([contact.id], 'enviado', selectedTemplate.template_name)
           }
         } else {
           e++;
           await updateContactCampaignStatus([contact.id], 'error', selectedTemplate.template_name)
           console.error("Error envío", res.error)
         }
       } catch (err) {
         e++;
         await updateContactCampaignStatus([contact.id], 'error', selectedTemplate.template_name)
       }

       processed++
       setResults(prev => ({ ...prev, success: s, error: e, skipped: skipCount }))
       setProgress(Math.round((processed / selectedContactsList.length) * 100))
       
       // Retraso para no saturar Meta
       await new Promise(r => setTimeout(r, 600))
    }

    setIsSending(false)
    if (!abortControllerRef.current.signal.aborted) {
       toast.success("Campaña finalizada.")
    }
    
    // Refresh table to show updated statuses
    fetchContacts()
  }

  const stopCampaign = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    setIsSending(false)
  }

  const filteredContacts = contacts.filter(c => 
    c.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.phone.includes(searchTerm)
  )

  if (loading) {
    return <div className="h-full flex items-center justify-center"><RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
         <div>
           <h2 className="text-2xl font-semibold tracking-tight">Contactos y Base de Datos</h2>
           <p className="text-sm text-muted-foreground mt-1">
             Sube tus leads, gestiona tu base y lanza campañas personalizadas de WhatsApp con trazabilidad.
           </p>
         </div>
         <div className="flex gap-2 w-full sm:w-auto">
            <Label htmlFor="contact_upload" className="inline-flex h-10 items-center justify-center whitespace-nowrap rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 px-4 py-2 text-sm font-medium transition-colors cursor-pointer w-full sm:w-auto">
              {isImporting ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Importar Contactos
              <Input id="contact_upload" type="file" accept=".csv, .xls, .xlsx" className="hidden" onChange={handleFileUpload} disabled={isImporting || isSending} />
            </Label>
            
            <Button 
              className="w-full sm:w-auto"
              disabled={selectedContactIds.size === 0 || isSending} 
              onClick={openCampaignDialog}
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              Lanzar Campaña ({selectedContactIds.size})
            </Button>
         </div>
      </div>

      <Card className="flex-1 min-h-0 flex flex-col">
        <div className="p-4 border-b flex items-center gap-4 bg-muted/20">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Buscar por nombre o teléfono..."
              className="pl-9 bg-background"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="text-sm text-muted-foreground flex items-center gap-2 ml-auto">
             <Users className="w-4 h-4" />
             {contacts.length} contactos totales
          </div>
        </div>
        
        <div className="flex-1 overflow-auto">
          {filteredContacts.length === 0 ? (
             <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8">
                <Users className="w-12 h-12 mb-4 opacity-20" />
                <p>No se encontraron contactos.</p>
                {contacts.length === 0 && <p className="text-sm mt-1">Sube un archivo CSV o Excel para comenzar.</p>}
             </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0 z-10 backdrop-blur-sm">
                <tr>
                  <th className="p-3 text-left font-medium text-muted-foreground w-12">
                    <Checkbox 
                      checked={selectedContactIds.size === filteredContacts.length && filteredContacts.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  </th>
                  <th className="p-3 text-left font-medium text-muted-foreground">Nombre</th>
                  <th className="p-3 text-left font-medium text-muted-foreground">Teléfono</th>
                  <th className="p-3 text-left font-medium text-muted-foreground">Última Plantilla</th>
                  <th className="p-3 text-center font-medium text-muted-foreground">Último Estado</th>
                  <th className="p-3 text-right font-medium text-muted-foreground">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {filteredContacts.map((contact) => (
                  <tr key={contact.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                     <td className="p-3">
                        <Checkbox 
                          checked={selectedContactIds.has(contact.id)}
                          onCheckedChange={() => toggleContactSelection(contact.id)}
                        />
                     </td>
                     <td className="p-3 font-medium">{contact.name || "Sin nombre"}</td>
                     <td className="p-3">{contact.phone}</td>
                     <td className="p-3">
                       {contact.last_campaign_template ? (
                         <span className="truncate max-w-[150px] inline-block" title={contact.last_campaign_template}>
                           {contact.last_campaign_template}
                         </span>
                       ) : (
                         <span className="text-muted-foreground">-</span>
                       )}
                     </td>
                     <td className="p-3 text-center">
                       {contact.last_campaign_status ? (
                         <Badge 
                           variant={
                              contact.last_campaign_status === "enviado" ? "default" :
                              contact.last_campaign_status === "salteado" ? "secondary" :
                              contact.last_campaign_status === "error" ? "destructive" : "outline"
                           }
                           className={contact.last_campaign_status === "enviado" ? "bg-green-500 hover:bg-green-600 text-white" : ""}
                         >
                           {contact.last_campaign_status.toUpperCase()}
                         </Badge>
                       ) : (
                         <span className="text-muted-foreground text-xs">Sin actividad</span>
                       )}
                     </td>
                     <td className="p-3 text-right text-muted-foreground text-xs">
                       {contact.last_campaign_sent_at ? new Date(contact.last_campaign_sent_at).toLocaleDateString() : '-'}
                     </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <Dialog open={isCampaignDialogOpen} onOpenChange={(open) => !isSending && setIsCampaignDialogOpen(open)}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Lanzar Campaña</DialogTitle>
            <DialogDescription>
              Se enviará una plantilla a los {selectedContactIds.size} contactos seleccionados.
            </DialogDescription>
          </DialogHeader>

          {isSending || progress > 0 ? (
             <div className="flex-1 overflow-y-auto py-6">
                <div className="space-y-6">
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
                 </div>
             </div>
          ) : (
            <div className="flex-1 overflow-y-auto py-4 space-y-6 pr-2">
              <div className="space-y-3">
                <Label>Seleccionar Plantilla Aprobada</Label>
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
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
              </div>

              {selectedTemplate && (headerVars.length > 0 || bodyVars.length > 0) && (
                <div className="space-y-4 pt-4 border-t">
                  <h4 className="font-medium text-sm">Mapeo de Variables</h4>
                  <p className="text-xs text-muted-foreground">Asigna las variables de tu plantilla a las columnas extra del Excel subido o escribe un texto fijo.</p>
                  
                  {headerVars.map(v => (
                    <div key={`header_${v}`} className="space-y-2 p-3 bg-muted/30 rounded-lg border">
                      <div className="flex justify-between items-center mb-2">
                        <Label className="text-xs font-medium">Variable Header {`{{${v}}}`}</Label>
                        <Select value={variableMode[`header_${v}`] || "metadata"} onValueChange={val => setVariableMode(p => ({...p, [`header_${v}`]: val as "metadata" | "manual"}))}>
                          <SelectTrigger className="h-7 w-[130px] text-xs"><SelectValue/></SelectTrigger>
                          <SelectContent>
                             <SelectItem value="metadata">Dato del Excel</SelectItem>
                             <SelectItem value="manual">Texto fijo</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      {(variableMode[`header_${v}`] || "metadata") === "metadata" ? (
                        <Select value={variableMap[`header_${v}`] || ""} onValueChange={val => setVariableMap(p => ({...p, [`header_${v}`]: val}))}>
                          <SelectTrigger><SelectValue placeholder="Selecciona la columna..." /></SelectTrigger>
                          <SelectContent>{metadataKeysArray.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : (
                        <Input value={variableMap[`header_${v}`] || ""} onChange={e => setVariableMap(p => ({...p, [`header_${v}`]: e.target.value}))} placeholder="Texto para todos..." />
                      )}
                    </div>
                  ))}
                  
                  {bodyVars.map(v => (
                    <div key={`body_${v}`} className="space-y-2 p-3 bg-muted/30 rounded-lg border">
                      <div className="flex justify-between items-center mb-2">
                        <Label className="text-xs font-medium">Variable Body {`{{${v}}}`}</Label>
                        <Select value={variableMode[`body_${v}`] || "metadata"} onValueChange={val => setVariableMode(p => ({...p, [`body_${v}`]: val as "metadata" | "manual"}))}>
                          <SelectTrigger className="h-7 w-[130px] text-xs"><SelectValue/></SelectTrigger>
                          <SelectContent>
                             <SelectItem value="metadata">Dato del Excel</SelectItem>
                             <SelectItem value="manual">Texto fijo</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {(variableMode[`body_${v}`] || "metadata") === "metadata" ? (
                        <Select value={variableMap[`body_${v}`] || ""} onValueChange={val => setVariableMap(p => ({...p, [`body_${v}`]: val}))}>
                          <SelectTrigger><SelectValue placeholder="Selecciona la columna..." /></SelectTrigger>
                          <SelectContent>{metadataKeysArray.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : (
                        <Input value={variableMap[`body_${v}`] || ""} onChange={e => setVariableMap(p => ({...p, [`body_${v}`]: e.target.value}))} placeholder="Texto para todos..." />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="mt-4 border-t pt-4">
            {!isSending ? (
               <div className="w-full flex gap-3">
                 <Button variant="outline" className="w-full" onClick={() => setIsCampaignDialogOpen(false)} disabled={progress > 0 && progress < 100}>
                   Cerrar
                 </Button>
                 <Button 
                   className="w-full" 
                   onClick={startCampaign}
                   disabled={!selectedTemplate || (progress > 0 && progress < 100)}
                 >
                   <Play className="w-4 h-4 mr-2" /> Enviar
                 </Button>
               </div>
            ) : (
              <Button variant="destructive" className="w-full" onClick={stopCampaign}>
                <StopCircle className="w-4 h-4 mr-2" /> Detener envíos
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
