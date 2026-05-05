"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { updatePassword } from "@/lib/actions/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, KeyRound, CheckCircle2 } from "lucide-react"
import AuthHeader from "@/components/auth-header"

export default function ResetPasswordPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const formData = new FormData(e.currentTarget)
    const password = formData.get("password") as string
    const confirmPassword = formData.get("confirmPassword") as string

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden")
      setLoading(false)
      return
    }

    try {
      await updatePassword(password)
      setSuccess(true)
      setTimeout(() => {
        router.push("/auth/login")
      }, 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar la contraseña")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-accent/10 via-background to-background p-4 pt-20">
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:40px_40px]"></div>
      <AuthHeader />
      
      <Card className="w-full max-w-md border-accent/20 bg-card/50 backdrop-blur-sm">
        <CardHeader className="space-y-1 items-center">
          <div className="w-16 h-16 relative rounded-full overflow-hidden mb-2 shadow-lg shadow-accent/20 bg-[#131A2D] p-1 border border-accent/20 flex items-center justify-center">
            {success ? <CheckCircle2 className="w-8 h-8 text-success" /> : <KeyRound className="w-8 h-8 text-accent" />}
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Nueva Contraseña</CardTitle>
          <CardDescription className="text-center">
            {success 
              ? "Contraseña actualizada con éxito" 
              : "Ingresá tu nueva contraseña para acceder a tu cuenta"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="text-center space-y-4">
              <p className="text-sm text-muted-foreground">
                Serás redirigido al inicio de sesión en unos segundos...
              </p>
              <Button onClick={() => router.push("/auth/login")} className="w-full bg-accent hover:bg-accent/90">
                Ir al login ahora
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="password">Nueva Contraseña</Label>
                <Input 
                  id="password" 
                  name="password" 
                  type="password" 
                  placeholder="••••••••" 
                  required 
                  minLength={6}
                  disabled={loading} 
                  className="bg-background/50" 
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirmPassword">Confirmar Contraseña</Label>
                <Input 
                  id="confirmPassword" 
                  name="confirmPassword" 
                  type="password" 
                  placeholder="••••••••" 
                  required 
                  minLength={6}
                  disabled={loading} 
                  className="bg-background/50" 
                />
              </div>
              {error && <p className="text-sm text-destructive font-medium">{error}</p>}
              <Button type="submit" className="w-full bg-accent hover:bg-accent/90" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Actualizar contraseña
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
