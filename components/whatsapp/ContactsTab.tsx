"use client"

import { useState, useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { importContacts, sendCampaignMessage, updateContactCampaignStatus } from "@/app/actions/whatsapp"
import type { WATemplate, WAContact } from "@/types/whatsapp"
import { CampaignState } from "./CampaignState"
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
  const [templates, setTemplates] = useState<WATemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set())
  
  // Import State
  const [isImporting, setIsImporting] = useState(false)
  
  // Campaign Redirect State
  const [isRedirecting, setIsRedirecting] = useState(false)

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
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [{ data: contactsData, error: contactsError }, { data: templatesData, error: templatesError }] = await Promise.all([
        supabase
          .from('wa_contacts')
          .select('*')
          .eq('agency_id', instance.agency_id)
          .order('created_at', { ascending: false }),
        supabase
          .from('wa_templates')
          .select('*')
          .eq('agency_id', instance.agency_id)
      ])
      
      if (contactsError) throw contactsError
      if (templatesError) throw templatesError
      
      if (contactsData) setContacts(contactsData as WAContact[])
      if (templatesData) setTemplates(templatesData as WATemplate[])
    } catch (err) {
      console.error(err)
      toast.error("Error al cargar los datos")
    } finally {
      setLoading(false)
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
      await fetchData()
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


  const handleGoToCampaigns = () => {
    if (selectedContactIds.size === 0) {
      toast.error("Debes seleccionar al menos un contacto.")
      return
    }
    const selected = contacts.filter(c => selectedContactIds.has(c.id))
    CampaignState.setContacts(selected)
    
    // Switch to campanas tab using ID or fallback to selector
    const campanasTab = document.getElementById('trigger-campanas') as HTMLButtonElement || 
                        document.querySelector<HTMLButtonElement>('button[role="tab"][data-value="campanas"]')
                        
    if (campanasTab) {
      campanasTab.click()
    } else {
      toast.error("No se encontró la pestaña de Campañas.")
    }
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
              <Input id="contact_upload" type="file" accept=".csv, .xls, .xlsx" className="hidden" onChange={handleFileUpload} disabled={isImporting} />
            </Label>
            
            <Button 
              className="w-full sm:w-auto"
              disabled={selectedContactIds.size === 0} 
              onClick={handleGoToCampaigns}
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              Configurar Campaña ({selectedContactIds.size})
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
                  {templates.map(tmpl => (
                    <th key={tmpl.id} className="p-3 text-center font-medium text-muted-foreground">
                      {tmpl.template_name}
                    </th>
                  ))}
                  <th className="p-3 text-right font-medium text-muted-foreground">Último Envío</th>
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
                     {templates.map(tmpl => {
                       const campaignData = contact.campaign_statuses?.[tmpl.template_name]
                       
                       // Backward compatibility: might be a string if sent before this update
                       const status = typeof campaignData === 'string' ? campaignData : campaignData?.status
                       const sentAt = typeof campaignData === 'object' && campaignData?.sent_at ? campaignData.sent_at : null
                       
                       return (
                         <td key={tmpl.id} className="p-3 text-center">
                           {status ? (
                             <div className="flex flex-col items-center gap-1">
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
                               {sentAt && (
                                 <span className="text-[10px] text-muted-foreground">
                                   {new Date(sentAt).toLocaleDateString()}
                                 </span>
                               )}
                             </div>
                           ) : (
                             <span className="text-muted-foreground text-xs">-</span>
                           )}
                         </td>
                       )
                     })}
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
    </div>
  )
}
