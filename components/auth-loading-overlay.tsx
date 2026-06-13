"use client"

interface AuthLoadingOverlayProps {
  message?: string
}

/**
 * Pantalla de carga a pantalla completa con el logo circular de PRISMA girando.
 * Se muestra cuando las credenciales ya fueron validadas y el usuario esta
 * entrando (login) o mientras se crea la cuenta (registro).
 */
export default function AuthLoadingOverlay({ message = "Ingresando a tu cuenta..." }: AuthLoadingOverlayProps) {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-background/90 backdrop-blur-md animate-in fade-in duration-300">
      <div
        className="w-24 h-24 rounded-full overflow-hidden bg-[#131A2D] p-1.5 border border-accent/20 shadow-lg shadow-accent/30 animate-spin"
        style={{ animationDuration: "1.1s" }}
      >
        <img src="/logo-icon.png" alt="PRISMA IA" className="w-full h-full object-cover" />
      </div>
      <p className="text-sm font-medium text-muted-foreground animate-pulse">{message}</p>
    </div>
  )
}
