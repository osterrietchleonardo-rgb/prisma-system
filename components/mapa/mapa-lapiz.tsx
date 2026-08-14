"use client"

// El lapiz: dibujo a mano alzada sobre el mapa.
//
// POR QUE ESTA ESCRITO A MANO Y NO CON UNA LIBRERIA
// El plugin que se habia propuesto (leaflet-geoman) declara los modos 'Freehand' y
// 'Lasso' en sus tipos, pero SON DE PAGO: el codigo no viene en el paquete gratis
// (verificado el 2026-08-05 buscando en todos los .js del dist). Su version libre solo
// sabe hacer poligonos clickeando esquina por esquina, que no es un lapiz.
// Esto son ~60 lineas, no agrega dependencias y hace exactamente lo pedido.
//
// Se usan eventos de puntero (pointer*) en vez de mouse: asi anda igual con mouse, con
// el dedo en una tablet y con lapiz optico, sin escribir tres veces lo mismo.
import { useEffect, useRef } from "react"
import { Polygon, useMap } from "react-leaflet"
import L from "leaflet"

/** Distancia minima en pixeles entre dos puntos guardados: sin esto un trazo junta miles. */
const PASO_PX = 6

/** Menos de esto no es una zona, es un click sin querer. */
const MINIMO_PUNTOS = 4

export interface Trazo {
  id: string
  poligono: { type: "Polygon"; coordinates: number[][][] }
}

/**
 * Mientras esta activo, apagar el arrastre del mapa y dibujar. Al soltar, cierra la
 * figura y la entrega como poligono GeoJSON.
 */
export function MapaLapiz({
  activo,
  onTrazo,
}: {
  activo: boolean
  onTrazo: (t: Trazo) => void
}) {
  const mapa = useMap()
  const dibujando = useRef(false)
  const puntos = useRef<L.LatLng[]>([])
  const ultimoPx = useRef<{ x: number; y: number } | null>(null)
  const linea = useRef<L.Polyline | null>(null)

  useEffect(() => {
    const contenedor = mapa.getContainer()

    const limpiar = () => {
      dibujando.current = false
      puntos.current = []
      ultimoPx.current = null
      if (linea.current) {
        linea.current.remove()
        linea.current = null
      }
    }

    if (!activo) {
      limpiar()
      contenedor.style.cursor = ""
      mapa.dragging.enable()
      return
    }

    // Con el arrastre prendido, mover el dedo mueve el mapa en vez de dibujar.
    mapa.dragging.disable()
    contenedor.style.cursor = "crosshair"

    const aLatLng = (e: PointerEvent) => {
      const r = contenedor.getBoundingClientRect()
      return mapa.containerPointToLatLng([e.clientX - r.left, e.clientY - r.top])
    }

    const empezar = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return
      dibujando.current = true
      puntos.current = [aLatLng(e)]
      ultimoPx.current = { x: e.clientX, y: e.clientY }
      linea.current = L.polyline(puntos.current, {
        color: "#0ea5e9",
        weight: 3,
        dashArray: "6 4",
      }).addTo(mapa)
      contenedor.setPointerCapture?.(e.pointerId)
    }

    const seguir = (e: PointerEvent) => {
      if (!dibujando.current) return
      const prev = ultimoPx.current
      if (prev) {
        const dx = e.clientX - prev.x
        const dy = e.clientY - prev.y
        if (dx * dx + dy * dy < PASO_PX * PASO_PX) return
      }
      ultimoPx.current = { x: e.clientX, y: e.clientY }
      puntos.current.push(aLatLng(e))
      linea.current?.setLatLngs(puntos.current)
    }

    const soltar = () => {
      if (!dibujando.current) return
      const p = puntos.current

      if (p.length < MINIMO_PUNTOS) {
        limpiar()
        return
      }

      // GeoJSON va [lng, lat] y el anillo tiene que cerrar en el mismo punto donde abrio.
      const anillo = p.map((ll) => [ll.lng, ll.lat])
      anillo.push([p[0].lng, p[0].lat])

      onTrazo({
        id: `trazo_${Date.now()}`,
        poligono: { type: "Polygon", coordinates: [anillo] },
      })
      limpiar()
    }

    contenedor.addEventListener("pointerdown", empezar)
    contenedor.addEventListener("pointermove", seguir)
    contenedor.addEventListener("pointerup", soltar)
    contenedor.addEventListener("pointercancel", limpiar)

    return () => {
      contenedor.removeEventListener("pointerdown", empezar)
      contenedor.removeEventListener("pointermove", seguir)
      contenedor.removeEventListener("pointerup", soltar)
      contenedor.removeEventListener("pointercancel", limpiar)
      limpiar()
      contenedor.style.cursor = ""
      mapa.dragging.enable()
    }
  }, [activo, mapa, onTrazo])

  return null
}

/** Dibuja los trazos ya hechos. Varios trazos SE SUMAN: es una union, no una interseccion. */
export function TrazosDibujados({ trazos }: { trazos: Trazo[] }) {
  return (
    <>
      {trazos.map((t) => (
        <Polygon
          key={t.id}
          positions={t.poligono.coordinates[0].map(([lng, lat]) => [lat, lng] as [number, number])}
          pathOptions={{ color: "#0ea5e9", weight: 2, fillOpacity: 0.08 }}
        />
      ))}
    </>
  )
}
