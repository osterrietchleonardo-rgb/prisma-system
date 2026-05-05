"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { register, signInWithGoogle } from "@/lib/actions/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Globe as Google, Loader2, Info } from "lucide-react"

export default function RegisterForm() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const router = useRouter()
  
  const initialRole = (searchParams.get("role") as "director" | "asesor") || "director"
  const [role, setRole] = useState<"director" | "asesor">(initialRole)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const formData = new FormData(e.currentTarget)
    const fullName = formData.get("fullName") as string
    const email = formData.get("email") as string
    const password = formData.get("password") as string
    const agencyName = formData.get("agencyName") as string
    const inviteCode = formData.get("inviteCode") as string

    try {
      const result = await register({
        fullName,
        email,
        password,
        role,
        agencyName: role === 'director' ? agencyName : undefined,
        inviteCode: role === 'asesor' ? inviteCode : undefined,
      })
      
      if (result.error) {
        setError(result.error)
        setLoading(false)
        return
      }

      if (result.success) {
        setSuccess(true)
        return
      }
      
      router.push(role === 'director' ? '/director/dashboard' : '/asesor/dashboard')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear cuenta")
    } finally {
      setLoading(false)
    }
  }

  const [success, setSuccess] = useState(false)

  if (success) {
    return (
      <Card className="w-full max-w-lg border-accent/20 bg-card/50 backdrop-blur-sm">
        <CardHeader className="space-y-1 items-center text-center">
          <div className="w-16 h-16 bg-success/10 text-success rounded-full flex items-center justify-center mb-4">
            <Info className="w-8 h-8" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-white">¡Revisá tu email!</CardTitle>
          <CardDescription className="text-neutral-300 text-lg mt-2">
            Hemos enviado un enlace de confirmación a tu casilla de correo. 
            Confirmá tu email para activar tu cuenta en PRISMA IA.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center pb-8">
          <Button asChild className="bg-accent hover:bg-accent/90 px-8">
            <Link href="/auth/login">Volver al inicio</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-lg border-accent/20 bg-card/50 backdrop-blur-sm">
      <CardHeader className="space-y-1 items-center">
        <div className="w-16 h-16 relative rounded-full overflow-hidden mb-2 shadow-lg shadow-accent/20 bg-[#131A2D] p-1 border border-accent/20">
          <img src="/logo-icon.png" alt="PRISMA IA Logo" className="w-full h-full object-cover scale-105" />
        </div>
        <CardTitle className="text-2xl font-bold tracking-tight">Crear cuenta en PRISMA IA</CardTitle>
        <CardDescription>Elegí tu rol y completá tus datos</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Tabs value={role} onValueChange={(v) => setRole(v as "director" | "asesor")} className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-background/50 border border-border/50">
            <TabsTrigger value="director" className="data-[state=active]:bg-accent data-[state=active]:text-white">Director</TabsTrigger>
            <TabsTrigger value="asesor" className="data-[state=active]:bg-accent data-[state=active]:text-white">Asesor</TabsTrigger>
          </TabsList>
        </Tabs>

        <form onSubmit={handleSubmit} className="grid gap-4 mt-2">
          <div className="grid gap-2">
            <Label htmlFor="fullName">Nombre Completo</Label>
            <Input id="fullName" name="fullName" placeholder="Juan Pérez" required disabled={loading} className="bg-background/50" />
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" placeholder="nombre@ejemplo.com" required disabled={loading} className="bg-background/50" />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input id="password" name="password" type="password" required disabled={loading} className="bg-background/50" />
          </div>

          {role === 'director' ? (
            <div className="grid gap-2">
              <Label htmlFor="agencyName">Nombre de la Inmobiliaria</Label>
              <Input id="agencyName" name="agencyName" placeholder="Pérez Propiedades" required disabled={loading} className="bg-background/50" />
            </div>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="inviteCode">Código de Inmobiliaria</Label>
              <Input id="inviteCode" name="inviteCode" placeholder="ABC123" required disabled={loading} className="bg-background/50" />
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Info className="w-3 h-3" /> Solicitalo al Director de tu agencia.
              </p>
            </div>
          )}

          {error && <p className="text-sm text-destructive font-medium border border-destructive/20 bg-destructive/5 p-3 rounded-md">{error}</p>}
          
          <Button type="submit" className="w-full bg-accent hover:bg-accent/90" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {role === 'director' ? 'Crear Agencia' : 'Unirse a Agencia'}
          </Button>
        </form>
        
          {role === 'director' && (
            <>
              <div className="relative mt-2">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">O continuar con</span>
                </div>
              </div>
              
              <Button 
                variant="outline" 
                type="button" 
                disabled={loading} 
                onClick={() => {
                  const formData = new FormData(document.querySelector('form') as HTMLFormElement)
                  const agencyName = formData.get("agencyName") as string
                  signInWithGoogle(window.location.origin, role, undefined, agencyName)
                }} 
                className="border-accent/20 hover:bg-accent/5 w-full"
              >
                <Google className="mr-2 h-4 w-4" />
                Google
              </Button>
            </>
          )}
      </CardContent>
      <CardFooter className="flex flex-wrap items-center justify-center gap-2 border-t p-6">
        <span className="text-sm text-muted-foreground">¿Ya tenés cuenta?</span>
        <Link href="/auth/login" className="text-sm font-medium text-accent hover:underline decoration-accent underline-offset-4">
          Iniciá sesión
        </Link>
      </CardFooter>
    </Card>
  )
}
