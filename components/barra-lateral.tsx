"use client"

import { Menu, PanelLeftClose } from "lucide-react"
import { cn } from "@/lib/utils"
import { CLAVE_BARRA } from "@/lib/nav/barra-lateral"

/**
 * Cerrar y abrir la barra lateral en escritorio.
 *
 * El estado NO vive en React: vive en `<html data-barra="oculta">` y en
 * localStorage. Así el primer dibujo del servidor y el del navegador son
 * iguales (sin salto de hidratación), y si dejaste la barra cerrada arranca
 * cerrada, sin animación de entrada. El CSS que lo aplica está en
 * `app/globals.css` (`.barra-escritorio` y `.btn-abrir-barra`).
 *
 * En el celular no cambia nada: ahí sigue la hamburguesa de siempre.
 * El script que lee el estado antes del primer dibujo está en `lib/nav/barra-lateral.ts`.
 */
export function alternarBarra() {
  const html = document.documentElement
  const estabaOculta = html.dataset.barra === "oculta"
  if (estabaOculta) delete html.dataset.barra
  else html.dataset.barra = "oculta"
  try {
    localStorage.setItem(CLAVE_BARRA, estabaOculta ? "visible" : "oculta")
  } catch {
    /* sin localStorage: funciona igual, solo no se acuerda */
  }
}

/** Arriba a la derecha de la barra. Solo escritorio: en el celular la barra es un cajón que se cierra solo. */
export function BotonCerrarBarra({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={alternarBarra}
      title="Cerrar barra lateral"
      aria-label="Cerrar barra lateral"
      className={cn(
        "hidden md:flex absolute top-3 right-3 h-7 w-7 items-center justify-center rounded-md",
        "border border-border/70 bg-background/60 text-muted-foreground",
        "hover:text-accent hover:border-accent/50 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        className,
      )}
    >
      <PanelLeftClose className="w-4 h-4" />
    </button>
  )
}

/** En el header, donde está la hamburguesa del celular. Solo aparece cuando la barra está cerrada. */
export function BotonAbrirBarra({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={alternarBarra}
      title="Abrir barra lateral"
      aria-label="Abrir barra lateral"
      className={cn(
        "btn-abrir-barra hidden items-center gap-2 h-9 px-3 rounded-md border text-sm font-medium text-muted-foreground",
        "hover:text-accent hover:border-accent/50 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        className,
      )}
    >
      <Menu className="w-4 h-4" />
      <span className="hidden lg:inline">Barra lateral</span>
    </button>
  )
}
