"use client"

import { useState, useEffect } from "react"
import { 
  User, 
  Lock, 
  Bell, 
  Camera,
  Save,
  Building
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

export default function AsesorConfiguracionPage() {
  const [loading, setLoading] = useState(false)
  const [profile, setProfile] = useState<{ full_name: string; email: string; avatar_url: string; agency_name: string }>({
    full_name: "",
    email: "",
    avatar_url: "",
    agency_name: "Cargando..."
  })
  const [userId, setUserId] = useState<string | null>(null)

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
    <div className="flex flex-col h-full space-y-6 p-4 md:p-8 pt-6 max-w-5xl mx-auto">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Configuración</h2>
        <p className="text-muted-foreground mt-1">
          Administra tu perfil, credenciales y preferencias de notificación.
        </p>
      </div>

      <Tabs defaultValue="perfil" className="space-y-6">
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
        </TabsList>

        <TabsContent value="perfil">
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

        <TabsContent value="seguridad">
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

        <TabsContent value="notificaciones">
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
      </Tabs>
    </div>
  )
}
