"use client"

// La barra que aparece abajo cuando hay algo elegido.
//
// VA POR PORTAL A <body>, y no es prolijidad: adentro del contenedor del mapa las capas de
// Leaflet valen de 400 a 700, así que un `fixed` con z-index normal queda tapado por los
// pines y las calles. Mismo motivo por el que la ficha del mapa usa portal
// (components/mapa/mapa-ficha.tsx) y por el que lo hace el ACM.
//
// EL Z-INDEX ES BAJO (40) A PROPÓSITO. Al estar colgada del <body> ya no compite con las
// capas del mapa —el contenedor del mapa es `isolate`, así que sus z-index no salen de ahí—
// y con 40 queda POR DEBAJO del fondo oscuro del cajón del menú lateral (z-50). Eso importa:
// con z-1200 la barra quedaba brillante encima de la pantalla oscurecida, pareciendo tocable
// cuando el menú ya había bloqueado todo lo de atrás. Un botón que se ve y no se toca.
// Verificado en el navegador: con el menú abierto queda tapada, con el menú cerrado recibe
// el toque sobre el mapa.
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { FileText, X } from "lucide-react"
import { useSeleccion } from "./seleccion-contexto"

export function BarraSeleccion({ onContinuar }: { onContinuar: () => void }) {
  const seleccion = useSeleccion()
  // El portal necesita el DOM: en el servidor no hay <body> al que colgarse.
  const [montado, setMontado] = useState(false)
  useEffect(() => setMontado(true), [])

  if (!seleccion || !montado || seleccion.items.length === 0) return null

  const cuantas = seleccion.items.length

  const cancelar = () => {
    // Perder ocho propiedades marcadas por un toque de más es caro: de 3 para arriba se
    // pregunta. Con una o dos, volver a marcarlas cuesta menos que leer el cartel.
    if (cuantas >= 3 && !window.confirm(`¿Seguro que querés vaciar las ${cuantas} propiedades elegidas?`)) return
    seleccion.vaciar()
  }

  return createPortal(
    <div className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-2xl border border-accent/30 bg-card px-4 py-3 shadow-2xl shadow-black/30">
      <span className="whitespace-nowrap text-sm font-semibold">
        {cuantas} {cuantas === 1 ? "elegida" : "elegidas"}
      </span>
      <button
        onClick={cancelar}
        className="flex h-11 items-center gap-1 rounded-xl px-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="h-4 w-4" /> Cancelar
      </button>
      <button
        onClick={onContinuar}
        className="flex h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
      >
        <FileText className="h-4 w-4" /> Continuar
      </button>
    </div>,
    document.body,
  )
}
