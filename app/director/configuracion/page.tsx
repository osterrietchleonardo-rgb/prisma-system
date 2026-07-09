"use client"

import { useState, useEffect, useRef } from "react"
import { 
  User, 
  Lock, 
  Bell, 
  Camera,
  Save,
  Building2,
  Key,
  Users,
  Copy,
  Plus,
  Sparkles,
  BarChart3,
  CalendarCheck,
  Link2,
  Unlink,
  Loader2,
  CheckCircle2,
  Trash2,
  AlertTriangle
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase"
import { Badge } from "@/components/ui/badge"

import {
  getAgencySettings,
  getAgencyInvites,
  generateAgencyInvite
} from "@/lib/queries/director"
import { createAgencyAction, updateAgencyAction } from "@/app/actions/agency"
import { eliminarCodigoInvitacion } from "@/app/actions/invites"

import { useSearchParams } from "next/navigation"
import { AiCreditsDashboard } from "@/components/ai-credits-dashboard"
import { WhatsAppCostsDashboard } from "@/components/whatsapp-costs-dashboard"
import { MetaTokenManager } from "@/components/whatsapp/MetaTokenManager"

export default function DirectorConfiguracionPage() {
  const searchParams = useSearchParams()
  const defaultTab = searchParams.get('tab') || 'perfil'
  
  const [loading, setLoading] = useState(false)
  const [profile, setProfile] = useState<{ full_name: string; email: string; avatar_url: string; agency_id: string }>({
    full_name: "",
    email: "",
    avatar_url: "",
    agency_id: ""
  })
  const [userId, setUserId] = useState<string | null>(null)
  
  // Real Agency settings
  const [agencySettings, setAgencySettings] = useState({
    name: "",
    logo_url: "",
    tokko_api_key: ""
  })
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)

  // Real Invite codes (lista compartida por todos los directores de la agencia)
  const [inviteCodes, setInviteCodes] = useState<any[]>([])
  // Nombre del invitado al generar (uno por cada tipo de código)
  const [inviteeName, setInviteeName] = useState<{ asesor: string; director: string }>({ asesor: "", director: "" })
  // Código que el director quiere borrar (abre el popup de confirmación)
  const [codeToDelete, setCodeToDelete] = useState<any | null>(null)
  const [deletingCode, setDeletingCode] = useState(false)

  // Google Calendar
  const [gcal, setGcal] = useState<{ configured: boolean; connected: boolean; email: string | null }>(
    { configured: true, connected: false, email: null }
  )
  const [gcalLoading, setGcalLoading] = useState(true)
  const [gcalActionLoading, setGcalActionLoading] = useState(false)

  const supabase = createClient()

  const fetchGcalStatus = async () => {
    try {
      const res = await fetch("/api/google-calendar/status")
      if (res.ok) {
        const d = await res.json()
        setGcal({ configured: d.configured, connected: d.connected, email: d.email })
      }
    } catch {
      /* noop */
    } finally {
      setGcalLoading(false)
    }
  }

  useEffect(() => {
    fetchGcalStatus()
  }, [])

  // Mensajes de retorno del flujo OAuth (?google=...)
  useEffect(() => {
    const g = searchParams.get("google")
    if (!g) return
    if (g === "conectado") toast.success("¡Google Calendar conectado! Las visitas que te asignes se sincronizarán.")
    else if (g === "cancelado") toast.info("Conexión con Google cancelada.")
    else if (g === "sin_refresh") toast.error("No se pudo obtener el permiso. Probá conectar de nuevo y aceptá todos los permisos.")
    else if (g === "no_config") toast.error("La integración con Google aún no está configurada. Avisá a soporte.")
    else if (g === "error") toast.error("Hubo un problema al conectar con Google. Intentá de nuevo.")
    window.history.replaceState(null, "", "/director/configuracion?tab=integraciones")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleConnectGoogle = () => {
    window.location.href = "/api/google-calendar/connect"
  }

  const handleDisconnectGoogle = async () => {
    try {
      setGcalActionLoading(true)
      const res = await fetch("/api/google-calendar/disconnect", { method: "POST" })
      if (!res.ok) throw new Error()
      setGcal((g) => ({ ...g, connected: false, email: null }))
      toast.success("Google Calendar desconectado.")
    } catch {
      toast.error("No se pudo desconectar. Intentá de nuevo.")
    } finally {
      setGcalActionLoading(false)
    }
  }

  useEffect(() => {
    async function fetchData() {
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
          avatar_url: profileData.avatar_url || "",
          agency_id: profileData.agency_id || ""
        }))

        // Fetch agency settings
        if (profileData.agency_id) {
          const settings = await getAgencySettings(profileData.agency_id)
          if (settings) {
            setAgencySettings({
              name: settings.name || "",
              logo_url: settings.logo_url || "",
              tokko_api_key: settings.tokko_api_key || ""
            })
          }

          // Fetch invite codes
          const codes = await getAgencyInvites(profileData.agency_id)
          setInviteCodes(codes)
        }
      }
    }
    fetchData()
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

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate size (2MB max) and type
    if (file.size > 2 * 1024 * 1024) {
      toast.error("El logo no puede superar los 2MB")
      return
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Solo se permiten imágenes (PNG, JPG, SVG)")
      return
    }

    setIsUploadingLogo(true)
    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("/api/marketing-ia/settings/upload-logo", {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Error al subir el logo")
      }

      const { publicUrl } = await res.json()
      setAgencySettings(prev => ({ ...prev, logo_url: publicUrl }))
      toast.success("Logo subido. Guardá los ajustes para confirmar.")
    } catch (err: any) {
      toast.error("Error al subir el logo: " + err.message)
    } finally {
      setIsUploadingLogo(false)
      // Reset input so same file can be re-selected if needed
      if (logoInputRef.current) logoInputRef.current.value = ""
    }
  }

  const handleSaveAgency = async () => {
    try {
      setLoading(true)
      if (profile.agency_id) {
        await updateAgencyAction(profile.agency_id, {
          name: agencySettings.name,
          logo_url: agencySettings.logo_url || undefined,
          tokko_api_key: agencySettings.tokko_api_key
        })
        toast.success("Configuración de inmobiliaria guardada")

        // Disparar sincronización automática en background si hay API Key
        if (agencySettings.tokko_api_key) {
          toast.promise(
            (async () => {
              const resProps = await fetch("/api/tokko/sync", { method: "POST" })
              if (!resProps.ok) throw new Error("Error en propiedades")
              
              const resLeads = await fetch("/api/tokko/sync-leads", { 
                method: "POST", 
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mode: "all" }) 
              })
              if (!resLeads.ok) throw new Error("Error en leads")
            })(),
            {
              loading: 'Sincronizando Tokko en segundo plano...',
              success: '¡Inmobiliaria sincronizada con éxito!',
              error: 'Error de sincronización. Verifica que tu API Key sea correcta.'
            }
          )
        }
      } else {
        if (!userId) {
          toast.error("Usuario no identificado")
          return
        }
        const newAgency = await createAgencyAction(userId, {
          name: agencySettings.name,
          tokko_api_key: agencySettings.tokko_api_key
        })
        setProfile(p => ({ ...p, agency_id: newAgency.id }))
        toast.success("Inmobiliaria creada y configurada exitosamente")

        if (agencySettings.tokko_api_key) {
          toast.promise(
            (async () => {
              const resProps = await fetch("/api/tokko/sync", { method: "POST" })
              if (!resProps.ok) throw new Error("Error en propiedades")
              
              const resLeads = await fetch("/api/tokko/sync-leads", { 
                method: "POST", 
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mode: "all" }) 
              })
              if (!resLeads.ok) throw new Error("Error en leads")
            })(),
            {
              loading: 'Sincronizando Tokko en segundo plano...',
              success: '¡Inmobiliaria sincronizada con éxito!',
              error: 'Error de sincronización. Verifica que tu API Key sea correcta.'
            }
          )
        }
      }
    } catch (_error) {
      toast.error("Error al guardar la configuración")
    } finally {
      setLoading(false)
    }
  }

  const generateCode = async (role: "asesor" | "director") => {
    if (!profile.agency_id) return
    const name = inviteeName[role].trim()
    if (!name) {
      toast.error("Escribí el nombre de la persona que vas a invitar")
      return
    }
    try {
      setLoading(true)
      await generateAgencyInvite(profile.agency_id, role, name)
      // Recargar invitaciones (lista compartida por todos los directores)
      const codes = await getAgencyInvites(profile.agency_id)
      setInviteCodes(codes)
      setInviteeName((prev) => ({ ...prev, [role]: "" }))
      toast.success(`Código de ${role === "director" ? "director" : "asesor"} generado para ${name}`)
    } catch (_error) {
      toast.error("Error al generar código")
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success("Código copiado al portapapeles")
  }

  const handleDeleteCode = async () => {
    if (!codeToDelete?.id) return
    try {
      setDeletingCode(true)
      await eliminarCodigoInvitacion(codeToDelete.id)
      if (profile.agency_id) {
        const codes = await getAgencyInvites(profile.agency_id)
        setInviteCodes(codes)
      }
      toast.success("Código eliminado de la lista")
      setCodeToDelete(null)
    } catch (e: any) {
      toast.error(e.message || "No se pudo eliminar el código")
    } finally {
      setDeletingCode(false)
    }
  }

  // Dibuja la sección de invitaciones de un tipo (asesor o director).
  // La lista es compartida: todos los directores de la agencia ven los mismos códigos.
  const renderInviteSection = (role: "asesor" | "director", descripcion: string) => {
    const list = inviteCodes.filter((inv) => (inv.role || "asesor") === role)
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{descripcion}</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            value={inviteeName[role]}
            onChange={(e) => setInviteeName((prev) => ({ ...prev, [role]: e.target.value }))}
            placeholder="Nombre de la persona a invitar"
            className="bg-background/50 border-accent/20 focus-visible:ring-accent"
          />
          <Button onClick={() => generateCode(role)} disabled={loading} variant="outline" className="gap-2 border-accent/20 text-accent hover:bg-accent/10 shrink-0">
            <Plus className="h-4 w-4" /> Generar Código
          </Button>
        </div>
        <div className="space-y-3">
          {list.length > 0 ? (
            list.map((invite, i) => (
              <div key={invite.id || i} className="flex items-center justify-between p-3 rounded-xl bg-background/50 border border-accent/10">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="font-mono font-bold text-accent px-3 py-1 bg-accent/10 rounded-md shrink-0">
                    {invite.code}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {invite.invitee_name || invite.used_by_profile?.full_name || "Sin nombre"}
                    </p>
                    {!invite.is_used ? (
                      <Badge variant="outline" className="mt-1 border-green-500/30 text-green-500 bg-green-500/10">Activo</Badge>
                    ) : (
                      <Badge variant="outline" className="mt-1 border-muted text-muted-foreground">Usado</Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!invite.is_used && (
                    <Button variant="ghost" size="icon" onClick={() => copyToClipboard(invite.code)}>
                      <Copy className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setCodeToDelete(invite)}
                    className="text-muted-foreground hover:text-destructive"
                    title="Eliminar código"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-6 text-muted-foreground border-2 border-dashed border-accent/10 rounded-xl">
              No hay códigos de {role === "director" ? "director" : "asesor"} todavía. Escribí un nombre y generá uno.
            </div>
          )}
        </div>
      </div>
    )
  }


  return (
    <div className="flex flex-col h-full space-y-6 p-4 md:p-8 pt-6 w-full animate-in fade-in duration-150">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Ajustes Generales</h2>
        <p className="text-muted-foreground mt-1">
          Administra tu perfil, la configuración de la agencia y las integraciones.
        </p>
      </div>

      <Tabs defaultValue={defaultTab} className="space-y-6">
        <TabsList className="bg-card border border-accent/10">
          <TabsTrigger value="perfil" className="gap-2 data-[state=active]:bg-accent data-[state=active]:text-white">
            <User className="h-4 w-4" /> Mi Perfil
          </TabsTrigger>
          <TabsTrigger value="agencia" className="gap-2 data-[state=active]:bg-accent data-[state=active]:text-white">
            <Building2 className="h-4 w-4" /> Inmobiliaria
          </TabsTrigger>
          <TabsTrigger value="creditos" className="gap-2 data-[state=active]:bg-accent data-[state=active]:text-white">
            <Sparkles className="h-4 w-4" /> Créditos IA
          </TabsTrigger>
          <TabsTrigger value="costos" className="gap-2 data-[state=active]:bg-accent data-[state=active]:text-white">
            <BarChart3 className="h-4 w-4" /> Costos Meta
          </TabsTrigger>
          <TabsTrigger value="seguridad" className="gap-2 data-[state=active]:bg-accent data-[state=active]:text-white">
            <Lock className="h-4 w-4" /> Accesso & Seguridad
          </TabsTrigger>
          <TabsTrigger value="integraciones" className="gap-2 data-[state=active]:bg-accent data-[state=active]:text-white">
            <CalendarCheck className="h-4 w-4" /> Integraciones
          </TabsTrigger>
        </TabsList>

        <TabsContent value="perfil" className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
          <Card className="border-accent/10 bg-card/30 backdrop-blur-md">
            <CardHeader>
              <CardTitle>Información Personal</CardTitle>
              <CardDescription>Actualiza tu foto y nombre visible como Director.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-6">
                <div className="relative group cursor-pointer">
                  <Avatar className="h-24 w-24 border-2 border-accent/20">
                    <AvatarImage src={profile.avatar_url} />
                    <AvatarFallback className="bg-accent/10 text-accent text-xl font-bold">
                      {profile.full_name?.substring(0, 2).toUpperCase() || "DIR"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="h-6 w-6 text-white" />
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-bold">{profile.full_name || "Director"}</h3>
                  <Badge variant="outline" className="mt-2 border-accent/20 text-accent bg-accent/5">Rol: Director</Badge>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Nombre Completo</Label>
                  <Input 
                    value={profile.full_name} 
                    onChange={e => setProfile({...profile, full_name: e.target.value})}
                    className="bg-background/50 border-accent/20 focus-visible:ring-accent"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email (Acceso principal)</Label>
                  <Input 
                    value={profile.email} 
                    readOnly
                    className="bg-muted/50 border-accent/10 text-muted-foreground"
                  />
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <Button onClick={handleSaveProfile} disabled={loading} className="bg-accent hover:bg-accent/90 gap-2">
                  <Save className="h-4 w-4" /> Guardar Perfil
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agencia" className="space-y-6 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
          <Card className="border-accent/10 bg-card/30 backdrop-blur-md">
            <CardHeader>
              <CardTitle>Detalles Inmobiliaria</CardTitle>
              <CardDescription>Configura la marca corporativa e integraciones operativas.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2"><Building2 className="h-4 w-4 text-accent" /> Nombre Legal / Fantasía</Label>
                    <Input 
                      value={agencySettings.name} 
                      onChange={e => setAgencySettings({...agencySettings, name: e.target.value})}
                      className="bg-background/50 border-accent/20 focus-visible:ring-accent font-semibold"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2"><Key className="h-4 w-4 text-accent" /> Tokko Broker API Key</Label>
                    <Input 
                      type="password"
                      value={agencySettings.tokko_api_key} 
                      onChange={e => setAgencySettings({...agencySettings, tokko_api_key: e.target.value})}
                      className="bg-background/50 border-accent/20 focus-visible:ring-accent"
                    />
                    <p className="text-xs text-muted-foreground">Utilizado para sincronizar propiedades y leads automáticamente.</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <Label>Logo de Agencia</Label>
                  {/* Hidden file input */}
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoUpload}
                    disabled={isUploadingLogo}
                  />

                  {agencySettings.logo_url ? (
                    /* Preview mode */
                    <div className="h-32 border border-accent/20 bg-card/50 rounded-2xl flex items-center justify-between px-4 gap-4">
                      <img
                        src={agencySettings.logo_url}
                        alt="Logo agencia"
                        className="h-20 w-auto max-w-[140px] object-contain rounded-lg"
                      />
                      <div className="flex flex-col gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="border-accent/20 text-accent hover:bg-accent/10 gap-2 text-xs"
                          onClick={() => logoInputRef.current?.click()}
                          disabled={isUploadingLogo}
                        >
                          <Camera className="h-3 w-3" />
                          {isUploadingLogo ? "Subiendo..." : "Cambiar"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs"
                          onClick={() => setAgencySettings(prev => ({ ...prev, logo_url: "" }))}
                          disabled={isUploadingLogo}
                        >
                          Quitar logo
                        </Button>
                      </div>
                    </div>
                  ) : (
                    /* Upload prompt */
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      disabled={isUploadingLogo}
                      className="w-full h-32 border-2 border-dashed border-accent/20 bg-accent/5 rounded-2xl flex flex-col items-center justify-center hover:bg-accent/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Camera className="h-6 w-6 text-accent mb-2" />
                      <span className="text-sm font-semibold text-accent">
                        {isUploadingLogo ? "Subiendo..." : "Subir logo"}
                      </span>
                      <span className="text-[10px] text-muted-foreground">PNG, JPG, SVG hasta 2MB</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <Button onClick={handleSaveAgency} disabled={loading} className="bg-accent hover:bg-accent/90 gap-2">
                  <Save className="h-4 w-4" /> Guardar Ajustes de Agencia
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-accent/10 bg-card/30 backdrop-blur-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-accent" /> Invitaciones</CardTitle>
              <CardDescription>
                Generá códigos para sumar gente a tu inmobiliaria. Cada código lleva el nombre del invitado y
                todos los directores ven la misma lista, así no se invita dos veces a la misma persona.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="asesores" className="space-y-4">
                <TabsList className="bg-background/50 border border-accent/10">
                  <TabsTrigger value="asesores" className="gap-2 data-[state=active]:bg-accent data-[state=active]:text-white">
                    <Users className="h-4 w-4" /> Invitación de Asesores
                  </TabsTrigger>
                  <TabsTrigger value="directores" className="gap-2 data-[state=active]:bg-accent data-[state=active]:text-white">
                    <Building2 className="h-4 w-4" /> Invitación de Directores
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="asesores">
                  {renderInviteSection("asesor", "El asesor entra con acceso de asesor a tu inmobiliaria.")}
                </TabsContent>
                <TabsContent value="directores">
                  {renderInviteSection("director", "El director entra con el mismo acceso que vos. No hay jerarquía entre directores: todos pueden invitar.")}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

        </TabsContent>

        <TabsContent value="creditos" className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
          {profile.agency_id ? (
            <AiCreditsDashboard agencyId={profile.agency_id} />
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              Cargando información de agencia...
            </div>
          )}
        </TabsContent>

        <TabsContent value="costos" className="space-y-6 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
          <MetaTokenManager />
          <WhatsAppCostsDashboard />
        </TabsContent>

        <TabsContent value="seguridad" className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
          <Card className="border-accent/10 bg-card/30 backdrop-blur-md">
            <CardHeader>
              <CardTitle>Acceso a la Organización</CardTitle>
              <CardDescription>Opciones avanzadas de seguridad.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-xl border border-accent/10 bg-background/50">
                  <div>
                    <h4 className="font-semibold">Contraseña Personal</h4>
                    <p className="text-sm text-muted-foreground">Te enviaremos un link seguro para actualizarla.</p>
                  </div>
                  <Button variant="outline" onClick={handlePasswordReset}>
                    Restablecer Contraseña
                  </Button>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl border border-accent/10 bg-background/50">
                  <div>
                    <h4 className="font-semibold">Notificaciones Administrativas</h4>
                    <p className="text-sm text-muted-foreground">Recibir avisos diarios sobre performance general del equipo.</p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── INTEGRACIONES ── */}
        <TabsContent value="integraciones" className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
          <Card className="border-accent/10 bg-card/30 backdrop-blur-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarCheck className="h-5 w-5 text-accent" />
                Google Calendar
              </CardTitle>
              <CardDescription>
                Conectá tu cuenta de Google para que las visitas que <strong>te asignás a vos mismo</strong> aparezcan en tu calendario personal.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {gcalLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
                  <Loader2 className="h-4 w-4 animate-spin" /> Verificando conexión...
                </div>
              ) : !gcal.configured ? (
                <div className="rounded-xl border border-dashed border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-500">
                  La integración con Google todavía no está habilitada en el servidor. Contactá a soporte.
                </div>
              ) : gcal.connected ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-emerald-500/10">
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm">Conectado</h4>
                        <p className="text-xs text-muted-foreground">
                          {gcal.email ? `Cuenta: ${gcal.email}` : "Tu Google Calendar está vinculado"}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleDisconnectGoogle}
                      disabled={gcalActionLoading}
                      className="gap-2"
                    >
                      {gcalActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
                      Desconectar
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1 border border-accent/10 rounded-lg p-4 bg-background/40">
                    <p>📌 Solo se sincronizan a tu Google las visitas en las que <strong>vos</strong> figurás como asesor responsable.</p>
                    <p>Las visitas de tus asesores van al Google de cada uno (no al tuyo).</p>
                    <p className="pt-1 italic">La sincronización es de PRISMA hacia Google. Borrar el evento en Google no afecta la visita en PRISMA.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-accent/20 bg-accent/5">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-accent/10">
                        <CalendarCheck className="h-5 w-5 text-accent" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm">Sin conectar</h4>
                        <p className="text-xs text-muted-foreground">Conectá tu Google para sincronizar tus visitas propias.</p>
                      </div>
                    </div>
                    <Button onClick={handleConnectGoogle} className="bg-accent hover:bg-accent/90 gap-2">
                      <Link2 className="h-4 w-4" /> Conectar Google Calendar
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground border border-dashed border-border rounded-lg p-3">
                    💡 Es opcional. Para agendarte una visita propia: en <strong>Calendario → Nueva Visita</strong>, elegite a vos mismo en «Asesor Responsable».
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Popup de advertencia + confirmación para borrar un código */}
      <Dialog open={!!codeToDelete} onOpenChange={(open) => !open && setCodeToDelete(null)}>
        <DialogContent className="bg-card border-destructive/20">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Eliminar código
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 pt-2">
                <p>
                  Vas a eliminar el código{" "}
                  <span className="font-mono font-bold text-foreground">{codeToDelete?.code}</span>
                  {codeToDelete?.invitee_name ? <> de <strong>{codeToDelete.invitee_name}</strong></> : null}.
                  Esta acción no se puede deshacer.
                </p>
                {codeToDelete?.is_used && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-600">
                    ⚠️ Este código <strong>ya fue usado</strong>. Borrarlo <strong>NO desvincula a la persona</strong> del
                    sistema (para eso usá «Desvincular asesor» en la sección Asesores). Solo saca la fila de esta lista.
                  </div>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCodeToDelete(null)} disabled={deletingCode}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDeleteCode} disabled={deletingCode} className="gap-2">
              {deletingCode ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
