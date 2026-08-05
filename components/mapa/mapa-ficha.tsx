"use client"

// Ficha completa de una propiedad del mapa.
//
// El listado del mapa trae solo una foto de portada (traer todo para 1.000 puntos son
// 1.653 ms contra 10 ms). Aca se pide la propiedad entera —todas las fotos y la
// descripcion— y se la entrega al modal que YA existe y usa el chat, con su carrusel y
// su boton de "Compartir ficha".
import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { UnifiedPropertyDetail, type UnifiedProperty } from "@/components/shared/consultor-results"

export function MapaFicha({ id, onClose }: { id: string; onClose: () => void }) {
  const [propiedad, setPropiedad] = useState<UnifiedProperty | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  if (error) {
    return (
      <div
        className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 p-4"
        onClick={onClose}
      >
        <div className="rounded-xl bg-white p-6 text-center dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button className="mt-3 text-xs text-zinc-500 underline" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    )
  }

  if (!propiedad) {
    return (
      <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    )
  }

  return <UnifiedPropertyDetail property={propiedad} onClose={onClose} />
}
