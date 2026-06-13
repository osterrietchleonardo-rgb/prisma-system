"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { AlertTriangle, RotateCw, Home } from "lucide-react"

// Detecta el caso típico: la pestaña estuvo abierta mucho tiempo y mientras
// tanto se publicó una versión nueva, por lo que los archivos JS viejos que
// la pestaña tiene cargados ya no existen en el servidor.
function isStaleChunkError(error: Error) {
  const msg = `${error?.name ?? ""} ${error?.message ?? ""}`.toLowerCase()
  return (
    msg.includes("chunkloaderror") ||
    msg.includes("loading chunk") ||
    msg.includes("loading css chunk") ||
    msg.includes("failed to fetch dynamically imported module") ||
    msg.includes("importing a module script failed")
  )
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("App error boundary:", error)

    // Si el error es por archivos viejos tras un deploy, recargamos la página
    // automáticamente (una sola vez, para evitar bucles) y el usuario vuelve a
    // ver el sistema funcionando sin enterarse del problema.
    if (isStaleChunkError(error)) {
      const KEY = "prisma_chunk_reload"
      const last = Number(sessionStorage.getItem(KEY) || "0")
      if (Date.now() - last > 10000) {
        sessionStorage.setItem(KEY, String(Date.now()))
        window.location.reload()
      }
    }
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4 text-center">
      <div className="relative group">
        <div className="absolute inset-0 flex items-center justify-center">
          <AlertTriangle className="h-20 w-20 text-[#b87333]" />
        </div>
        <div className="h-20 w-20" />
      </div>

      <div className="mt-8 space-y-4 max-w-md">
        <h2 className="text-3xl font-bold text-foreground">
          Algo salió mal
        </h2>
        <p className="text-muted-foreground text-lg">
          Hubo un problema al mostrar esta pantalla. Probá recargar; casi siempre
          se soluciona al instante.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
          <Button
            onClick={() => window.location.reload()}
            className="w-full sm:w-auto bg-accent hover:bg-accent/90 text-white gap-2 shadow-lg shadow-accent/20"
          >
            <RotateCw className="h-4 w-4" />
            Recargar la página
          </Button>

          <Button
            variant="outline"
            onClick={() => reset()}
            className="w-full sm:w-auto border-accent/20 hover:bg-accent/10 hover:text-accent gap-2"
          >
            Reintentar
          </Button>

          <Button
            asChild
            variant="ghost"
            className="w-full sm:w-auto gap-2"
          >
            <a href="/">
              <Home className="h-4 w-4" />
              Ir al Inicio
            </a>
          </Button>
        </div>
      </div>

      <div className="mt-16 text-xs text-muted-foreground/30 font-mono">
        &copy; {new Date().getFullYear()} PRISMA IA - Prop Tech powered by Gemini
      </div>
    </div>
  )
}
