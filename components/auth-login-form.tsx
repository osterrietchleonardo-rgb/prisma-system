"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { login, signInWithGoogle } from "@/lib/actions/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Globe as Google, Loader2 } from "lucide-react"

export default function LoginForm() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const formData = new FormData(e.currentTarget)
    const email = formData.get("email") as string
    const password = formData.get("password") as string

    try {
      const { user } = await login({ email, password })
      const role = user?.user_metadata?.role

      if (role === "director") {
        router.push("/director/dashboard")
      } else if (role === "asesor") {
        router.push("/asesor/dashboard")
      } else {
        router.push("/dashboard")
      }
      
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iniciar sesión")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md border-accent/20 bg-card/50 backdrop-blur-sm">
      <CardHeader className="space-y-1 items-center">
        <div className="w-16 h-16 relative rounded-full overflow-hidden mb-2 shadow-lg shadow-accent/20 bg-[#131A2D]">
          <img src="/logo-icon.png" alt="PRISMA IA Logo" className="w-full h-full object-cover scale-105" />
        </div>
        <CardTitle className="text-2xl font-bold tracking-tight">Bienvenido a PRISMA</CardTitle>
        <CardDescription>Ingresá tus credenciales para continuar</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" placeholder="nombre@ejemplo.com" required disabled={loading} className="bg-background/50" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input id="password" name="password" type="password" required disabled={loading} className="bg-background/50" />
          </div>
          {error && <p className="text-sm text-destructive font-medium">{error}</p>}
          <Button type="submit" className="w-full bg-accent hover:bg-accent/90" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Ingresar
          </Button>
        </form>
        
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">O continuar con</span>
          </div>
        </div>
        
        <Button variant="outline" type="button" disabled={loading} onClick={() => signInWithGoogle(window.location.origin)} className="border-accent/20 hover:bg-accent/5">
          <Google className="mr-2 h-4 w-4" />
          Google
        </Button>
      </CardContent>
      <CardFooter className="flex flex-wrap items-center justify-center gap-2 border-t p-6">
        <span className="text-sm text-muted-foreground">¿No tenés cuenta?</span>
        <Link href="/auth/register" className="text-sm font-medium text-accent hover:underline decoration-accent underline-offset-4">
          Registrate ahora
        </Link>
      </CardFooter>
    </Card>
  )
}
