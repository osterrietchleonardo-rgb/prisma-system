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
  Share2,
  RefreshCcw
} from "lucide-react"
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
    } catch (_error) {
      toast.error("Error al cargar asesores")
    } finally {
      setLoading(false)
    }
  }, [supabase, agencyId])

  useEffect(() => {
    fetchAgents()
  }, [fetchAgents])

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
    // Replace with real registration URL
    const url = `${window.location.origin}/auth/register?code=${inviteCode}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success("Enlace de registro copiado")
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
                  Comparte este código o enlace con los nuevos asesores para que se vinculen a tu inmobiliaria.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 py-4">
                {inviteCode ? (
                  <div className="space-y-4">
                    <div className="flex flex-col items-center justify-center p-6 bg-white rounded-2xl border border-accent/10 shadow-inner">
                      <QRCodeSVG 
                        value={`${window.location.origin}/auth/register?code=${inviteCode}`} 
                        size={180}
                        fgColor="#020617"
                      />
                      <p className="mt-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Escanear para registrarse</p>
                    </div>
                    
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
                      <DropdownMenuItem className="text-destructive cursor-pointer">Desvincular asesor</DropdownMenuItem>
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
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Leads</span>
                    <span className="font-bold text-accent">{agent.assigned_leads?.[0]?.count || 0}</span>
                  </div>
                  <div className="flex flex-col items-center p-2 rounded-lg bg-green-500/5 border border-green-500/10">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Cierres</span>
                    <span className="font-bold text-green-500">{agent.closings?.[0]?.count || 0}</span>
                  </div>
                  <div className="flex flex-col items-center p-2 rounded-lg bg-blue-500/5 border border-blue-500/10">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Props</span>
                    <span className="font-bold text-blue-500">0</span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between text-[10px]">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Target className="h-3 w-3" />
                    Conv: <span className="text-foreground font-bold">12%</span>
                  </div>
                  <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/10 border-none px-2 py-0 text-[10px]">
                    Activo
                  </Badge>
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
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-2">
                  <Share2 className="h-3 w-3" /> Compartir
                </Button>
                <Button variant="outline" size="sm" className="gap-2 text-destructive border-destructive/20 hover:bg-destructive/10">
                  <XCircle className="h-3 w-3" /> Desactivar
                </Button>
              </div>
            </div>
          </SheetHeader>
          
          <div className="space-y-6 mt-8">
            <div className="grid grid-cols-2 gap-4">
              <Card className="bg-accent/5 border-accent/10 shadow-none">
                <CardHeader className="p-4 pb-0">
                  <CardTitle className="text-xs font-bold uppercase text-muted-foreground flex items-center justify-between">
                    Total Ventas
                    <TrendingUp className="h-3 w-3 text-green-500" />
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <p className="text-3xl font-bold">$125.4k</p>
                  <p className="text-[10px] text-green-500 mt-1">+8% vs anterior</p>
                </CardContent>
              </Card>
              <Card className="bg-accent/5 border-accent/10 shadow-none">
                <CardHeader className="p-4 pb-0">
                  <CardTitle className="text-xs font-bold uppercase text-muted-foreground flex items-center justify-between">
                    Eficiencia
                    <Target className="h-3 w-3 text-accent" />
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <p className="text-3xl font-bold">84%</p>
                  <p className="text-[10px] text-accent mt-1">Nivel: Senior</p>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-bold flex items-center gap-2">
                <Home className="h-4 w-4 text-accent" />
                Propiedades Asignadas
              </h4>
              <div className="space-y-2">
                <div className="bg-background/50 p-3 rounded-lg border border-accent/10 flex items-center justify-between text-xs">
                  <span>Dpto Puerto Madero, 3 Amb...</span>
                  <Badge variant="outline">Venta</Badge>
                </div>
                <div className="bg-background/50 p-3 rounded-lg border border-accent/10 flex items-center justify-between text-xs">
                  <span>Casa San Isidro Park, Piscina</span>
                  <Badge variant="outline">Alquiler</Badge>
                </div>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
