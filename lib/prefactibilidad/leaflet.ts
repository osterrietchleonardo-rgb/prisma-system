import type { Poligono } from "./tipos";
/** GeoJSON va [lng, lat]; Leaflet quiere [lat, lng]. Soporta agujeros y varios pedazos. */
export function posicionesDe(g: Poligono): [number, number][][][] {
  const polis = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  return polis.map((p) => p.map((anillo) => anillo.map(([lng, lat]) => [lat, lng] as [number, number])));
}
