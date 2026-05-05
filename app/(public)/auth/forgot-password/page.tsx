"use client"

import { useState } from "react"
import Link from "next/link"
import { resetPassword } from "@/lib/actions/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, ArrowLeft, Mail } from "lucide-react"
import AuthHeader from "@/components/auth-header"

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const formData = new FormData(e.currentTarget)
    const email = formData.get("email") as string

    try {
      const result = await resetPassword(email)
      if (result.error) {
        setError(result.error)
      } else {
        setSuccess(true)
      }
    } catch (err) {
      setError("Error al enviar el email. Intenta de nuevo.")
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
            <Mail className="w-8 h-8 text-accent" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Recuperar Contraseña</CardTitle>
          <CardDescription className="text-center">
            {success 
              ? "Revisá tu casilla de correo" 
              : "Ingresá tu email y te enviaremos un link para restablecer tu contraseña"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="text-center space-y-4">
              <p className="text-sm text-muted-foreground">
                Si existe una cuenta asociada a este email, recibirás instrucciones en unos momentos.
              </p>
              <Button asChild variant="outline" className="w-full border-accent/20 hover:bg-accent/5">
                <Link href="/auth/login">Volver al login</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input 
                  id="email" 
                  name="email" 
                  type="email" 
                  placeholder="nombre@ejemplo.com" 
                  required 
                  disabled={loading} 
                  className="bg-background/50" 
                />
              </div>
              {error && <p className="text-sm text-destructive font-medium">{error}</p>}
              <Button type="submit" className="w-full bg-accent hover:bg-accent/90" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enviar enlace
              </Button>
            </form>
          )}
        </CardContent>
        <CardFooter className="flex justify-center border-t p-6">
          <Link href="/auth/login" className="text-sm text-muted-foreground hover:text-accent flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Volver al inicio de sesión
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}
