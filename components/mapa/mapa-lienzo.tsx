"use client"

// El mapa en si. Este archivo SOLO se puede cargar con dynamic(..., { ssr: false }):
// Leaflet toca `window` al importarse y tira el build si corre en el servidor.
import { useEffect, useMemo, useRef } from "react"
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet"
import MarkerClusterGroup from "react-leaflet-cluster"
import L from "leaflet"

import "leaflet/dist/leaflet.css"
import "leaflet.markercluster/dist/MarkerCluster.css"
import "leaflet.markercluster/dist/MarkerCluster.Default.css"

import type { BBox, FuenteMapa, GrupoUbicacion } from "@/lib/mapa/tipos"

/** Centro por defecto: CABA. Se puede navegar a cualquier lado (hay 3 propiedades en Florida). */
const CENTRO: [number, number] = [-34.6037, -58.4]
const ZOOM = 13

/** Cuanto se espera despues de que el usuario suelta el mapa, antes de consultar. */
const ESPERA_MS = 400

const COLOR: Record<FuenteMapa, string> = {
  own: "#f59e0b",    // dorado — las asignadas al usuario
  agency: "#52525b", // gris   — el resto de la cartera
  roomix: "#2563eb", // azul   — red de colaboracion
}

/**
 * Pin dibujado por CSS en vez de una imagen. Ademas de que asi se colorea por fuente,
 * evita el bug clasico de Leaflet con bundlers, donde los iconos del paquete salen rotos
 * porque la ruta de la imagen no sobrevive al empaquetado.
 */
function pin(fuente: FuenteMapa, cuantas: number) {
  const d = cuantas > 1 ? 30 : 20
  const contenido =
    cuantas > 1
      ? `<span style="color:#fff;font-size:11px;font-weight:700;line-height:${d}px">${cuantas}</span>`
      : ""
  return L.divIcon({
    className: "",
    iconSize: [d, d],
    iconAnchor: [d / 2, d / 2],
    html: `<div style="width:${d}px;height:${d}px;border-radius:50%;background:${COLOR[fuente]};
      border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45);text-align:center">${contenido}</div>`,
  })
}

function leerBBox(mapa: L.Map): BBox {
  const b = mapa.getBounds()
  return { sur: b.getSouth(), oeste: b.getWest(), norte: b.getNorth(), este: b.getEast() }
}

/** Avisa el rectangulo visible al cargar y cada vez que el usuario suelta el mapa. */
function Vigia({ onMover }: { onMover: (b: BBox) => void }) {
  const mapa = useMap()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const avisar = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => onMover(leerBBox(mapa)), ESPERA_MS)
  }

  useMapEvents({ moveend: avisar, zoomend: avisar })

  useEffect(() => {
    onMover(leerBBox(mapa))
    return () => { if (timer.current) clearTimeout(timer.current) }
    // Solo al montar: despues lo maneja moveend.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}

/** Encuadra el mapa a un rectangulo cuando el usuario aplica una zona guardada o un trazo. */
function Encuadrar({ a }: { a: BBox | null }) {
  const mapa = useMap()
  useEffect(() => {
    if (!a) return
    mapa.fitBounds(
      [[a.sur, a.oeste], [a.norte, a.este]],
      { padding: [24, 24] },
    )
  }, [a, mapa])
  return null
}

export interface MapaLienzoProps {
  grupos: GrupoUbicacion[]
  onMover: (b: BBox) => void
  onAbrirGrupo: (g: GrupoUbicacion) => void
  /** Cuando llega un rectangulo nuevo, el mapa se acomoda a el. */
  encuadrarA?: BBox | null
  /** Se monta dentro del MapContainer: ahi adentro `useMap()` tiene el mapa. */
  children?: React.ReactNode
}

export default function MapaLienzo({
  grupos,
  onMover,
  onAbrirGrupo,
  encuadrarA = null,
  children,
}: MapaLienzoProps) {
  const clave = process.env.NEXT_PUBLIC_MAPTILER_KEY

  const marcadores = useMemo(
    () =>
      grupos.map((g) => (
        <Marker
          key={g.clave}
          position={[g.lat, g.lng]}
          icon={pin(g.fuente_del_pin, g.propiedades.length)}
          eventHandlers={{ click: () => onAbrirGrupo(g) }}
        />
      )),
    [grupos, onAbrirGrupo],
  )

  return (
    <MapContainer
      center={CENTRO}
      zoom={ZOOM}
      className="h-full w-full"
      // El fondo gris es el que se ve si no hay tiles: el mapa sigue usable igual.
      style={{ background: "#e4e4e7" }}
      preferCanvas
    >
      {clave && (
        <TileLayer
          url={`https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${clave}`}
          attribution='&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
      )}

      <Vigia onMover={onMover} />
      <Encuadrar a={encuadrarA} />

      <MarkerClusterGroup chunkedLoading maxClusterRadius={45} showCoverageOnHover={false}>
        {marcadores}
      </MarkerClusterGroup>

      {children}
    </MapContainer>
  )
}
