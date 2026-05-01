"use client"

import { useState, useEffect, useCallback, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { 
  Plus, 
  Search, 
  Filter, 
  Download,
  MoreVertical,
  Mail,
  Phone,
  MessageSquare,
  FileText,
  Zap,
  RefreshCcw,
  User
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
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
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { getAsesorLeads } from "@/lib/queries/asesor"
import { createLead } from "@/lib/queries/director" // Reusing createLead which is generic
import { format } from "date-fns"
import { es } from "date-fns/locale"

export default function AsesorLeadsPage() {
  return (
    <Suspense fallback={
      <div className="flex h-full w-full items-center justify-center p-20">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    }>
      <AsesorLeadsPageContent />
    </Suspense>
  )
}

function AsesorLeadsPageContent() {
  const [leads, setLeads] = useState<Record<string, any>[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [sessionData, setSessionData] = useState<{ id: string, agencyId: string } | null>(null)
  const [selectedLead, setSelectedLead] = useState<any | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  
  const searchParams = useSearchParams()
  const leadIdFromUrl = searchParams.get("leadId")

  const supabase = createClient()

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('agency_id')
        .eq('id', session.user.id)
        .single()
      
      if (profile) {
        setSessionData({ id: session.user.id, agencyId: profile.agency_id })
      }

      const leadsData = await getAsesorLeads(session.user.id)
      setLeads(leadsData || [])
    } catch (_error) {
      console.error("Error fetching leads:", _error)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Handle leadId from URL
  useEffect(() => {
    if (leadIdFromUrl && leads.length > 0) {
      const lead = leads.find(l => l.id.toString() === leadIdFromUrl)
      if (lead) {
        setSelectedLead(lead)
        setIsDetailOpen(true)
      }
    }
  }, [leadIdFromUrl, leads])

  const filteredLeads = leads.filter(l => 
    l.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    l.email?.toLowerCase().includes(search.toLowerCase()) ||
    l.phone?.includes(search)
  )

  return (
    <div className="flex flex-col h-full space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Leads Tokko</h2>
          <p className="text-muted-foreground mt-1">
            Administra tus prospectos y consultas asignadas de Tokko Broker.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="hidden md:flex gap-2 bg-card/50 border-accent/10">
            <Download className="h-4 w-4" />
            <span className="hidden md:inline">Exportar</span>
          </Button>
          <AsesorLeadModal 
            isOpen={isModalOpen} 
            setIsOpen={setIsModalOpen} 
            sessionData={sessionData}
            onSuccess={fetchData} 
          />
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-card/30 backdrop-blur-md p-4 rounded-2xl border border-accent/10 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar por nombre, email o teléfono..." 
            className="pl-10 bg-background/50 border-none focus-visible:ring-accent/30"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          <Button variant="ghost" className="text-muted-foreground gap-2">
            <Filter className="h-4 w-4" />
            <span>Filtros avanzados</span>
          </Button>
        </div>
      </div>

      {/* Leads Table */}
      <div className="rounded-2xl border border-accent/10 bg-card/30 backdrop-blur-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-accent/5 border-accent/10">
              <TableHead>Nombre</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Etapa</TableHead>
              <TableHead>Fuente</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [1, 2, 3, 4, 5].map(i => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-10 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-10 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : filteredLeads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-48 text-center text-muted-foreground">
                  No se encontraron leads.
                </TableCell>
              </TableRow>
            ) : (
              filteredLeads.map((lead) => (
                <TableRow key={lead.id} className="hover:bg-accent/5 transition-colors border-accent/10 group">
                  <TableCell className="font-semibold">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8 border border-accent/20">
                        <AvatarFallback className="bg-accent/10 text-accent text-xs">
                          {lead.full_name?.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      {lead.full_name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col text-xs gap-1">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="h-3 w-3" /> {lead.email || "—"}
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="h-3 w-3" /> {lead.phone || "—"}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="bg-accent/10 text-accent border-none text-[10px] capitalize">
                      {lead.pipeline_stage?.replace("_", " ") || "nuevo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] border-accent/20">
                      {lead.source || "Web"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(lead.created_at), "d MMM, HH:mm", { locale: es })}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-card border-accent/20">
                        <DropdownMenuItem 
                          className="cursor-pointer"
                          onClick={() => {
                            setSelectedLead(lead)
                            setIsDetailOpen(true)
                          }}
                        >
                          Ver detalle
                        </DropdownMenuItem>
                        <DropdownMenuItem className="cursor-pointer text-destructive">Eliminar</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-2xl bg-card border-accent/20">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <User className="h-5 w-5 text-accent" />
              Detalle del Lead
            </DialogTitle>
            <DialogDescription>
              Información completa y gestión del contacto.
            </DialogDescription>
          </DialogHeader>
          
          {selectedLead && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Nombre Completo</Label>
                  <p className="font-semibold text-lg">{selectedLead.full_name}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Etapa Pipeline</Label>
                  <div>
                    <Badge variant="secondary" className="bg-accent/10 text-accent capitalize">
                      {selectedLead.pipeline_stage?.replace("_", " ") || "nuevo"}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Email</Label>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedLead.email || "—"}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Teléfono</Label>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedLead.phone || "—"}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Origen</Label>
                  <p>{selectedLead.source || selectedLead.tokko_origin || "Web"}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Fecha de Ingreso</Label>
                  <p>{format(new Date(selectedLead.created_at), "d 'de' MMMM, yyyy", { locale: es })}</p>
                </div>
              </div>

              {selectedLead.tokko_property_title && (
                <div className="p-4 rounded-xl bg-accent/5 border border-accent/10 space-y-2">
                  <Label className="text-[10px] text-accent font-bold uppercase tracking-widest">Propiedad de Interés (Tokko)</Label>
                  <h5 className="font-bold">{selectedLead.tokko_property_title}</h5>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{selectedLead.tokko_property_type}</span>
                    <span>{selectedLead.tokko_property_price}</span>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-accent/10">
                <Button variant="outline" onClick={() => setIsDetailOpen(false)}>Cerrar</Button>
                <Button className="bg-accent hover:bg-accent/90 gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Ir al Chat
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface AsesorLeadModalProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  sessionData: { id: string, agencyId: string } | null;
  onSuccess: () => void;
}

function AsesorLeadModal({ isOpen, setIsOpen, sessionData, onSuccess }: AsesorLeadModalProps) {
  const [activeTab, setActiveTab ] = useState("manual")
  const [loading, setLoading] = useState(false)
  const [aiAnalysis, setAiAnalysis] = useState<Record<string, any> | null>(null)
  
  const [formData, setFormData] = useState({
    full_name: "",
    phone: "",
    email: "",
    source: "Manual",
    notes: ""
  })

  const handleSubmitManual = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sessionData) return

    try {
      setLoading(true)
      await createLead({
        ...formData,
        agency_id: sessionData.agencyId,
        assigned_agent_id: sessionData.id,
        pipeline_stage: "nuevo"
      })
      toast.success("Lead creado correctamente")
      setIsOpen(false)
      onSuccess()
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
      
      if (data.analysis) {
        setAiAnalysis(data.analysis)
        setFormData(prev => ({
          ...prev,
          full_name: data.analysis.nombre || "Lead WA Incompleto",
          phone: data.analysis.telefono || "",
          source: "WhatsApp IA",
        }))
        toast.success("Chat procesado por Gemini IA")
      }
    } catch (_error) {
      toast.error("Error al procesar el chat con IA")
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitAI = async () => {
    if (!sessionData || !aiAnalysis) return
    try {
      setLoading(true)
      await createLead({
        full_name: formData.full_name,
        phone: formData.phone,
        source: "WhatsApp IA",
        agency_id: sessionData.agencyId,
        assigned_agent_id: sessionData.id,
        pipeline_stage: "nuevo",
        notes: "Perfil IA: " + JSON.stringify(aiAnalysis)
      })
      toast.success("Lead de IA importado correctamente")
      setIsOpen(false)
      onSuccess()
    } catch (_error) {
      toast.error("Error al guardar lead")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="bg-accent hover:bg-accent/90 text-white gap-2 font-semibold shadow-accent/20 shadow-lg">
          <Plus className="h-4 w-4" />
          Agregar Lead
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg border-accent/20 bg-card/95 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <User className="h-6 w-6 text-accent" />
            Ingreso de nuevo Lead
          </DialogTitle>
          <DialogDescription>
            Agrega prospectos manualmente o importa usando la I.A. 
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="grid grid-cols-3 bg-muted/50 p-1">
            <TabsTrigger value="manual" className="data-[state=active]:bg-accent data-[state=active]:text-white">Manual</TabsTrigger>
            <TabsTrigger value="wa" className="data-[state=active]:bg-[#25D366] data-[state=active]:text-white flex items-center gap-1">
              WA IA <Zap className="h-3 w-3" />
            </TabsTrigger>
            <TabsTrigger value="tokko" className="data-[state=active]:bg-foreground data-[state=active]:text-background">Tokko Sync</TabsTrigger>
          </TabsList>
          
          <TabsContent value="manual" className="pt-4 space-y-4">
            <form onSubmit={handleSubmitManual} className="space-y-4">
              <div className="grid gap-3">
                <Label htmlFor="name">Nombre y Apellido *</Label>
                <Input 
                  id="name" 
                  autoComplete="off"
                  required
                  value={formData.full_name} 
                  onChange={e => setFormData({...formData, full_name: e.target.value})} 
                  placeholder="Ej. Juan Pérez" 
                  className="bg-background/50 border-accent/20 focus-visible:ring-accent"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-3">
                  <Label htmlFor="phone">Teléfono / Celular</Label>
                  <Input 
                    id="phone" 
                    value={formData.phone} 
                    onChange={e => setFormData({...formData, phone: e.target.value})} 
                    placeholder="+54 9 11..." 
                    className="bg-background/50 border-accent/20 focus-visible:ring-accent"
                  />
                </div>
                <div className="grid gap-3">
                  <Label htmlFor="email">Email</Label>
                  <Input 
                    id="email" 
                    type="email" 
                    value={formData.email} 
                    onChange={e => setFormData({...formData, email: e.target.value})} 
                    placeholder="email@ejemplo.com" 
                    className="bg-background/50 border-accent/20 focus-visible:ring-accent"
                  />
                </div>
              </div>
              
              <Button type="submit" className="w-full bg-accent hover:bg-accent/90" disabled={loading}>
                {loading ? "Creando..." : "Registrar Lead Manual"}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="wa" className="pt-4 space-y-4">
            <div className="p-4 border border-dashed border-accent/40 bg-accent/5 rounded-xl text-center space-y-4">
              <MessageSquare className="h-8 w-8 text-accent mx-auto" />
              <div>
                <Label htmlFor="file-upload" className="cursor-pointer text-accent hover:underline font-semibold block">
                  Cargar Export de Chat de WhatsApp (.txt)
                </Label>
                <Input id="file-upload" type="file" accept=".txt" className="hidden" onChange={handleFileUpload} />
                <p className="text-xs text-muted-foreground mt-2">Gemini armará el perfil automáticamente</p>
              </div>
            </div>

            {aiAnalysis && (
              <div className="bg-card/50 p-4 border border-accent/20 rounded-xl space-y-3">
                <h4 className="font-semibold text-sm flex items-center gap-2 text-accent">
                  <Zap className="h-4 w-4" /> Análisis Generado
                </h4>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p><b className="text-foreground">Nombre detectado:</b> {aiAnalysis.nombre || "No detectado"}</p>
                  <p><b className="text-foreground">Teléfono detectado:</b> {aiAnalysis.telefono || "No detectado"}</p>
                  <p><b className="text-foreground">Interés:</b> {aiAnalysis.interes}</p>
                  <p><b className="text-foreground">Presupuesto/Zona:</b> USD {aiAnalysis.presupuesto} / {aiAnalysis.zona}</p>
                  <p><b className="text-foreground">Sentimiento:</b> {aiAnalysis.sentimiento}</p>
                </div>
                <Button onClick={handleSubmitAI} className="w-full bg-accent hover:bg-accent/90" disabled={loading}>
                  Confirmar e Importar
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="tokko" className="pt-4 flex flex-col items-center justify-center p-8 space-y-4 text-center">
            <div className="h-16 w-16 bg-muted/30 rounded-full flex items-center justify-center border border-dashed border-border">
              <RefreshCcw className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              Trae de Tokko automáticamente las consultas generadas en portales zonaprop/argenprop vinculadas a tus propiedades.
            </p>
            <Button variant="outline" className="gap-2 border-accent/20 text-accent hover:bg-accent/10">
              <RefreshCcw className="h-4 w-4" />
              Sincronizar mis Tokko Leads (Beta)
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
