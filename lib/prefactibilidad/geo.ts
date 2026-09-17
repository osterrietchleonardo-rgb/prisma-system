// Geometría chica en metros. Turf mide en grados o geodésico; para recortar y medir un lote
// de 30 m alcanza y sobra una proyección equirrectangular local (error < 1 cm a esa escala).
import type { Position } from "geojson";
import type { Poligono } from "./tipos";

const M_POR_GRADO_LAT = 110540;
const M_POR_GRADO_LNG_ECUADOR = 111320;

export function proyector(origen: [number, number]) {
  const [lng0, lat0] = origen;
  const kx = M_POR_GRADO_LNG_ECUADOR * Math.cos((lat0 * Math.PI) / 180);
  return {
    aMetros: ([lng, lat]: Position): [number, number] => [(lng - lng0) * kx, (lat - lat0) * M_POR_GRADO_LAT],
    aLonLat: ([x, y]: [number, number]): [number, number] => [lng0 + x / kx, lat0 + y / M_POR_GRADO_LAT],
  };
}

/** Fórmula del zapato; el anillo puede venir cerrado o no. */
export function areaPlanar(anillo: Position[]): number {
  let s = 0;
  for (let i = 0; i < anillo.length; i++) {
    const [x1, y1] = anillo[i];
    const [x2, y2] = anillo[(i + 1) % anillo.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

export function distanciaASegmento(p: Position, a: Position, b: Position): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

export function anillosDe(geom: Poligono): Position[][] {
  return geom.type === "Polygon" ? [geom.coordinates[0]] : geom.coordinates.map((p) => p[0]);
}

export function bboxDe(geom: Poligono): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const polis = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  for (const poli of polis) for (const anillo of poli) for (const [x, y] of anillo) {
    if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}
