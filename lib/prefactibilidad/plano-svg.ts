// Un plano que imprime siempre igual: SVG generado desde la geometría, no una captura del mapa.
// Coordenadas en metros alrededor del lote, norte arriba. Sin <text> (Vercel no tiene fuentes;
// ver app/api/acm/mapa-zona/route.ts): la escala son dos rayas de 10 m.
import { anillosDe, bboxDe, proyector } from "./geo";
import type { Poligono } from "./tipos";

interface Args { lote: Poligono; huella: Poligono | null; manzana?: Poligono | null; colorLote?: string; colorHuella?: string; ancho?: number; alto?: number }

export function planoSvg({ lote, huella, manzana = null, colorLote = "#8d5c2a", colorHuella = "#8d5c2a", ancho = 480, alto = 360 }: Args): string {
  const hex = (c: string, porDefecto: string) => (/^#[0-9a-fA-F]{3,8}$/.test(c) ? c : porDefecto);
  const loteSafe = hex(colorLote, "#8d5c2a");
  const huelaSafe = hex(colorHuella, "#8d5c2a");

  const [minLng, minLat, maxLng, maxLat] = bboxDe(lote);
  const p = proyector([(minLng + maxLng) / 2, (minLat + maxLat) / 2]);
  const aPuntos = (g: Poligono) => anillosDe(g).map((an) => an.map((c) => { const [x, y] = p.aMetros(c); return `${x.toFixed(2)},${(-y).toFixed(2)}`; }).join(" "));
  const [x0, y0] = p.aMetros([minLng, maxLat]); const [x1, y1] = p.aMetros([maxLng, minLat]);
  // 14 m de aire: entran la escala de 10 m y la flecha sin pisar el lote
  const margen = Math.max(14, (x1 - x0) * 0.25);
  const vx = x0 - margen, vy = -y0 - margen, vw = x1 - x0 + 2 * margen, vh = y0 - y1 + 2 * margen;
  const partes: string[] = [];
  if (manzana) for (const pts of aPuntos(manzana)) partes.push(`<polygon points="${pts}" fill="#f4f4f5" stroke="#a1a1aa" stroke-width="0.3" />`);
  for (const pts of aPuntos(lote)) partes.push(`<polygon points="${pts}" fill="#ffffff" stroke="${loteSafe}" stroke-width="0.5" />`);
  if (huella) for (const pts of aPuntos(huella)) partes.push(`<polygon points="${pts}" fill="${huelaSafe}" fill-opacity="0.35" stroke="${huelaSafe}" stroke-width="0.35" />`);
  // norte: flecha arriba a la derecha; escala: 10 m abajo a la izquierda
  const nx = vx + vw - 3, ny = vy + 2;
  partes.push(`<path d="M ${nx} ${ny + 4} L ${nx} ${ny} M ${nx - 1.2} ${ny + 1.4} L ${nx} ${ny} L ${nx + 1.2} ${ny + 1.4}" stroke="#3f3f46" stroke-width="0.35" fill="none" />`);
  const sx = vx + 2, sy = vy + vh - 3;
  partes.push(`<path d="M ${sx} ${sy} L ${sx + 10} ${sy} M ${sx} ${sy - 1} L ${sx} ${sy + 1} M ${sx + 10} ${sy - 1} L ${sx + 10} ${sy + 1}" stroke="#3f3f46" stroke-width="0.35" />`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="${vx.toFixed(2)} ${vy.toFixed(2)} ${vw.toFixed(2)} ${vh.toFixed(2)}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Plano del lote con la huella edificable">${partes.join("")}</svg>`;
}
