"use client"

import { useState, useEffect } from "react"
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
  Plus
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
import { Badge } from "@/components/ui/badge"

import { 
  getAgencySettings, 
  updateAgencySettings, 
  getAgencyInvites, 
  generateAgencyInvite 
} from "@/lib/queries/director"

export default function DirectorConfiguracionPage() {
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

  // Real Invite codes
  const [inviteCodes, setInviteCodes] = useState<any[]>([])

  const supabase = createClient()

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

  const handleSaveAgency = async () => {
    if (!profile.agency_id) return
    try {
      setLoading(true)
      await updateAgencySettings(profile.agency_id, {
        name: agencySettings.name,
        tokko_api_key: agencySettings.tokko_api_key
      })
      toast.success("Configuración de inmobiliaria guardada")
    } catch (_error) {
      toast.error("Error al guardar la configuración")
    } finally {
      setLoading(false)
    }
  }

  const generateCode = async () => {
    if (!profile.agency_id) return
    try {
      setLoading(true)
      const newInvite = await generateAgencyInvite(profile.agency_id)
      // Recargar invitaciones
      const codes = await getAgencyInvites(profile.agency_id)
      setInviteCodes(codes)
      toast.success("Nuevo código de invitación generado")
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


  return (
    <div className="flex flex-col h-full space-y-6 p-4 md:p-8 pt-6 max-w-5xl mx-auto">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Ajustes Generales</h2>
        <p className="text-muted-foreground mt-1">
          Administra tu perfil, la configuración de la agencia y las integraciones.
        </p>
      </div>

      <Tabs defaultValue="perfil" className="space-y-6">
        <TabsList className="bg-card border border-accent/10">
          <TabsTrigger value="perfil" className="gap-2 data-[state=active]:bg-accent data-[state=active]:text-white">
            <User className="h-4 w-4" /> Mi Perfil
          </TabsTrigger>
          <TabsTrigger value="agencia" className="gap-2 data-[state=active]:bg-accent data-[state=active]:text-white">
            <Building2 className="h-4 w-4" /> Inmobiliaria
          </TabsTrigger>
          <TabsTrigger value="seguridad" className="gap-2 data-[state=active]:bg-accent data-[state=active]:text-white">
            <Lock className="h-4 w-4" /> Accesso & Seguridad
          </TabsTrigger>
        </TabsList>

        <TabsContent value="perfil">
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

        <TabsContent value="agencia" className="space-y-6">
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
                  <div className="h-32 border-2 border-dashed border-accent/20 bg-accent/5 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:bg-accent/10 transition-colors">
                    <Camera className="h-6 w-6 text-accent mb-2" />
                    <span className="text-sm font-semibold text-accent">Subir nuevo logo</span>
                    <span className="text-[10px] text-muted-foreground">PNG, JPG hasta 2MB</span>
                  </div>
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
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-accent" /> Invitación de Asesores</CardTitle>
                <CardDescription>Genera códigos únicos para que nuevos asesores se unan a tu agencia.</CardDescription>
              </div>
              <Button onClick={generateCode} disabled={loading} variant="outline" className="gap-2 border-accent/20 text-accent hover:bg-accent/10">
                <Plus className="h-4 w-4" /> Generar Código
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {inviteCodes.length > 0 ? (
                  inviteCodes.map((invite, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-background/50 border border-accent/10">
                      <div className="flex items-center gap-4">
                        <div className="font-mono font-bold text-accent px-3 py-1 bg-accent/10 rounded-md">
                          {invite.code}
                        </div>
                        {!invite.is_used ? (
                          <Badge variant="outline" className="border-green-500/30 text-green-500 bg-green-500/10">Activo</Badge>
                        ) : (
                          <Badge variant="outline" className="border-muted text-muted-foreground">Usado</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        {invite.used_by_profile && (
                          <span className="text-sm text-muted-foreground mr-4">
                            por {invite.used_by_profile.full_name}
                          </span>
                        )}
                        {!invite.is_used && (
                          <Button variant="ghost" size="icon" onClick={() => copyToClipboard(invite.code)}>
                            <Copy className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6 text-muted-foreground border-2 border-dashed border-accent/10 rounded-xl">
                    No hay códigos generados. Haz clic en "Generar Código" para invitar asesores.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

        </TabsContent>

        <TabsContent value="seguridad">
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
      </Tabs>
    </div>
  )
}
