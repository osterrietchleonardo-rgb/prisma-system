// Un plano que imprime siempre igual: SVG generado desde la geometría, no una captura del mapa.
// Coordenadas en metros alrededor del lote, norte arriba. Sin <text> (Vercel no tiene fuentes;
// ver app/api/acm/mapa-zona/route.ts): la escala son dos rayas de 10 m.
import { anillosDe, bboxDe, proyector } from "./geo";
import type { Poligono } from "./tipos";

interface Args { lote: Poligono; huella: Poligono | null; manzana?: Poligono | null; colorLote?: string; colorHuella?: string; ancho?: number; alto?: number }

export function planoSvg({ lote, huella, manzana = null, colorLote = "#8d5c2a", colorHuella = "#8d5c2a", ancho = 480, alto = 360 }: Args): string {
  const [minLng, minLat, maxLng, maxLat] = bboxDe(lote);
  const p = proyector([(minLng + maxLng) / 2, (minLat + maxLat) / 2]);
  const aPuntos = (g: Poligono) => anillosDe(g).map((an) => an.map((c) => { const [x, y] = p.aMetros(c); return `${x.toFixed(2)},${(-y).toFixed(2)}`; }).join(" "));
  const [x0, y0] = p.aMetros([minLng, maxLat]); const [x1, y1] = p.aMetros([maxLng, minLat]);
  const margen = Math.max(6, (x1 - x0) * 0.25);
  const vx = x0 - margen, vy = -y0 - margen, vw = x1 - x0 + 2 * margen, vh = y0 - y1 + 2 * margen;
  const partes: string[] = [];
  if (manzana) for (const pts of aPuntos(manzana)) partes.push(`<polygon points="${pts}" fill="#f4f4f5" stroke="#a1a1aa" stroke-width="0.3" />`);
  for (const pts of aPuntos(lote)) partes.push(`<polygon points="${pts}" fill="#ffffff" stroke="${colorLote}" stroke-width="0.5" />`);
  if (huella) for (const pts of aPuntos(huella)) partes.push(`<polygon points="${pts}" fill="${colorHuella}" fill-opacity="0.35" stroke="${colorHuella}" stroke-width="0.35" />`);
  // norte: flecha arriba a la derecha; escala: 10 m abajo a la izquierda
  const nx = vx + vw - margen * 0.6, ny = vy + margen * 0.4;
  partes.push(`<path d="M ${nx} ${ny + 4} L ${nx} ${ny} M ${nx - 1.2} ${ny + 1.4} L ${nx} ${ny} L ${nx + 1.2} ${ny + 1.4}" stroke="#3f3f46" stroke-width="0.35" fill="none" />`);
  const sx = vx + margen * 0.4, sy = vy + vh - margen * 0.4;
  partes.push(`<path d="M ${sx} ${sy} L ${sx + 10} ${sy} M ${sx} ${sy - 1} L ${sx} ${sy + 1} M ${sx + 10} ${sy - 1} L ${sx + 10} ${sy + 1}" stroke="#3f3f46" stroke-width="0.35" />`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="${vx.toFixed(2)} ${vy.toFixed(2)} ${vw.toFixed(2)} ${vh.toFixed(2)}" role="img" aria-label="Plano del lote con la huella edificable">${partes.join("")}</svg>`;
}
