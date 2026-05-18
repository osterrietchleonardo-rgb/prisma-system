"use client"

import { useState, useEffect } from "react"
import { 
  User, 
  Lock, 
  Bell, 
  Camera,
  Save,
  Building,
  Zap,
  TrendingUp,
  Clock
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase"

import { useSearchParams } from "next/navigation"

interface CreditData {
  limiteMensual: number
  consumidoMes: number
  disponible: number
  porcentaje: number
  desglosePorFeature: { feature: string; total: number }[]
  mesActual: string
  numAsesoresAgencia: number
  creditsAsesoresTotal: number
}

const FEATURE_LABELS: Record<string, string> = {
  tutor: "Tutor IA",
  consultor: "Consultor IA",
  marketing: "Marketing IA",
  contratos: "Contratos IA",
  tasacion: "Tasación IA",
  general: "General",
}

export default function AsesorConfiguracionPage() {
  const searchParams = useSearchParams()
  const defaultTab = searchParams.get('tab') || 'perfil'

  const [loading, setLoading] = useState(false)
  const [profile, setProfile] = useState<{ full_name: string; email: string; avatar_url: string; agency_name: string }>({
    full_name: "",
    email: "",
    avatar_url: "",
    agency_name: "Cargando..."
  })
  const [userId, setUserId] = useState<string | null>(null)
  const [creditData, setCreditData] = useState<CreditData | null>(null)
  const [creditLoading, setCreditLoading] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    async function fetchProfile() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      setUserId(session.user.id)
      
      const { data: profileData } = await supabase
        .from('profiles')
        .select(`
          full_name,
          email,
          avatar_url,
          agency_id
        `)
        .eq('id', session.user.id)
        .single()
        
      if (profileData) {
        setProfile(p => ({
          ...p,
          full_name: profileData.full_name || "",
          email: profileData.email || session.user.email || "",
          avatar_url: profileData.avatar_url || ""
        }))
        
        // Fetch agency name (mocked as PRISMA for now since we don't have an agencies table standard yet or we use auth.users metadata)
        setProfile(p => ({ ...p, agency_name: "Inmobiliaria Vinculada" }))
      }
    }
    fetchProfile()
  }, [])

  useEffect(() => {
    async function fetchCredits() {
      setCreditLoading(true)
      try {
        const res = await fetch("/api/asesor/creditos")
        if (res.ok) {
          const d = await res.json()
          setCreditData(d)
        }
      } finally {
        setCreditLoading(false)
      }
    }
    fetchCredits()
  }, [])

  const handleSaveProfile = async () => {
    if (!userId) return
    try {
      setLoading(true)
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: profile.full_name,
        })
        .eq('id', userId)

      if (error) throw error
      toast.success("Perfil actualizado correctamente")
    } catch (_error) {
      toast.error("Error al actualizar el perfil")
    } finally {
      setLoading(false)
    }
  }

  const handlePasswordReset = () => {
    toast.success("Se ha enviado un email para restablecer la contraseña")
  }

  return (
    <div className="flex flex-col h-full space-y-6 p-4 md:p-8 pt-6 w-full animate-in fade-in duration-150">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Configuración</h2>
        <p className="text-muted-foreground mt-1">
          Administra tu perfil, credenciales y preferencias de notificación.
        </p>
      </div>

      <Tabs defaultValue={defaultTab} className="space-y-6">
        <TabsList className="bg-card border border-accent/10">
          <TabsTrigger value="perfil" className="gap-2 data-[state=active]:bg-accent data-[state=active]:text-white">
            <User className="h-4 w-4" /> Perfil
          </TabsTrigger>
          <TabsTrigger value="seguridad" className="gap-2 data-[state=active]:bg-accent data-[state=active]:text-white">
            <Lock className="h-4 w-4" /> Seguridad
          </TabsTrigger>
          <TabsTrigger value="notificaciones" className="gap-2 data-[state=active]:bg-accent data-[state=active]:text-white">
            <Bell className="h-4 w-4" /> Notificaciones
          </TabsTrigger>
          <TabsTrigger value="creditos" className="gap-2 data-[state=active]:bg-accent data-[state=active]:text-white">
            <Zap className="h-4 w-4" /> Créditos IA
          </TabsTrigger>
        </TabsList>

        <TabsContent value="perfil" className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
          <Card className="border-accent/10 bg-card/30 backdrop-blur-md">
            <CardHeader>
              <CardTitle>Información Personal</CardTitle>
              <CardDescription>Actualiza tu foto y nombre visible en la plataforma.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-6">
                <div className="relative group cursor-pointer">
                  <Avatar className="h-24 w-24 border-2 border-accent/20">
                    <AvatarImage src={profile.avatar_url} />
                    <AvatarFallback className="bg-accent/10 text-accent text-xl">
                      {profile.full_name?.substring(0, 2).toUpperCase() || "AS"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="h-6 w-6 text-white" />
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-bold">{profile.full_name || "Asesor"}</h3>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                    <Building className="h-4 w-4" />
                    {profile.agency_name}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Nombre Completo</Label>
                  <Input 
                    value={profile.full_name} 
                    onChange={e => setProfile({...profile, full_name: e.target.value})}
                    className="bg-background/50 border-accent/20"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email (Solo lectura)</Label>
                  <Input 
                    value={profile.email} 
                    readOnly
                    className="bg-muted/50 border-accent/10 text-muted-foreground"
                  />
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <Button onClick={handleSaveProfile} disabled={loading} className="bg-accent hover:bg-accent/90 gap-2">
                  <Save className="h-4 w-4" /> Guardar Cambios
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="seguridad" className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
          <Card className="border-accent/10 bg-card/30 backdrop-blur-md">
            <CardHeader>
              <CardTitle>Seguridad de la cuenta</CardTitle>
              <CardDescription>Gestiona tu contraseña y acceso.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-xl border border-accent/10 bg-background/50">
                  <div>
                    <h4 className="font-semibold">Contraseña</h4>
                    <p className="text-sm text-muted-foreground">Te enviaremos un link seguro para actualizarla.</p>
                  </div>
                  <Button variant="outline" onClick={handlePasswordReset}>
                    Restablecer Contraseña
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notificaciones" className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
          <Card className="border-accent/10 bg-card/30 backdrop-blur-md">
            <CardHeader>
              <CardTitle>Preferencias de Notificación</CardTitle>
              <CardDescription>Mantente al tanto de tus leads y visitas.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold">Nuevos Leads</h4>
                    <p className="text-sm text-muted-foreground">Recibir email cuando se te asigne un lead.</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="w-full h-px bg-border/50" />
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold">Recordatorios de Visitas</h4>
                    <p className="text-sm text-muted-foreground">Aviso 24hs antes de una visita programada.</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="w-full h-px bg-border/50" />
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold">Mensajes de IA</h4>
                    <p className="text-sm text-muted-foreground">Notificar insights semanales del Consultor IA.</p>
                  </div>
                  <Switch />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        {/* ── CRÉDITOS IA ── */}
        <TabsContent value="creditos" className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
          <div className="space-y-4">
            {creditLoading ? (
              <Card className="border-accent/10 bg-card/30 backdrop-blur-md">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-center h-32 text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Zap className="h-5 w-5 animate-pulse" />
                      Cargando créditos...
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : creditData ? (
              <>
                {/* Resumen principal */}
                <Card className="border-accent/10 bg-card/30 backdrop-blur-md overflow-hidden">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2">
                      <Zap className="h-5 w-5 text-accent" />
                      Mis Créditos IA
                    </CardTitle>
                    <CardDescription>
                      Cuota mensual personal · {creditData.mesActual}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {/* Tres métricas */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-xl border border-accent/10 bg-background/40 p-4 text-center">
                        <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wide">Límite mensual</div>
                        <div className="text-2xl font-bold text-foreground">{creditData.limiteMensual}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">créditos</div>
                      </div>
                      <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 text-center">
                        <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wide">Consumidos</div>
                        <div className={`text-2xl font-bold ${creditData.porcentaje >= 80 ? "text-red-400" : "text-yellow-400"}`}>
                          {creditData.consumidoMes}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">{creditData.porcentaje}% del límite</div>
                      </div>
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
                        <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wide">Disponibles</div>
                        <div className="text-2xl font-bold text-emerald-400">{creditData.disponible}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">créditos</div>
                      </div>
                    </div>

                    {/* Barra de progreso */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Uso del mes</span>
                        <span>{creditData.porcentaje}%</span>
                      </div>
                      <div className="h-3 bg-background/60 rounded-full overflow-hidden border border-accent/10">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${creditData.porcentaje}%`,
                            background: creditData.porcentaje >= 80
                              ? "linear-gradient(90deg, #f87171, #ef4444)"
                              : creditData.porcentaje >= 50
                              ? "linear-gradient(90deg, #fbbf24, #f59e0b)"
                              : "linear-gradient(90deg, #34d399, #10b981)",
                          }}
                        />
                      </div>
                      {creditData.porcentaje >= 80 && (
                        <p className="text-xs text-red-400 flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" />
                          Estás cerca de tu límite mensual. Usá los créditos con cuidado.
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Desglose por feature */}
                {creditData.desglosePorFeature.length > 0 && (
                  <Card className="border-accent/10 bg-card/30 backdrop-blur-md">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Clock className="h-4 w-4 text-accent" />
                        Detalle por módulo
                      </CardTitle>
                      <CardDescription>Créditos consumidos este mes por funcionalidad</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {creditData.desglosePorFeature.map(({ feature, total }) => {
                          const pct = creditData.limiteMensual > 0 ? Math.round((total / creditData.limiteMensual) * 100) : 0
                          return (
                            <div key={feature} className="space-y-1">
                              <div className="flex justify-between items-center text-sm">
                                <span className="font-medium">{FEATURE_LABELS[feature] ?? feature}</span>
                                <span className="text-muted-foreground">{total} créditos</span>
                              </div>
                              <div className="h-1.5 bg-background/60 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-accent/60 rounded-full transition-all duration-500"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Info contextual */}
                <Card className="border-accent/10 bg-card/30 backdrop-blur-md">
                  <CardContent className="pt-5">
                    <div className="flex items-start gap-3 text-sm text-muted-foreground">
                      <Zap className="h-4 w-4 text-accent shrink-0 mt-0.5" />
                      <p>
                        Tu cuota mensual es <strong className="text-foreground">{creditData.limiteMensual} créditos</strong>, calculada
                        como el pool de asesores de tu agencia ({creditData.creditsAsesoresTotal} créditos) dividido entre
                        los {creditData.numAsesoresAgencia} asesores activos. Los créditos se renuevan el 1° de cada mes.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card className="border-accent/10 bg-card/30 backdrop-blur-md">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">
                    No se pudo cargar la información de créditos.
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

      </Tabs>
    </div>
  )
}
