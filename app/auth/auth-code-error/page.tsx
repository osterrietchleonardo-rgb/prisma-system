import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'

export default function AuthCodeError() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background text-foreground">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="flex justify-center">
          <div className="bg-destructive/10 p-3 rounded-full">
            <AlertCircle className="h-12 w-12 text-destructive" />
          </div>
        </div>
        
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Error de Autenticación</h1>
          <p className="text-muted-foreground">
            Hubo un problema al verificar tu sesión de Google. Esto puede suceder si la sesión ha expirado o si hay un problema de red.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Button asChild className="w-full">
            <Link href="/auth/login">Reintentar Inicio de Sesión</Link>
          </Button>
          <Button variant="ghost" asChild className="w-full">
            <Link href="/">Volver al Inicio</Link>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground pt-4">
          Si el problema persiste, contacta con soporte técnico de PRISMA.
        </p>
      </div>
    </div>
  )
}
