"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { MessageSquare } from "lucide-react"

/**
 * Burbuja flotante de acceso rápido a la bandeja de WhatsApp (solo celular).
 * El globito rojo son los handoffs sin atender: conversaciones que el bot derivó
 * a una persona y en las que todavía nadie del equipo escribió.
 */

// Dónde NO se muestra: en la propia bandeja no tiene sentido, y en estas otras
// pantallas ya hay algo fijo abajo a la derecha que taparía (el botón de enviar
// del chat de WhatsApp, del Buscador IA y del Tutor IA, y la barra de guardar
// de tracking).
const RUTAS_SIN_BURBUJA =
  /\/(whatsapp|asesor-ia-whatsapp|leads-whatsapp|tracking-performance|consultor|consultor-ia|tutor|tutor-ia)/

/** Cada cuánto se vuelve a preguntar el contador. */
const REFRESCO_MS = 120_000

interface BandejaFabProps {
  /** A dónde lleva: la bandeja del asesor o la del director. */
  href: string
}

export function BandejaFab({ href }: BandejaFabProps) {
  const pathname = usePathname()
  const [pendientes, setPendientes] = useState(0)

  const oculto = RUTAS_SIN_BURBUJA.test(pathname ?? "")

  useEffect(() => {
    if (oculto) return

    let vigente = true

    async function traerPendientes() {
      try {
        const res = await fetch("/api/whatsapp/handoffs-pendientes", {
          cache: "no-store",
        })
        if (!res.ok) return
        const json = await res.json()
        if (vigente) setPendientes(Number(json.pendientes) || 0)
      } catch {
        // Si falla, la burbuja sigue funcionando como atajo sin el contador.
      }
    }

    traerPendientes()
    const intervalo = setInterval(traerPendientes, REFRESCO_MS)
    // Al volver a la pestaña, refrescar sin esperar el próximo ciclo.
    window.addEventListener("focus", traerPendientes)

    return () => {
      vigente = false
      clearInterval(intervalo)
      window.removeEventListener("focus", traerPendientes)
    }
  }, [oculto, pathname])

  if (oculto) return null

  return (
    <Link
      href={href}
      aria-label={
        pendientes > 0
          ? `Ir a la bandeja de WhatsApp. ${pendientes} sin atender`
          : "Ir a la bandeja de WhatsApp"
      }
      className="md:hidden fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-accent text-white shadow-lg shadow-black/30 flex items-center justify-center transition-transform active:scale-95"
    >
      <MessageSquare className="w-6 h-6" />
      {pendientes > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1 rounded-full bg-red-600 text-white text-[11px] font-bold leading-none flex items-center justify-center border-2 border-background"
        >
          {pendientes > 99 ? "99+" : pendientes}
        </span>
      )}
    </Link>
  )
}
