"use client"

// Los polígonos de Farming sobre el mapa: la zona propia (verde), las ajenas y los recortes
// de choque (rojo). Las ajenas van en gris punteado cuando el asesor dibuja, o con el color
// de su asesor en la pantalla del director. La etiqueta es permanente a propósito: en el
// celular un globito de hover no se abre nunca, y saber de quién es la zona es justamente lo
// que evita chocar. Se montan como `children` de MapaLienzo, o sea ADENTRO del MapContainer:
// por eso este archivo solo se carga con dynamic(..., { ssr: false }), igual que el lienzo.
import { Polygon, Tooltip } from "react-leaflet"
import type { Dibujo } from "@/lib/farming/geometria"
import type { Choque, ContornoAjeno } from "@/lib/farming/tipos"

/** Un contorno con el color de su asesor (solo en la pantalla del director). */
export type ContornoPintado = ContornoAjeno & { color?: string }

const GRIS = "#71717a"

/** GeoJSON va [lng, lat]; Leaflet quiere [lat, lng]. Soporta agujeros y varios pedazos. */
export function posicionesDe(d: Dibujo): [number, number][][][] {
  const polis = d.type === "Polygon" ? [d.coordinates] : d.coordinates
  return polis.map((p) => p.map((anillo) => anillo.map(([lng, lat]) => [lat, lng] as [number, number])))
}

export default function CapasFarming({
  propia,
  ajenas,
  choques,
  resaltadaId,
}: {
  propia?: Dibujo | null
  ajenas: ContornoPintado[]
  choques: Choque[]
  /** La zona elegida en la lista del director: borde grueso y relleno más fuerte. */
  resaltadaId?: string | null
}) {
  return (
    <>
      {ajenas.map((z) => {
        const color = z.color ?? GRIS
        const resaltada = z.id === resaltadaId
        return (
          <Polygon
            key={z.id}
            positions={posicionesDe(z.geojson)}
            pathOptions={{
              color,
              weight: resaltada ? 5 : 2,
              // Punteada solo la gris: es la de "no se puede pisar" mientras se dibuja.
              dashArray: z.color ? undefined : "6 4",
              fillColor: color,
              fillOpacity: resaltada ? 0.3 : z.color ? 0.15 : 0.08,
            }}
          >
            <Tooltip permanent direction="center" opacity={resaltada ? 1 : 0.9}>
              {resaltada ? <span className="font-semibold">{z.nombre} · {z.owner_nombre}</span> : <>{z.nombre} · {z.owner_nombre}</>}
            </Tooltip>
          </Polygon>
        )
      })}

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
            <span className="font-semibold">pisa el {c.pct}% de «{c.nombre}»</span> de {c.owner_nombre}
          </Tooltip>
        </Polygon>
      ))}
    </>
  )
}
