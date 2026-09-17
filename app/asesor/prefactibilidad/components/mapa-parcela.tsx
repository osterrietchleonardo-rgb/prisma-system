"use client";
// Solo se puede cargar con dynamic(..., { ssr: false }): Leaflet toca window al importarse.
import { useEffect } from "react";
import { MapContainer, Marker, Polygon, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { posicionesDe } from "@/lib/prefactibilidad/leaflet";
import type { Poligono } from "@/lib/prefactibilidad/tipos";

const CENTRO_CABA: [number, number] = [-34.6037, -58.4];
const clave = process.env.NEXT_PUBLIC_MAPTILER_KEY;
const TILES = clave ? `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${clave}` : "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTR = clave ? '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/**
 * El marcador rojo de la dirección buscada. Pin dibujado por CSS/SVG en vez de una imagen
 * (igual que `ICONO_UBICACION` en components/mapa/mapa-lienzo.tsx): así se evita el bug
 * clásico de Leaflet con bundlers, donde los iconos de imagen del paquete salen rotos
 * porque la ruta no sobrevive al empaquetado de Next. Copiado tal cual de ese archivo.
 */
const ICONO_UBICACION = L.divIcon({
  className: "",
  iconSize: [28, 40],
  iconAnchor: [14, 40],
  tooltipAnchor: [0, -38],
  html: `<svg width="28" height="40" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg"
      style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))">
      <path d="M14 0C6.8 0 1 5.8 1 13c0 9.6 13 27 13 27s13-17.4 13-27C27 5.8 21.2 0 14 0z"
        fill="#dc2626" stroke="#fff" stroke-width="2"/>
      <circle cx="14" cy="13" r="4.6" fill="#fff"/>
    </svg>`,
});

function Encuadrar({ lote }: { lote: Poligono | null }) {
  const map = useMap();
  useEffect(() => {
    if (!lote) return;
    const b = L.latLngBounds(posicionesDe(lote).flat(2) as [number, number][]);
    map.fitBounds(b.pad(1.2), { animate: true });
  }, [lote, map]);
  return null;
}

export default function MapaParcela({ pin, lote, huella, manzana }: { pin: { lat: number; lng: number } | null; lote: Poligono | null; huella: Poligono | null; manzana: Poligono | null }) {
  return (
    <MapContainer center={CENTRO_CABA} zoom={12} className="h-full w-full" preferCanvas>
      <TileLayer url={TILES} attribution={ATTR} />
      <Encuadrar lote={lote} />
      {manzana && <Polygon positions={posicionesDe(manzana)} pathOptions={{ color: "#71717a", weight: 1, fillOpacity: 0.03, dashArray: "4 4" }} />}
      {lote && <Polygon positions={posicionesDe(lote)} pathOptions={{ color: "#8d5c2a", weight: 3, fillColor: "#8d5c2a", fillOpacity: 0.08 }} />}
      {huella && <Polygon positions={posicionesDe(huella)} pathOptions={{ color: "#8d5c2a", weight: 1.5, fillColor: "#8d5c2a", fillOpacity: 0.35 }} />}
      {pin && <Marker position={[pin.lat, pin.lng]} icon={ICONO_UBICACION} />}
    </MapContainer>
  );
}
