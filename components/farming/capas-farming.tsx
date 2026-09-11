"use client"

// Los polígonos de Farming sobre el mapa: la zona propia (verde), las ajenas (gris punteado,
// con el nombre y de quién es) y los recortes de choque (rojo). Se montan como `children`
// de MapaLienzo, o sea ADENTRO del MapContainer: por eso este archivo solo se carga con
// dynamic(..., { ssr: false }), igual que el lienzo.
import { Polygon, Tooltip } from "react-leaflet"
import type { Dibujo } from "@/lib/farming/geometria"
import type { Choque, ContornoAjeno } from "@/lib/farming/tipos"

/** GeoJSON va [lng, lat]; Leaflet quiere [lat, lng]. Soporta agujeros y varios pedazos. */
export function posicionesDe(d: Dibujo): [number, number][][][] {
  const polis = d.type === "Polygon" ? [d.coordinates] : d.coordinates
  return polis.map((p) => p.map((anillo) => anillo.map(([lng, lat]) => [lat, lng] as [number, number])))
}

export default function CapasFarming({
  propia,
  ajenas,
  choques,
}: {
  propia?: Dibujo | null
  ajenas: ContornoAjeno[]
  choques: Choque[]
}) {
  return (
    <>
      {ajenas.map((z) => (
        <Polygon
          key={z.id}
          positions={posicionesDe(z.geojson)}
          pathOptions={{ color: "#71717a", weight: 2, dashArray: "6 4", fillColor: "#71717a", fillOpacity: 0.08 }}
        >
          <Tooltip sticky>
            <span className="font-semibold">{z.nombre}</span>
            <br />
            zona de {z.owner_nombre}
          </Tooltip>
        </Polygon>
      ))}

      {propia && (
        <Polygon
          positions={posicionesDe(propia)}
          pathOptions={{ color: "#15803d", weight: 3, fillColor: "#22c55e", fillOpacity: 0.12 }}
        />
      )}

      {choques.map((c, i) => (
        <Polygon
          key={`choque-${c.zona_id}-${i}`}
          positions={posicionesDe(c.recorte)}
          pathOptions={{ color: "#b91c1c", weight: 2, dashArray: "4 4", fillColor: "#ef4444", fillOpacity: 0.4 }}
        >
          <Tooltip permanent direction="center" opacity={1}>
            <span className="font-semibold">pisa «{c.nombre}»</span> de {c.owner_nombre} ({c.pct}%)
          </Tooltip>
        </Polygon>
      ))}
    </>
  )
}
