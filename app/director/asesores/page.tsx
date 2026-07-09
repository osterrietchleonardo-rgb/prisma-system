"use client"

import { useState, useEffect, useCallback } from "react"
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
  RefreshCcw,
  Zap,
  Briefcase,
  PauseCircle,
  PlayCircle,
  AlertTriangle
} from "lucide-react"
import { getAgentPerformanceAction, getAgencyAdvisorsPerformanceAction } from "@/app/actions/performance"
import { desvincularAsesor, pausarAsesor, reanudarAsesor, getUltimaAccionPausa } from "@/app/actions/asesores"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
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
import { toast } from "sonner"
import { createClient } from "@/lib/supabase"
import { QRCodeSVG } from "qrcode.react"
// import { cn } from "@/lib/utils" // Unused

export default function AsesoresPage() {
  const [agents, setAgents] = useState<Record<string, any>[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [inviteCode, setInviteCode] = useState("")
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
  // Diálogo de desvinculación: asesor elegido + motivo
  const [agentToUnlink, setAgentToUnlink] = useState<Record<string, any> | null>(null)
  const [unlinkReason, setUnlinkReason] = useState("")
  // Info de la pausa vigente del asesor abierto en el panel (motivo/fecha/quién)
  const [pauseInfo, setPauseInfo] = useState<{ motivo: string | null; created_at: string; ejecutado_por_nombre: string | null } | null>(null)

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
      
      // Get LATEST unused invite code from agency_invites
      const { data: invite } = await supabase
        .from("agency_invites")
        .select("code")
        .eq("agency_id", agencyId)
        .eq("is_used", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      
      setInviteCode(invite?.code || "")
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

  const generateInviteCode = async () => {
    if (!agencyId) return
    try {
      const code = Math.random().toString(36).substring(2, 10).toUpperCase()
      const { error } = await supabase
        .from("agency_invites")
        .insert({ 
          agency_id: agencyId,
          code: code,
          is_used: false
        })

      if (error) throw error
      setInviteCode(code)
      toast.success("Nuevo código de invitación generado")
    } catch (_error) {
      toast.error("Error al generar código")
    }
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(inviteCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success("Código copiado")
  }

  const filteredAgents = agents.filter(a => 
    a.full_name?.toLowerCase().includes(search.toLowerCase()) || 
    a.email?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex flex-col h-full space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            Equipo de Asesores
            <Badge variant="secondary" className="bg-accent/10 text-accent font-medium border-none">
              {agents.length} Miembros
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
                  Comparte este código con los nuevos asesores para que se vinculen a tu inmobiliaria.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 py-4">
                {inviteCode ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-accent/5 p-3 rounded-xl border border-accent/20 font-mono text-center text-lg font-bold tracking-widest text-accent">
                        {inviteCode}
                      </div>
                      <Button variant="outline" size="icon" className="h-12 w-12" onClick={copyToClipboard}>
                        {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                    
                    <Button variant="ghost" className="w-full gap-2 text-muted-foreground" onClick={generateInviteCode}>
                      <RefreshCcw className="h-3 w-3" />
                      Regenerar código
                    </Button>
                  </div>
                ) : (
                  <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
                    <QrCode className="h-12 w-12 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">Aún no has generado un código de invitación.</p>
                    <Button onClick={generateInviteCode} className="bg-accent">Generar primer código</Button>
                  </div>
                )}
              </div>
              
              <DialogFooter>
                <Button variant="secondary" className="w-full" onClick={() => setIsInviteModalOpen(false)}>Listo</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="relative w-full md:w-96 mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input 
          placeholder="Buscar asesor por nombre..." 
          className="pl-10 bg-card/50 border-accent/10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
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
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="mt-4">
                  <h3 className="font-bold text-lg leading-tight group-hover:text-accent transition-colors">{agent.full_name}</h3>
                  <p className="text-xs text-muted-foreground line-clamp-1">{agent.email}</p>
                </div>
              </CardHeader>
              <CardContent className="p-5 pt-4 space-y-4">
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
        <SheetContent className="bg-card border-accent/20 sm:max-w-md">
          <SheetHeader>
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
          
          <div className="space-y-6 mt-8 overflow-y-auto max-h-[calc(100vh-250px)] pr-2">
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
          </div>
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
    </div>
  )
}
