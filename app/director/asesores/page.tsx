"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { 
  UserPlus, 
  Search, 
  MoreVertical, 
  Copy, 
  Check, 
  XCircle, 
  TrendingUp, 
  Target, 
  Home,
  QrCode,
  Zap,
  Briefcase,
  PauseCircle,
  PlayCircle,
  AlertTriangle,
  Trash2,
  Filter,
  Users,
  RotateCcw
} from "lucide-react"
import { getAgentPerformanceAction, getAgencyAdvisorsPerformanceAction } from "@/app/actions/performance"
import { desvincularAsesor, pausarAsesor, reanudarAsesor, getUltimaAccionPausa, setClasificacionAsesor, getHuellaDatosAsesor, eliminarAsesorDefinitivamente, actualizarDatosAsesor, type ClasificacionAsesor } from "@/app/actions/asesores"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog"
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetDescription 
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DocumentosDelAsesor } from "@/components/asesor-docs/DocumentosDelAsesor"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase"
import { QRCodeSVG } from "qrcode.react"
import { NuevoCodigoDialog } from "@/components/director/NuevoCodigoDialog"
import { VerifiedPhoneField, type VerifiedPhoneValue } from "@/components/shared/VerifiedPhoneField"
import { normalizePhoneE164, formatPhoneInternational } from "@/lib/whatsapp/phone"
import type { CountryCode } from "libphonenumber-js"
// import { cn } from "@/lib/utils" // Unused

// Clasificaciones que el director puede asignar a cada asesor.
// Si no elige ninguna, el asesor queda simplemente como "Asesor".
const CLASIFICACIONES: { valor: ClasificacionAsesor; label: string }[] = [
  { valor: "client_director", label: "Client Director" },
  { valor: "client_support", label: "Client Support" },
]

const labelClasificacion = (valor?: string | null) =>
  CLASIFICACIONES.find((c) => c.valor === valor)?.label ?? "Asesor"

