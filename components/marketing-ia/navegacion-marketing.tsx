"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { EVENTO_RETOMAR } from "@/lib/marketing-ia/foto-en-curso"
import { rutaMarketing, type Rol } from "@/lib/marketing-ia/rutas"

/**
 * Los dos saltos automáticos que tenía la página de Marketing IA cuando sus
 * secciones eran solapas, ahora entre páginas:
 *
 * - Terminó de generar en "Crear Anuncio" (evento `generation-complete` con
 *   origen `copy-flow`, lo dispara copy-generator-flow.tsx) → Historial.
 * - "Seguir editando" una foto desde la galería (evento `retomar-foto-ia`,
 *   galeria-fotos.tsx) → HomeStaging. La foto viaja por `foto-en-curso.ts`, que
 *   ya estaba pensado para que el panel de fotos la levante al montar.
 *
 * Vive en el layout de Marketing IA, así está escuchando en cualquiera de sus
 * páginas. No dibuja nada.
 */
export function NavegacionMarketing({ rol }: { rol: Rol }) {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const ir = (destino: string) => {
      if (pathname !== destino) router.push(destino)
    }
    const alTerminarDeGenerar = (e: Event) => {
      if ((e as CustomEvent).detail?.origin === "copy-flow") ir(rutaMarketing(rol, "historial"))
    }
    const alRetomarFoto = () => ir(rutaMarketing(rol, "homestaging"))

    window.addEventListener("generation-complete", alTerminarDeGenerar)
    window.addEventListener(EVENTO_RETOMAR, alRetomarFoto)
    return () => {
      window.removeEventListener("generation-complete", alTerminarDeGenerar)
      window.removeEventListener(EVENTO_RETOMAR, alRetomarFoto)
    }
  }, [rol, router, pathname])

  return null
}
