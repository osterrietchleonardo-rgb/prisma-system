"use client"

import { useState, useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { importContacts, sendCampaignMessage, updateContactCampaignStatus, deleteContact } from "@/app/actions/whatsapp"
import { getClasificacionStyle } from "@/lib/whatsapp/clasificacion"
import { clasificacionesDe } from "@/lib/whatsapp/clasificaciones"
import { normalizeArgPhone } from "@/lib/whatsapp/phone-ar"
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
  Clock,
  Trash2
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
  /** Si es true, oculta las acciones de campaña (para rol asesor) */
  hideActions?: boolean;
}

export default function ContactsTab({ instance, hideActions = false }: ContactsTabProps) {
  const supabase = createClient()
  
  // Contacts State
  const [contacts, setContacts] = useState<WAContact[]>([])
  const [templates, setTemplates] = useState<WATemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [filterClasif, setFilterClasif] = useState("all")
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set())
  const [mounted, setMounted] = useState(false)

  // Import State
  const [isImporting, setIsImporting] = useState(false)
  const [importClasif, setImportClasif] = useState("")
  const [deletingContactId, setDeletingContactId] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 100
  
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
    setMounted(true)
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      // Traer TODOS los contactos paginando de a 1000 (PostgREST limita a 1000 por defecto).
      // Soporta bases grandes (15k+) sin perder filas.
      const PAGE = 1000
      const allContacts: WAContact[] = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('wa_contacts')
          .select('*')
          .eq('agency_id', instance.agency_id)
          .order('created_at', { ascending: false })
          .range(from, from + PAGE - 1)
        if (error) throw error
        if (!data || data.length === 0) break
        allContacts.push(...(data as WAContact[]))
        if (data.length < PAGE) break
      }

      const { data: templatesData, error: templatesError } = await supabase
        .from('wa_templates')
        .select('*')
        .eq('agency_id', instance.agency_id)
      if (templatesError) throw templatesError

      setContacts(allContacts)
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

    // 1. Columnas de teléfono: por nombre (acepta cualquier encabezado que contenga
    //    tel/cel/phone/whats/movil/numero, incluido csTelefono1, csTelefono2, etc.)
    const phoneRegex = /(tel|cel|phone|whats|movil|móvil|numero|número|contacto)/
    let phoneCols = cols.filter((_, i) => phoneRegex.test(lowerCols[i]))

    // 2. Si no se reconoció por nombre, detectar por VALOR: columnas cuyos valores
    //    parecen teléfonos (útil para encabezados raros o sin nombre claro).
    if (phoneCols.length === 0) {
      const sample = data.slice(0, 30)
      phoneCols = cols.filter(c => {
        let ok = 0, tot = 0
        for (const row of sample) {
          const v = row[c]
          if (v === undefined || v === null || String(v).trim() === '') continue
          tot++
          if (normalizeArgPhone(String(v))) ok++
        }
        return tot > 0 && ok / tot >= 0.6
      })
    }

    if (phoneCols.length === 0) {
       toast.error("❌ Archivo inválido: no encontré ninguna columna de teléfono/celular.")
       setIsImporting(false)
       return
    }

    // 3. Columna de nombre: OPCIONAL.
    let nCol = ""
    if (lowerCols.includes('nombre')) nCol = cols[lowerCols.indexOf('nombre')]
    else if (lowerCols.includes('name')) nCol = cols[lowerCols.indexOf('name')]
    else { const idx = lowerCols.findIndex(c => c.includes('nombre') || c.includes('apellido')); if (idx >= 0) nCol = cols[idx] }

    const newContacts = []
    let descartados = 0

    for (let i = 0; i < data.length; i++) {
        const row = data[i]

        // Tomar el PRIMER teléfono válido entre las columnas de teléfono detectadas.
        let phone: string | null = null
        for (const pc of phoneCols) {
          const cand = normalizeArgPhone(row[pc])
          if (cand) { phone = cand; break }
        }

        const name = nCol && row[nCol] ? String(row[nCol]).trim() : ""

        if (phone) {
           // El resto de columnas (sacando las de teléfono y nombre) van a metadata.
           const metadata = { ...row }
           phoneCols.forEach(pc => delete metadata[pc])
           if (nCol) delete metadata[nCol]

           newContacts.push({
             phone,
             name,
             metadata,
             tags: []
           })
        } else {
           descartados++
        }
    }

    if (newContacts.length === 0) {
      toast.error("No se encontraron contactos válidos en el archivo.")
      setIsImporting(false)
      return
    }

    toast.loading(`Importando ${newContacts.length} contactos...`, { id: "import-toast" })
    
    const res = await importContacts(newContacts, importClasif)
    if (res.success) {
      const inserted = res.data?.inserted ?? newContacts.length
      const skipped = res.data?.skipped ?? 0
      toast.success(
        `${inserted} contacto(s) nuevo(s) importado(s)${skipped ? ` · ${skipped} repetido(s) omitido(s)` : ''}${descartados ? ` · ${descartados} con teléfono inválido` : ''}.`,
        { id: "import-toast" }
      )
      setImportClasif("")
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


  const handleDeleteContact = async (contact: WAContact) => {
    const label = contact.name || contact.phone
    if (!window.confirm(`¿Eliminar el contacto "${label}" de la agenda?\n\nSolo se quita de "Contactos" (no borra chats ni conversaciones).`)) {
      return
    }
    setDeletingContactId(contact.id)
    const res = await deleteContact(contact.id)
    setDeletingContactId(null)
    if (res.success) {
      setContacts(prev => prev.filter(c => c.id !== contact.id))
      setSelectedContactIds(prev => {
        const next = new Set(prev)
        next.delete(contact.id)
        return next
      })
      toast.success("Contacto eliminado de la agenda")
    } else {
      toast.error(res.error || "Error al eliminar el contacto")
    }
  }

  const handleGoToCampaigns = () => {
    if (selectedContactIds.size === 0) {
      toast.error("Debes seleccionar al menos un contacto.")
      return
    }
    const selected = contacts.filter(c => selectedContactIds.has(c.id))
    CampaignState.setContacts(selected)
    
    // Switch to campanas tab using React state (synced via CampaignState)
    CampaignState.setActiveTab('campanas')
  }

  // Las opciones salen de TODAS las clasificaciones que tuvo cada lead, no solo la de
  // origen: si importaste una lista "Oferta-Julio", tiene que poder elegirse aunque
  // esos contactos hayan entrado antes como "Whatsapp-Consulta".
  const clasifOptions = Array.from(
    new Set(contacts.flatMap(c => clasificacionesDe(c)))
  ).sort()

  const filteredContacts = contacts.filter(c => {
    // Un lead aparece en el filtro de CUALQUIERA de sus clasificaciones: el que entró
    // por consulta y después recibió la campaña "Oferta" sale en los dos.
    const todas = clasificacionesDe(c)
    if (filterClasif !== "all") {
      if (filterClasif === "__none__") {
        if (todas.length > 0) return false
      } else if (!todas.includes(filterClasif)) {
        return false
      }
    }
    const q = searchTerm.toLowerCase()
    if (!q) return true
    return (
      c.name?.toLowerCase().includes(q) ||
      c.phone.includes(searchTerm) ||
      todas.some(t => t.toLowerCase().includes(q))
    )
  })

  // Paginación (para no renderizar miles de filas de una sola vez)
  const pageCount = Math.max(1, Math.ceil(filteredContacts.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const pagedContacts = filteredContacts.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE)

  // Reset de página al cambiar búsqueda/filtro
  useEffect(() => { setPage(0) }, [searchTerm, filterClasif])

  if (loading) {
    return <div className="h-full flex items-center justify-center"><RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
         <div>
           <h2 className="text-2xl font-semibold tracking-tight">Contactos y Base de Datos</h2>
           <p className="text-sm text-muted-foreground mt-1">
             {hideActions
               ? "Tu lista de contactos. Importá y gestioná tus leads de WhatsApp."
               : "Sube tus leads, gestiona tu base y lanza campañas personalizadas de WhatsApp con trazabilidad."}
           </p>
         </div>
         <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <div className="flex flex-col gap-1 w-full sm:w-auto">
              <Input
                placeholder="Clasificación del lote (ej: Base Expo 2026)"
                value={importClasif}
                onChange={(e) => setImportClasif(e.target.value)}
                className="h-10 w-full sm:w-[230px] bg-background"
                disabled={isImporting}
              />
              <span className="text-[10px] text-muted-foreground px-1">Se aplica a los contactos del próximo archivo. Si lo dejás vacío: &quot;Importado&quot;.</span>
            </div>
            <Label htmlFor="contact_upload" className="inline-flex h-10 items-center justify-center whitespace-nowrap rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 px-4 py-2 text-sm font-medium transition-colors cursor-pointer w-full sm:w-auto">
              {isImporting ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Importar Contactos
              <Input id="contact_upload" type="file" accept=".csv, .xls, .xlsx" className="hidden" onChange={handleFileUpload} disabled={isImporting} />
            </Label>
            
            {!hideActions && (
              <Button 
                className="w-full sm:w-auto"
                disabled={selectedContactIds.size === 0} 
                onClick={handleGoToCampaigns}
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Configurar Campaña ({selectedContactIds.size})
              </Button>
            )}
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
          <Select value={filterClasif} onValueChange={setFilterClasif}>
            <SelectTrigger className="w-[220px] bg-background">
              <SelectValue placeholder="Filtrar por clasificación" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las clasificaciones</SelectItem>
              <SelectItem value="__none__">Sin clasificar</SelectItem>
              {clasifOptions.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="text-sm text-muted-foreground flex items-center gap-2 ml-auto">
             <Users className="w-4 h-4" />
             {filteredContacts.length} / {contacts.length} contactos
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
                  <th className="p-3 text-left font-medium text-muted-foreground">Clasificación</th>
                  {templates.map(tmpl => (
                    <th key={tmpl.id} className="p-3 text-center font-medium text-muted-foreground">
                      {tmpl.template_name}
                    </th>
                  ))}
                  <th className="p-3 text-right font-medium text-muted-foreground">Último Envío</th>
                  <th className="p-3 text-right font-medium text-muted-foreground">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pagedContacts.map((contact) => (
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
                       {(() => {
                         // Todas las clasificaciones por las que pasó el lead, en orden:
                         // 1. de dónde vino, 2. en qué listas lo importaste, 3. qué
                         // plantillas recibió. Numeradas para que se lea el recorrido.
                         const todas = clasificacionesDe(contact)
                         if (todas.length === 0) {
                           const cl = getClasificacionStyle(null)
                           return (
                             <Badge variant="outline" className={`text-[9px] font-bold px-1.5 py-0 whitespace-nowrap ${cl.className}`}>
                               {cl.label}
                             </Badge>
                           )
                         }
                         return (
                           <div className="flex flex-wrap items-center gap-1 max-w-[240px]">
                             {todas.map((valor, i) => {
                               const cl = getClasificacionStyle(valor)
                               return (
                                 <Badge
                                   key={valor}
                                   variant="outline"
                                   title={i === 0 ? "Origen del lead" : `Clasificación ${i + 1}`}
                                   className={`text-[9px] font-bold px-1.5 py-0 whitespace-nowrap ${cl.className}`}
                                 >
                                   <span className="opacity-60 mr-0.5">{i + 1}.</span>
                                   {cl.label}
                                 </Badge>
                               )
                             })}
                           </div>
                         )
                       })()}
                     </td>
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
                                    status === "error" ? "destructive" :
                                    status === "en_cola" ? "outline" : "outline"
                                 }
                                 className={
                                    status === "enviado" ? "bg-green-500 hover:bg-green-600 text-white" :
                                    status === "en_cola" ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30" : ""
                                 }
                               >
                                 {status === "en_cola" ? "EN COLA" : status.toUpperCase()}
                               </Badge>
                               {sentAt && (
                                 <span className="text-[10px] text-muted-foreground">
                                   {mounted ? new Date(sentAt).toLocaleDateString() : ""}
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
                       {mounted && contact.last_campaign_sent_at ? new Date(contact.last_campaign_sent_at).toLocaleDateString() : '-'}
                     </td>
                     <td className="p-3 text-right">
                       <Button
                         variant="ghost"
                         size="icon"
                         className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                         disabled={deletingContactId === contact.id}
                         onClick={() => handleDeleteContact(contact)}
                         title="Eliminar contacto de la agenda"
                       >
                         <Trash2 className="h-4 w-4" />
                       </Button>
                     </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {filteredContacts.length > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-2 p-3 border-t bg-muted/10 text-sm">
            <span className="text-xs text-muted-foreground">
              Mostrando {currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, filteredContacts.length)} de {filteredContacts.length}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>
                Anterior
              </Button>
              <span className="text-xs text-muted-foreground">Página {currentPage + 1} / {pageCount}</span>
              <Button variant="outline" size="sm" disabled={currentPage >= pageCount - 1} onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}>
                Siguiente
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