export default function AsesoresPage() {
  const [agents, setAgents] = useState<Record<string, any>[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [selectedAdvisorFilter, setSelectedAdvisorFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [dialogoCodigoAbierto, setDialogoCodigoAbierto] = useState(false)
  const [inviteCode, setInviteCode] = useState("")
  // De quién es el "Último código libre": se muestra al lado del código para
  // que el director sepa a quién se lo está por mandar antes de copiarlo.
  const [inviteName, setInviteName] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState<Record<string, any> | null>(null)
  const [agentKpis, setAgentKpis] = useState<any>(null)
  const [loadingKpis, setLoadingKpis] = useState(false)
  const [perfMap, setPerfMap] = useState<Record<string, any>>({})
  const [desvinculando, setDesvinculando] = useState<string | null>(null)
  // Diálogo de pausa: asesor elegido + motivo
  const [agentToPause, setAgentToPause] = useState<Record<string, any> | null>(null)
  const [pauseReason, setPauseReason] = useState("")
  const [pausing, setPausing] = useState(false)
  const [reanudando, setReanudando] = useState<string | null>(null)
  // Asesor cuya clasificación se está guardando (para deshabilitar sus botones)
  const [clasificando, setClasificando] = useState<string | null>(null)
  // Diálogo de desvinculación: asesor elegido + motivo
  const [agentToUnlink, setAgentToUnlink] = useState<Record<string, any> | null>(null)

  // Borrado definitivo (duplicados / cargas por error)
  const [agentToDelete, setAgentToDelete] = useState<Record<string, any> | null>(null)
  const [deleteReason, setDeleteReason] = useState("")
  const [borrando, setBorrando] = useState<string | null>(null)
  const [verificandoHuella, setVerificandoHuella] = useState(false)
  const [huella, setHuella] = useState<{ puedeBorrarse: boolean; bloqueantes: { etiqueta: string; filas: number }[] } | null>(null)
  const [unlinkReason, setUnlinkReason] = useState("")
  // Info de la pausa vigente del asesor abierto en el panel (motivo/fecha/quién)
  const [pauseInfo, setPauseInfo] = useState<{ motivo: string | null; created_at: string; ejecutado_por_nombre: string | null } | null>(null)

  // Edición de nombre/celular del asesor (el email no se toca)
  const [editandoDatos, setEditandoDatos] = useState<Record<string, any> | null>(null)
  const [nombreEdit, setNombreEdit] = useState("")
  const [phoneEdit, setPhoneEdit] = useState<VerifiedPhoneValue>({ phone: "", phoneConfirm: "", country: "AR" as CountryCode })
  const [guardandoDatos, setGuardandoDatos] = useState(false)

  const supabase = createClient()
  const [agencyId, setAgencyId] = useState<string | null>(null)

  useEffect(() => {
    const getAgency = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('agency_id')
          .eq('id', user.id)
          .single()
        
        if (profile?.agency_id) {
          setAgencyId(profile.agency_id)
        }
      }
    }
    getAgency()
  }, [supabase])

  const fetchAgents = useCallback(async () => {
    if (!agencyId) return
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from("profiles")
        .select(`
          *,
          assigned_leads:leads(count),
          closings:closings(count)
        `)
        .eq("agency_id", agencyId)
        .eq("role", "asesor")
        .order("full_name")

      if (error) throw error
      
      // Último código de ASESOR sin usar, y que además tenga email: eso es lo
      // que garantiza que esté atado a una persona concreta y sea intransferible.
      // Sin el filtro por email entraban también los códigos que el sistema crea
      // solos al fundar una agencia (esos SÍ son transferibles a cualquiera) y,
      // sin el filtro por role, los códigos de director generados desde
      // Configuración —que esta pantalla ni siquiera debería poder ofrecer—.
      const { data: invite } = await supabase
        .from("agency_invites")
        .select("code, invitee_name")
        .eq("agency_id", agencyId)
        .eq("role", "asesor")
        .eq("is_used", false)
        .not("invitee_email", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      setInviteCode(invite?.code || "")
      setInviteName(invite?.invitee_name || null)
      setAgents(data || [])

      // Performance real (de performance_logs) para las tarjetas
      try {
        const advisors = await getAgencyAdvisorsPerformanceAction()
        const map: Record<string, any> = {}
        for (const a of advisors) map[a.id] = a
        setPerfMap(map)
      } catch (perfErr) {
        console.error("Error cargando performance de asesores:", perfErr)
      }
    } catch (_error) {
      toast.error("Error al cargar asesores")
    } finally {
      setLoading(false)
    }
  }, [supabase, agencyId])

  // Confirmada la desvinculación desde el diálogo (con motivo obligatorio).
  const handleConfirmDesvincular = async () => {
    if (!agentToUnlink) return
    if (!unlinkReason.trim()) {
      toast.error("Escribí el motivo de la desvinculación")
      return
    }
    try {
      setDesvinculando(agentToUnlink.id)
      await desvincularAsesor(agentToUnlink.id, unlinkReason)
      toast.success("Asesor desvinculado. Ya no puede acceder al sistema.")
      setAgentToUnlink(null)
      setUnlinkReason("")
      setSelectedAgent(null)
      fetchAgents()
    } catch (e: any) {
      toast.error(e.message || "Error al desvincular asesor")
    } finally {
      setDesvinculando(null)
    }
  }

  // Al abrir el diálogo de borrado se mide qué tiene el perfil encima, para
  // mostrárselo al director antes de que confirme. La autorización real la
  // vuelve a hacer el servidor: esto es solo para la pantalla.
  const abrirDialogoBorrado = async (agent: Record<string, any>) => {
    setAgentToDelete(agent)
    setDeleteReason("")
    setHuella(null)
    setVerificandoHuella(true)
    try {
      setHuella(await getHuellaDatosAsesor(agent.id))
    } catch (e: any) {
      toast.error(e.message || "No se pudo verificar el asesor")
      setAgentToDelete(null)
    } finally {
      setVerificandoHuella(false)
    }
  }

  // Confirmado el borrado definitivo (con motivo obligatorio).
  const handleConfirmBorrado = async () => {
    if (!agentToDelete) return
    if (!deleteReason.trim()) {
      toast.error("Escribí el motivo del borrado")
      return
    }
    try {
      setBorrando(agentToDelete.id)
      const res = await eliminarAsesorDefinitivamente(agentToDelete.id, deleteReason)
      toast.success(`Perfil de ${res.borrado.nombre || res.borrado.email} eliminado definitivamente.`)
      setAgentToDelete(null)
      setDeleteReason("")
      setSelectedAgent(null)
      fetchAgents()
    } catch (e: any) {
      toast.error(e.message || "Error al eliminar el perfil")
    } finally {
      setBorrando(null)
    }
  }

  // Confirmada la pausa desde el diálogo (con motivo obligatorio).
  const handleConfirmPausar = async () => {
    if (!agentToPause) return
    if (!pauseReason.trim()) {
      toast.error("Escribí el motivo de la pausa")
      return
    }
    try {
      setPausing(true)
      await pausarAsesor(agentToPause.id, pauseReason)
      toast.success("Asesor pausado. No podrá acceder hasta que lo reactives.")
      setAgentToPause(null)
      setPauseReason("")
      setSelectedAgent(null)
      fetchAgents()
    } catch (e: any) {
      toast.error(e.message || "Error al pausar asesor")
    } finally {
      setPausing(false)
    }
  }

  const handleReanudar = async (agent: Record<string, any>) => {
    try {
      setReanudando(agent.id)
      await reanudarAsesor(agent.id)
      toast.success("Asesor reactivado. Ya puede volver a ingresar.")
      setSelectedAgent(null)
      fetchAgents()
    } catch (e: any) {
      toast.error(e.message || "Error al reactivar asesor")
    } finally {
      setReanudando(null)
    }
  }

  // Clasifica al asesor. Si toca el botón que ya estaba activo, lo deselecciona
  // (vuelve a quedar como "Asesor").
  const handleClasificar = async (agent: Record<string, any>, valor: ClasificacionAsesor) => {
    const nuevo = agent.clasificacion === valor ? null : valor
    try {
      setClasificando(agent.id)
      await setClasificacionAsesor(agent.id, nuevo)
      setAgents((prev) => prev.map((a) => (a.id === agent.id ? { ...a, clasificacion: nuevo } : a)))
      setSelectedAgent((prev) => (prev?.id === agent.id ? { ...prev, clasificacion: nuevo } : prev))
      toast.success(nuevo ? `Clasificado como ${labelClasificacion(nuevo)}` : "Clasificación quitada. Queda como Asesor.")
    } catch (e: any) {
      toast.error(e.message || "Error al clasificar al asesor")
    } finally {
      setClasificando(null)
    }
  }

  // Abre el diálogo de edición de datos con el nombre precargado y el celular
  // en blanco (blanco = "no lo toques", nunca se precarga para no tentar a
  // "reescribirlo mal" sin darse cuenta).
  const abrirEdicionDatos = (agent: Record<string, any>) => {
    setNombreEdit(agent.full_name ?? "")
    setPhoneEdit({ phone: "", phoneConfirm: "", country: "AR" as CountryCode })
    setEditandoDatos(agent)
  }

  const guardarDatos = async () => {
    if (!editandoDatos) return
    const e164 = normalizePhoneE164(phoneEdit.phone, phoneEdit.country)
    const confirm164 = normalizePhoneE164(phoneEdit.phoneConfirm, phoneEdit.country)
    const tocaCelular = phoneEdit.phone.trim() !== ""

    if (tocaCelular && (!e164 || e164 !== confirm164)) {
      toast.error("Revisá el celular: tiene que ser válido y estar escrito igual las dos veces")
      return
    }
    try {
      setGuardandoDatos(true)
      await actualizarDatosAsesor(editandoDatos.id, {
        full_name: nombreEdit,
        ...(tocaCelular && e164 ? { phone: e164 } : {}),
      })
      toast.success("Datos actualizados")
      setEditandoDatos(null)
      setSelectedAgent(null)
      fetchAgents()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "No se pudieron guardar los datos")
    } finally {
      setGuardandoDatos(false)
    }
  }

  useEffect(() => {
    fetchAgents()
  }, [fetchAgents])

  useEffect(() => {
    // Si el asesor abierto está pausado, traemos el motivo/fecha/quién de la pausa.
    const fetchPauseInfo = async () => {
      if (!selectedAgent || selectedAgent.estado !== "pausado") {
        setPauseInfo(null)
        return
      }
      try {
        const info = await getUltimaAccionPausa(selectedAgent.id)
        setPauseInfo(info)
      } catch {
        setPauseInfo(null)
      }
    }
    fetchPauseInfo()
  }, [selectedAgent])

  useEffect(() => {
    const fetchAgentPerformance = async () => {
      if (!selectedAgent) {
        setAgentKpis(null)
        return
      }
      try {
        setLoadingKpis(true)
        const kpis = await getAgentPerformanceAction(selectedAgent.id)
        setAgentKpis(kpis)
      } catch (error) {
        console.error("Error fetching agent performance:", error)
      } finally {
        setLoadingKpis(false)
      }
    }
    fetchAgentPerformance()
  }, [selectedAgent])

  const copyToClipboard = () => {
    navigator.clipboard.writeText(inviteCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success("Código copiado")
  }

  const sortedAdvisorOptions = useMemo(() => {
    return [...agents].sort((a, b) => 
      (a.full_name || "").localeCompare(b.full_name || "", "es", { sensitivity: "base" })
    )
  }, [agents])

  const filteredAgents = useMemo(() => {
    return agents.filter((agent) => {
      // 1. Búsqueda por texto (nombre o email)
      const matchesSearch =
        !search.trim() ||
        agent.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        agent.email?.toLowerCase().includes(search.toLowerCase())

      // 2. Filtro por Asesor específico
      const matchesAdvisor =
        selectedAdvisorFilter === "all" || agent.id === selectedAdvisorFilter

      // 3. Filtro por Estado (activo, pausado, eliminado)
      const matchesStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "activo"
          ? agent.estado !== "pausado" && agent.estado !== "eliminado"
          : statusFilter === "pausado"
          ? agent.estado === "pausado"
          : statusFilter === "eliminado"
          ? agent.estado === "eliminado"
          : true

      return matchesSearch && matchesAdvisor && matchesStatus
    })
  }, [agents, search, selectedAdvisorFilter, statusFilter])

  const hasActiveFilters = search.trim() !== "" || selectedAdvisorFilter !== "all" || statusFilter !== "all"

  const resetFilters = () => {
    setSearch("")
    setSelectedAdvisorFilter("all")
    setStatusFilter("all")
  }

  return (
    <div className="flex flex-col h-full space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            Equipo de Asesores
            <Badge variant="secondary" className="bg-accent/10 text-accent font-medium border-none">
              {hasActiveFilters ? `${filteredAgents.length} de ${agents.length}` : `${agents.length}`} Miembros
            </Badge>
          </h2>
          <p className="text-muted-foreground mt-1">
            Gestiona tu equipo comercial y mide su performance en tiempo real.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={isInviteModalOpen} onOpenChange={setIsInviteModalOpen}>
            <DialogTrigger asChild>
              <Button className="bg-accent hover:bg-accent/90 gap-2">
                <UserPlus className="h-4 w-4" />
                Invitar Asesor
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-accent/20">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold">Invitar al equipo</DialogTitle>
                <DialogDescription>
                  Cada código se genera para una persona concreta y solo le sirve a ella.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 py-4">
                {inviteCode ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Último código libre</p>
                    {inviteName && (
                      <p className="text-sm font-medium">
                        Para: <span className="text-accent">{inviteName}</span>
                      </p>
                    )}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-accent/5 p-3 rounded-xl border border-accent/20 font-mono text-center text-lg font-bold tracking-widest text-accent">
                        {inviteCode}
                      </div>
                      <Button variant="outline" size="icon" className="h-12 w-12" onClick={copyToClipboard}>
                        {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="py-8 flex flex-col items-center justify-center text-center space-y-3">
                    <QrCode className="h-12 w-12 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">No hay ningún código libre.</p>
                  </div>
                )}

                <Button
                  className="w-full bg-accent gap-2"
                  onClick={() => {
                    setIsInviteModalOpen(false)
                    setDialogoCodigoAbierto(true)
                  }}
                >
                  <UserPlus className="h-4 w-4" />
                  Generar código para un asesor
                </Button>
              </div>

              <DialogFooter>
                <Button variant="secondary" className="w-full" onClick={() => setIsInviteModalOpen(false)}>
                  Listo
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Barra de Filtros (Búsqueda, Asesor ordenado alfabéticamente, Estado) */}
      <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 mb-4">
        {/* Búsqueda por texto */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar por nombre o email..." 
            className="pl-9 bg-card/50 border-accent/10 focus-visible:ring-accent"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Filtro por Asesor (Orden Alfabético) */}
        <div className="w-full sm:w-[220px]">
          <Select value={selectedAdvisorFilter} onValueChange={setSelectedAdvisorFilter}>
            <SelectTrigger className="bg-card/50 border-accent/10 focus:ring-accent">
              <div className="flex items-center gap-2 truncate">
                <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                <SelectValue placeholder="Todos los asesores" />
              </div>
            </SelectTrigger>
            <SelectContent className="bg-card border-accent/20 max-h-[300px]">
              <SelectItem value="all" className="cursor-pointer font-medium">
                Todos los asesores
              </SelectItem>
              {sortedAdvisorOptions.map((agent) => (
                <SelectItem key={agent.id} value={agent.id} className="cursor-pointer">
                  {agent.full_name || agent.email || "Sin nombre"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Filtro por Estado */}
        <div className="w-full sm:w-[200px]">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="bg-card/50 border-accent/10 focus:ring-accent">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
                <SelectValue placeholder="Todos los estados" />
              </div>
            </SelectTrigger>
            <SelectContent className="bg-card border-accent/20">
              <SelectItem value="all" className="cursor-pointer font-medium">
                Todos los estados
              </SelectItem>
              <SelectItem value="activo" className="cursor-pointer">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-green-500"></span>
                  Activo
                </span>
              </SelectItem>
              <SelectItem value="pausado" className="cursor-pointer">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                  Pausado
                </span>
              </SelectItem>
              <SelectItem value="eliminado" className="cursor-pointer">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-destructive"></span>
                  Deshabilitado
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Botón limpiar filtros */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            onClick={resetFilters}
            className="h-10 px-3 text-xs text-muted-foreground hover:text-foreground gap-1.5 self-start sm:self-auto"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Limpiar filtros
          </Button>
        )}
      </div>

      {loading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 pt-4">
          {[1,2,3,4].map(i => (
            <Card key={i} className="border-accent/10 bg-card/30">
              <CardHeader className="flex flex-row items-center gap-4">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : filteredAgents.length === 0 ? (
        <div className="py-16 text-center bg-card/20 rounded-2xl border border-dashed border-accent/15 space-y-3 mt-4">
          <Users className="h-12 w-12 text-muted-foreground/30 mx-auto" />
          <p className="text-base font-semibold text-foreground">No se encontraron asesores</p>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            No hay ningún asesor que coincida con los filtros aplicados.
          </p>
          {hasActiveFilters && (
            <Button variant="outline" size="sm" onClick={resetFilters} className="mt-2 border-accent/20">
              Limpiar filtros
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 pt-4">
          {filteredAgents.map((agent) => (
            <Card 
              key={agent.id} 
              className="group border-accent/10 bg-card/40 backdrop-blur-sm hover:border-accent/40 transition-all hover:shadow-xl cursor-pointer overflow-hidden"
              onClick={() => setSelectedAgent(agent)}
            >
              <CardHeader className="p-5 pb-2">
                <div className="flex justify-between items-start">
                  <Avatar className="h-14 w-14 border-2 border-accent/20 transition-transform group-hover:scale-110">
                    <AvatarImage src={agent.avatar_url} />
                    <AvatarFallback className="bg-accent/10 text-accent font-bold text-lg">
                      {agent.full_name?.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-card border-accent/20">
                      {agent.estado === "pausado" ? (
                        <DropdownMenuItem
                          className="text-green-600 cursor-pointer"
                          disabled={reanudando === agent.id}
                          onClick={(e) => { e.stopPropagation(); handleReanudar(agent); }}
                        >
                          <PlayCircle className="h-4 w-4 mr-2" /> Reactivar asesor
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          className="text-amber-600 cursor-pointer"
                          onClick={(e) => { e.stopPropagation(); setAgentToPause(agent); setPauseReason(""); }}
                        >
                          <PauseCircle className="h-4 w-4 mr-2" /> Pausar asesor
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        className="text-destructive cursor-pointer"
                        disabled={desvinculando === agent.id}
                        onClick={(e) => { e.stopPropagation(); setAgentToUnlink(agent); setUnlinkReason(""); }}
                      >
                        <XCircle className="h-4 w-4 mr-2" /> Desvincular asesor
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive cursor-pointer"
                        disabled={borrando === agent.id}
                        onClick={(e) => { e.stopPropagation(); abrirDialogoBorrado(agent); }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Eliminar definitivamente
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="mt-4">
                  <h3 className="font-bold text-lg leading-tight group-hover:text-accent transition-colors">{agent.full_name}</h3>
                  <p className="text-xs text-muted-foreground line-clamp-1">{agent.email}</p>
                </div>
              </CardHeader>
              <CardContent className="p-5 pt-4 space-y-4">
                {/* Clasificación del asesor (se puede seleccionar y deseleccionar) */}
                <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
                  <p className="text-[10px] uppercase font-bold text-muted-foreground">
                    Rol: <span className="text-foreground">{labelClasificacion(agent.clasificacion)}</span>
                  </p>
                  <div className="flex gap-1.5">
                    {CLASIFICACIONES.map(({ valor, label }) => {
                      const activo = agent.clasificacion === valor
                      return (
                        <Button
                          key={valor}
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={clasificando === agent.id}
                          onClick={(e) => { e.stopPropagation(); handleClasificar(agent, valor) }}
                          className={`h-7 flex-1 px-2 text-[10px] font-semibold ${
                            activo
                              ? "bg-accent/15 text-accent border-accent/40 hover:bg-accent/20"
                              : "border-accent/10 text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {activo && <Check className="h-3 w-3 mr-1" />}
                          {label}
                        </Button>
                      )
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col items-center p-2 rounded-lg bg-accent/5 border border-accent/10">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Capt.</span>
                    <span className="font-bold text-accent">{perfMap[agent.id]?.captaciones ?? 0}</span>
                  </div>
                  <div className="flex flex-col items-center p-2 rounded-lg bg-green-500/5 border border-green-500/10">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Cierres</span>
                    <span className="font-bold text-green-500">{perfMap[agent.id]?.transacciones ?? 0}</span>
                  </div>
                  <div className="flex flex-col items-center p-2 rounded-lg bg-blue-500/5 border border-blue-500/10">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Cartera</span>
                    <span className="font-bold text-blue-500">{perfMap[agent.id]?.cartera_activa ?? 0}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px]">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Target className="h-3 w-3" />
                    Rotación: <span className="text-foreground font-bold">{(perfMap[agent.id]?.rotacion ?? 0).toFixed(1)}%</span>
                  </div>
                  {agent.estado === "eliminado" ? (
                    <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/10 border-none px-2 py-0 text-[10px]">
                      Desvinculado
                    </Badge>
                  ) : agent.estado === "pausado" ? (
                    <Badge className="bg-amber-500/10 text-amber-600 hover:bg-amber-500/10 border-none px-2 py-0 text-[10px]">
                      Pausado
                    </Badge>
                  ) : (
                    <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/10 border-none px-2 py-0 text-[10px]">
                      Activo
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Performance Side Panel */}
      <Sheet open={!!selectedAgent} onOpenChange={() => setSelectedAgent(null)}>
        {/* En columna: el encabezado ocupa lo suyo y el cuerpo se queda con lo que sobre.
            Antes el cuerpo tenía un alto máximo escrito a mano (100vh - 250px) que sólo
            cerraba con el encabezado de aquel momento: al crecer el encabezado, la zona
            con scroll terminaba por debajo del borde de la pantalla y esos píxeles no se
            podían alcanzar de ninguna forma. Medido: 42px cortados en escritorio y 102px
            en pantalla angosta, donde el encabezado se acomoda en más líneas. */}
        <SheetContent className="bg-card border-accent/20 sm:max-w-md flex flex-col">
          <SheetHeader className="shrink-0">
            <div className="flex flex-col items-center text-center space-y-4 mb-4">
              <Avatar className="h-24 w-24 border-4 border-accent/20">
                <AvatarImage src={selectedAgent?.avatar_url} />
                <AvatarFallback className="text-2xl font-bold bg-accent/10 text-accent">
                  {selectedAgent?.full_name?.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-1">
                <SheetTitle className="text-2xl font-bold">{selectedAgent?.full_name}</SheetTitle>
                <SheetDescription>{selectedAgent?.email}</SheetDescription>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {selectedAgent?.estado === "pausado" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 text-green-600 border-green-500/20 hover:bg-green-500/10"
                    disabled={reanudando === selectedAgent?.id}
                    onClick={() => selectedAgent && handleReanudar(selectedAgent)}
                  >
                    <PlayCircle className="h-3 w-3" /> Reactivar asesor
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 text-amber-600 border-amber-500/20 hover:bg-amber-500/10"
                    onClick={() => { if (selectedAgent) { setAgentToPause(selectedAgent); setPauseReason("") } }}
                  >
                    <PauseCircle className="h-3 w-3" /> Pausar asesor
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-destructive border-destructive/20 hover:bg-destructive/10"
                  disabled={desvinculando === selectedAgent?.id}
                  onClick={() => { if (selectedAgent) { setAgentToUnlink(selectedAgent); setUnlinkReason("") } }}
                >
                  <XCircle className="h-3 w-3" /> Desvincular asesor
                </Button>
              </div>

              {/* Aviso de pausa vigente con su trazabilidad */}
              {selectedAgent?.estado === "pausado" && (
                <div className="w-full rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-left text-xs text-amber-700 space-y-1">
                  <p className="font-bold flex items-center gap-1">
                    <PauseCircle className="h-3.5 w-3.5" /> Asesor pausado
                  </p>
                  {pauseInfo?.motivo && <p><span className="font-semibold">Motivo:</span> {pauseInfo.motivo}</p>}
                  {pauseInfo && (
                    <p className="text-amber-600/80">
                      {pauseInfo.ejecutado_por_nombre ? `Por ${pauseInfo.ejecutado_por_nombre} · ` : ""}
                      {new Date(pauseInfo.created_at).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                    </p>
                  )}
                </div>
              )}
            </div>
          </SheetHeader>
          
          {/* Solapas: la barra (TabsList) queda shrink-0 y es cada TabsContent el
              que scrollea. Si en cambio scrolleara el <Tabs> entero, la barra se
              iría con el scroll y volveríamos al mismo corte de 11b4238. Patrón
              copiado de app/asesor/documentos/page.tsx:273-283, ya probado. */}
          <Tabs defaultValue="resumen" className="flex-1 min-h-0 flex flex-col mt-8">
            <TabsList className="shrink-0 self-start">
              <TabsTrigger value="resumen">Resumen</TabsTrigger>
              <TabsTrigger value="documentos">Documentos</TabsTrigger>
            </TabsList>

            <TabsContent value="resumen" className="flex-1 min-h-0 overflow-y-auto pr-2 space-y-6 mt-4 data-[state=inactive]:hidden">
            {selectedAgent && (
              <div className="rounded-xl border border-border/60 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Datos de contacto</p>
                  <Button variant="ghost" size="sm" onClick={() => selectedAgent && abrirEdicionDatos(selectedAgent)}>
                    Editar
                  </Button>
                </div>
                <div className="space-y-1 text-sm">
                  <p><span className="text-muted-foreground">Email:</span> {selectedAgent.email}</p>
                  <p>
                    <span className="text-muted-foreground">Celular:</span>{" "}
                    {selectedAgent.phone
                      ? (
                          // El valor ya viene en E.164 sin "+". Sin asumir país,
                          // formatPhoneInternational deducirá el país del código
                          // del propio número. Si está vacío, cae al fallback crudo.
                          formatPhoneInternational("+" + selectedAgent.phone) ?? selectedAgent.phone
                        )
                      : <span className="text-amber-600">Sin cargar</span>}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">El email no se puede cambiar: es su cuenta.</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Card className="bg-accent/5 border-accent/10 shadow-none">
                <CardHeader className="p-4 pb-0">
                  <CardTitle className="text-xs font-bold uppercase text-muted-foreground flex items-center justify-between">
                    Cierres Totales
                    <TrendingUp className="h-3 w-3 text-green-500" />
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  {loadingKpis ? <Skeleton className="h-8 w-16" /> : (
                    <>
                      <p className="text-3xl font-bold">{agentKpis?.transacciones || 0}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">Ventas finalizadas</p>
                    </>
                  )}
                </CardContent>
              </Card>
              <Card className="bg-accent/5 border-accent/10 shadow-none">
                <CardHeader className="p-4 pb-0">
                  <CardTitle className="text-xs font-bold uppercase text-muted-foreground flex items-center justify-between">
                    Rotación
                    <Zap className="h-3 w-3 text-yellow-500" />
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  {loadingKpis ? <Skeleton className="h-8 w-16" /> : (
                    <>
                      <p className="text-3xl font-bold">{agentKpis?.rotacion.toFixed(1) || 0}%</p>
                      <p className="text-[10px] text-accent mt-1">Eficiencia de stock</p>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Conversion Ratios Section */}
            <div className="space-y-3">
              <h4 className="text-sm font-bold flex items-center gap-2 uppercase tracking-wider text-muted-foreground">
                <Target className="h-4 w-4 text-accent" />
                Embudo de Conversión
              </h4>
              <div className="grid gap-3">
                {loadingKpis ? [1,2,3].map(i => <Skeleton key={i} className="h-12 w-full rounded-xl" />) : (
                  <>
                    <div className="flex items-center justify-between p-3 rounded-xl bg-card border border-accent/10">
                      <div className="space-y-0.5">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase">WhatsApp / Cierre</p>
                        <p className="text-xs font-medium">Calidad de Consultas</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-muted-foreground font-medium mb-1">Total: {agentKpis?.consultasWa || 0}</p>
                        <p className="text-sm font-bold">1:{agentKpis?.ratioWaCierre.toFixed(1) || "0.0"}</p>
                        <p className="text-[10px] text-accent font-bold">
                          {agentKpis?.ratioWaCierre > 0 ? (100 / agentKpis.ratioWaCierre).toFixed(1) : "0"}%
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-xl bg-card border border-accent/10">
                      <div className="space-y-0.5">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase">Prospección / Cierre</p>
                        <p className="text-xs font-medium">Efectividad Activa</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-muted-foreground font-medium mb-1">Total: {agentKpis?.prospeccionActiva || 0}</p>
                        <p className="text-sm font-bold">1:{agentKpis?.ratioProspCierre.toFixed(1) || "0.0"}</p>
                        <p className="text-[10px] text-accent font-bold">
                          {agentKpis?.ratioProspCierre > 0 ? (100 / agentKpis.ratioProspCierre).toFixed(1) : "0"}%
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-xl bg-accent/5 border border-accent/20 shadow-inner">
                      <div className="space-y-0.5">
                        <p className="text-[10px] font-bold text-accent uppercase">Conversión Total</p>
                        <p className="text-xs font-medium">Global Funnel</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-muted-foreground font-medium mb-1">Total: {(agentKpis?.consultasWa || 0) + (agentKpis?.prospeccionActiva || 0)}</p>
                        <p className="text-sm font-bold text-accent">1:{agentKpis?.ratioTotalLeadsCierre.toFixed(1) || "0.0"}</p>
                        <p className="text-[10px] text-accent font-bold">
                          {agentKpis?.ratioTotalLeadsCierre > 0 ? (100 / agentKpis.ratioTotalLeadsCierre).toFixed(1) : "0"}%
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-bold flex items-center gap-2 uppercase tracking-wider text-muted-foreground">
                <Briefcase className="h-4 w-4 text-accent" />
                Cartera y Stock
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-card border border-accent/10">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">Inventario Activo</p>
                  <p className="text-lg font-bold mt-1">{agentKpis?.carteraActiva || 0}</p>
                </div>
                <div className="p-3 rounded-xl bg-card border border-accent/10">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">Días en Cartera</p>
                  <p className="text-lg font-bold mt-1">~{agentKpis?.dom || 45}</p>
                </div>
              </div>
              
              <div className="space-y-2">
                <h5 className="text-[10px] font-bold text-muted-foreground uppercase px-1">Últimas Propiedades</h5>
                <div className="py-6 text-center bg-accent/5 rounded-xl border border-dashed border-accent/20">
                  <p className="text-xs text-muted-foreground">No hay propiedades vinculadas actualmente.</p>
                </div>
              </div>
            </div>
            </TabsContent>

            <TabsContent value="documentos" className="flex-1 min-h-0 overflow-y-auto pr-2 mt-4 data-[state=inactive]:hidden">
              {selectedAgent && agencyId && (
                <DocumentosDelAsesor advisorId={selectedAgent.id} agencyId={agencyId} />
              )}
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      {/* Diálogo de PAUSA con motivo obligatorio */}
      <Dialog open={!!agentToPause} onOpenChange={(open) => { if (!open) { setAgentToPause(null); setPauseReason("") } }}>
        <DialogContent className="bg-card border-amber-500/20">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <PauseCircle className="h-5 w-5" /> Pausar asesor
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-1 pt-2">
                <p>
                  <strong>{agentToPause?.full_name}</strong> no podrá acceder al sistema mientras esté pausado.
                  Podés reactivarlo cuando quieras (no se bloquea su email).
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-sm font-medium">Motivo de la pausa</label>
            <Textarea
              value={pauseReason}
              onChange={(e) => setPauseReason(e.target.value)}
              placeholder="Ej: licencia, motivos internos, etc."
              className="min-h-[80px]"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAgentToPause(null); setPauseReason("") }} disabled={pausing}>
              Cancelar
            </Button>
            <Button
              className="bg-amber-500 hover:bg-amber-500/90 text-white gap-2"
              onClick={handleConfirmPausar}
              disabled={pausing || !pauseReason.trim()}
            >
              <PauseCircle className="h-4 w-4" /> Pausar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de DESVINCULACIÓN con motivo obligatorio */}
      <Dialog open={!!agentToUnlink} onOpenChange={(open) => { if (!open) { setAgentToUnlink(null); setUnlinkReason("") } }}>
        <DialogContent className="bg-card border-destructive/20">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Desvincular asesor
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 pt-2">
                <p>
                  <strong>{agentToUnlink?.full_name}</strong> no podrá volver a ingresar al sistema con su email
                  {agentToUnlink?.email ? <> (<span className="font-mono">{agentToUnlink.email}</span>)</> : null}.
                  Esta acción es más fuerte que una pausa.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-sm font-medium">Motivo de la desvinculación</label>
            <Textarea
              value={unlinkReason}
              onChange={(e) => setUnlinkReason(e.target.value)}
              placeholder="Ej: dejó la inmobiliaria, etc."
              className="min-h-[80px]"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAgentToUnlink(null); setUnlinkReason("") }} disabled={desvinculando === agentToUnlink?.id}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              className="gap-2"
              onClick={handleConfirmDesvincular}
              disabled={desvinculando === agentToUnlink?.id || !unlinkReason.trim()}
            >
              <XCircle className="h-4 w-4" /> Desvincular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Borrado definitivo: solo para duplicados o perfiles cargados por error.
          El servidor se niega si el perfil tiene trabajo real encima; acá se le
          muestra al director el resultado de esa verificación antes de decidir. */}
      <Dialog open={!!agentToDelete} onOpenChange={(open) => { if (!open) { setAgentToDelete(null); setDeleteReason("") } }}>
        <DialogContent className="bg-card border-destructive/40">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" /> Eliminar definitivamente
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 pt-2">
                <p>
                  Vas a <strong>borrar por completo</strong> el perfil de{" "}
                  <strong>{agentToDelete?.full_name}</strong>
                  {agentToDelete?.email ? <> (<span className="font-mono">{agentToDelete.email}</span>)</> : null}.
                </p>
                <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive">
                  <strong>Se pierde el historial de esa persona.</strong> No queda en la lista de
                  &quot;Eliminados&quot;, no se puede recuperar y no hay forma de deshacerlo. Es para
                  perfiles <strong>duplicados o cargados por error</strong>.
                </p>
                <p className="text-muted-foreground">
                  Si es una persona real que se fue de la inmobiliaria, cerrá esto y usá{" "}
                  <strong>Desvincular</strong>: así conservás todo su historial.
                </p>

                {verificandoHuella && <p>Verificando si tiene datos asociados…</p>}

                {huella && !huella.puedeBorrarse && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive">
                    <p className="font-medium">No se puede eliminar definitivamente.</p>
                    <p>
                      Este asesor tiene{" "}
                      {huella.bloqueantes.map((b) => `${b.filas} ${b.etiqueta}`).join(", ")} a su
                      nombre, así que no es un duplicado. Usá <strong>Desvincular</strong>.
                    </p>
                  </div>
                )}

                {huella?.puedeBorrarse && (
                  <p className="rounded-md border border-border bg-muted/40 p-3">
                    Verificado: este perfil <strong>no tiene ningún dato de trabajo</strong> asociado
                    (ni leads, ni propiedades, ni actividad). Se puede borrar sin perder nada del
                    resto del equipo.
                  </p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>

          {huella?.puedeBorrarse && (
            <div className="space-y-2 py-2">
              <label className="text-sm font-medium">Motivo del borrado</label>
              <Textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Ej: perfil duplicado, se registró dos veces por error"
                className="min-h-[80px]"
              />
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setAgentToDelete(null); setDeleteReason("") }}
              disabled={borrando === agentToDelete?.id}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              className="gap-2"
              onClick={handleConfirmBorrado}
              disabled={!huella?.puedeBorrarse || !deleteReason.trim() || borrando === agentToDelete?.id}
            >
              <Trash2 className="h-4 w-4" />
              {borrando === agentToDelete?.id ? "Eliminando…" : "Eliminar definitivamente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de edición de nombre/celular. El email queda de solo lectura. */}
      <Dialog open={!!editandoDatos} onOpenChange={(v) => !v && setEditandoDatos(null)}>
        <DialogContent className="bg-card border-accent/20 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Datos de {editandoDatos?.full_name || "el asesor"}</DialogTitle>
            <DialogDescription>
              El email queda como está: es la cuenta con la que se registró.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="ed-nombre">Nombre y apellido</Label>
              <Input
                id="ed-nombre"
                value={nombreEdit}
                disabled={guardandoDatos}
                onChange={(e) => setNombreEdit(e.target.value)}
              />
            </div>
            <VerifiedPhoneField value={phoneEdit} onChange={setPhoneEdit} disabled={guardandoDatos} />
            <p className="text-xs text-muted-foreground">
              Dejá el celular en blanco si no querés cambiarlo.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditandoDatos(null)} disabled={guardandoDatos}>
              Cancelar
            </Button>
            <Button onClick={guardarDatos} disabled={guardandoDatos} className="bg-accent">
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {agencyId && (
        <NuevoCodigoDialog
          open={dialogoCodigoAbierto}
          onOpenChange={setDialogoCodigoAbierto}
          agencyId={agencyId}
          role="asesor"
          onCreated={(code, invite) => {
            // El botón "Generar código para un asesor" cierra este modal antes de
            // abrir el diálogo (ver más arriba). Si acá solo actualizáramos el
            // código, quedaría guardado sobre un modal que ya no está en pantalla:
            // el director vería el toast "Código generado para Juan" sin el
            // código, y tendría que volver a abrir "Invitar al equipo" para verlo.
            // Por eso lo reabrimos acá, ya con el código y el nombre listos.
            setInviteCode(code)
            setInviteName(invite.nombre)
            setIsInviteModalOpen(true)
          }}
        />
      )}
    </div>
  )
}
