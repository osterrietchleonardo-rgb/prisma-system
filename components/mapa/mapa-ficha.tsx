"use client"

// Ficha completa de una propiedad del mapa.
//
// El listado del mapa trae solo una foto de portada (traer todo para 1.000 puntos son
// 1.653 ms contra 10 ms). Aca se pide la propiedad entera —todas las fotos y la
// descripcion— y se la entrega al modal que YA existe y usa el chat, con su carrusel y
// su boton de "Compartir ficha".
//
// POR QUE VA POR UN PORTAL A <body>
// La ficha se dibujaba DETRAS del mapa. El modal compartido con el chat es `fixed
// inset-0 z-50`, y aca vivia adentro del contenedor del mapa, que es `isolate`: ahi
// adentro las capas de Leaflet valen de 400 a 700, asi que z-50 pierde y los pines y las
// calles quedan pintados encima de la ficha. Subirle el z-index al modal compartido lo
// tocaria tambien para el chat, y envolverlo en un div con z-index alto le romperia el
// `backdrop-blur` (el fondo a difuminar pasaria a ser el de ese div, o sea nada).
//
// Sacandola del contenedor del mapa el problema desaparece de raiz: en el <body> no hay
// ninguna capa de Leaflet con la que competir y el difuminado vuelve a agarrar la pagina
// entera. Mismo patron que usa el ACM para su barra flotante.
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Loader2 } from "lucide-react"
import { UnifiedPropertyDetail, type UnifiedProperty } from "@/components/shared/consultor-results"

export function MapaFicha({ id, onClose }: { id: string; onClose: () => void }) {
  const [propiedad, setPropiedad] = useState<UnifiedProperty | null>(null)
  const [error, setError] = useState<string | null>(null)
  // El portal necesita el DOM: en el servidor no hay <body> al que colgarse.
  const [montado, setMontado] = useState(false)
  useEffect(() => setMontado(true), [])

  useEffect(() => {
    let vigente = true
    setPropiedad(null)
    setError(null)

    fetch(`/api/mapa/propiedad?id=${encodeURIComponent(id)}`)
      .then(async (r) => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || "No se pudo abrir la ficha")
        return data.propiedad as UnifiedProperty
      })
      .then((p) => { if (vigente) setPropiedad(p) })
      .catch((e) => { if (vigente) setError(e.message) })

    return () => { vigente = false }
  }, [id])

  if (!montado) return null

  if (error) {
    return createPortal(
      <div
        className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 p-4"
        onClick={onClose}
      >
        <div className="rounded-xl bg-white p-6 text-center dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button className="mt-3 text-xs text-zinc-500 underline" onClick={onClose}>Cerrar</button>
        </div>
      </div>,
      document.body,
    )
  }

  if (!propiedad) {
    return createPortal(
      <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>,
      document.body,
    )
  }

  return createPortal(
    <UnifiedPropertyDetail property={propiedad} onClose={onClose} />,
    document.body,
  )
}
