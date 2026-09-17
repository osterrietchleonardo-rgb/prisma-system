// La regla del TEXTO del Código, para controlar la capa oficial y como respaldo cuando una
// parcela no tiene envolvente en las teselas. Art. 6.4.2: la L.F.I. es paralela a cada línea
// oficial a ¼ de la distancia entre los puntos medios de las L.O. opuestas. Art. 6.4.2.1: si la
// manzana no es cuadrangular, la semisuma de lados opuestos es < 62 m o el área < 4.000 m², la
// fija el organismo (acá: "no típica" → rango).
import { simplify } from "@turf/turf";
import type { Feature, Position } from "geojson";
import { BANDA_MINIMA_M, FACTOR_VENDIBLE, UNIDADES } from "./codigo";
import { anillosDe, areaPlanar, distanciaASegmento, proyector } from "./geo";
import { medirM2, recortarAlLote, unirPedazos } from "./envolvente";
import type { Edificabilidad, Poligono, Unidad } from "./tipos";

const SEMISUMA_MIN_M = 62;
const AREA_MIN_M2 = 4000;
/** Un lado más corto que esto es una ochava, no un lado (las ochavas del Código miden ~4 m). */
const LADO_MIN_M = 12;
/** Cuánto se prolonga cada franja para cubrir la esquina. */
const PROLONGACION_M = 200;
const f = (g: Poligono): Feature<Poligono> => ({ type: "Feature", properties: {}, geometry: g });
type P = [number, number];

function interseccion(a: Position, b: Position, c: Position, d: Position): P | null {
  const den = (a[0] - b[0]) * (c[1] - d[1]) - (a[1] - b[1]) * (c[0] - d[0]);
  if (Math.abs(den) < 1e-9) return null;
  const t = ((a[0] - c[0]) * (c[1] - d[1]) - (a[1] - c[1]) * (c[0] - d[0])) / den;
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}

/** Vértices del anillo exterior en metros, sin el cierre y sin ochavas (el lado corto se reemplaza por el cruce de sus vecinos). */
function ladosEnMetros(manzana: Poligono): { pts: P[]; origen: P } {
  const anillo = anillosDe(simplify(f(manzana), { tolerance: 0.000005, highQuality: true }).geometry as Poligono)[0];
  const origen = anillo[0] as P;
  const p = proyector(origen);
  let pts: P[] = anillo.slice(0, -1).map((c) => p.aMetros(c));
  for (let vuelta = 0; vuelta < 8 && pts.length > 4; vuelta++) {
    const n = pts.length;
    const i = pts.findIndex((q, k) => Math.hypot(pts[(k + 1) % n][0] - q[0], pts[(k + 1) % n][1] - q[1]) < LADO_MIN_M);
    if (i < 0) break;
    const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n], d = pts[(i + 2) % n];
    const x = interseccion(a, b, c, d) ?? b;
    const nuevos: P[] = [];
    for (let k = 0; k < n; k++) { if (k === i) nuevos.push(x); else if (k !== (i + 1) % n) nuevos.push(pts[k]); }
    pts = nuevos;
  }
  return { pts, origen };
}

const lado = (pts: P[], k: number) => Math.hypot(pts[(k + 1) % pts.length][0] - pts[k][0], pts[(k + 1) % pts.length][1] - pts[k][1]);
const centroDe = (pts: P[]): P => [pts.reduce((s, q) => s + q[0], 0) / pts.length, pts.reduce((s, q) => s + q[1], 0) / pts.length];

export function analizarManzana(manzana: Poligono) {
  const { pts } = ladosEnMetros(manzana);
  const areaM2 = areaPlanar(pts);
  const lados = pts.length;
  if (lados !== 4) return { tipica: false, lados, semisumas: null, areaM2, motivo: `manzana de ${lados} lados` };
  const L = [0, 1, 2, 3].map((k) => lado(pts, k));
  const semisumas: [number, number] = [(L[0] + L[2]) / 2, (L[1] + L[3]) / 2];
  if (semisumas[0] < SEMISUMA_MIN_M || semisumas[1] < SEMISUMA_MIN_M) return { tipica: false, lados, semisumas, areaM2, motivo: "semisuma de lados opuestos menor a 62 m" };
  if (areaM2 < AREA_MIN_M2) return { tipica: false, lados, semisumas, areaM2, motivo: "superficie menor a 4.000 m²" };
  return { tipica: true, lados, semisumas, areaM2 };
}

/** Franja de ancho d hacia adentro del lado a→b, prolongada para cubrir la esquina. */
function franja(a: P, b: P, d: number, interior: P): P[] {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
  const ux = dx / L, uy = dy / L;
  let nx = -uy, ny = ux;
  if ((interior[0] - a[0]) * nx + (interior[1] - a[1]) * ny < 0) { nx = -nx; ny = -ny; }
  const a2: P = [a[0] - ux * PROLONGACION_M, a[1] - uy * PROLONGACION_M];
  const b2: P = [b[0] + ux * PROLONGACION_M, b[1] + uy * PROLONGACION_M];
  return [a2, b2, [b2[0] + nx * d, b2[1] + ny * d], [a2[0] + nx * d, a2[1] + ny * d], a2];
}

function franjaLonLat(manzana: Poligono, a: P, b: P, d: number): Poligono {
  const { pts, origen } = ladosEnMetros(manzana);
  const p = proyector(origen);
  return { type: "Polygon", coordinates: [franja(a, b, d, centroDe(pts)).map((c) => p.aLonLat(c))] };
}

/** Banda edificable = manzana ∩ ∪ franjas de ¼. null si la manzana no es típica. */
export function bandaEdificable(manzana: Poligono): Poligono | null {
  if (!analizarManzana(manzana).tipica) return null;
  const { pts } = ladosEnMetros(manzana);
  const mid = pts.map((q, k) => [(q[0] + pts[(k + 1) % 4][0]) / 2, (q[1] + pts[(k + 1) % 4][1]) / 2] as P);
  const d02 = Math.hypot(mid[0][0] - mid[2][0], mid[0][1] - mid[2][1]) / 4;
  const d13 = Math.hypot(mid[1][0] - mid[3][0], mid[1][1] - mid[3][1]) / 4;
  const franjas = pts.map((q, k) => franjaLonLat(manzana, q, pts[(k + 1) % 4], k % 2 === 0 ? d02 : d13));
  const u = unirPedazos(franjas);
  return u ? recortarAlLote(u, manzana) : null;
}

/** El lado de la manzana que toca el lote (la línea oficial del frente) y la profundidad del lote desde él. */
function frenteYFondo(lote: Poligono, manzana: Poligono): { a: P; b: P; fondo: number } {
  const { pts, origen } = ladosEnMetros(manzana);
  const pm = proyector(origen);
  const lm = anillosDe(lote)[0].map((c) => pm.aMetros(c));
  const cand = pts.map((q, k) => ({ a: q, b: pts[(k + 1) % pts.length], d: Math.min(...lm.map((v) => distanciaASegmento(v, q, pts[(k + 1) % pts.length]))) }));
  const frente = cand.sort((u, v) => u.d - v.d)[0];
  return { a: frente.a, b: frente.b, fondo: Math.max(...lm.map((v) => distanciaASegmento(v, frente.a, frente.b))) };
}

export function huellaPorRegla(lote: Poligono, manzana: Poligono, unidad: Unidad) {
  const banda = bandaEdificable(manzana);
  const origen = anillosDe(lote)[0][0] as P;
  if (!banda) return { huella: null, m2: 0, alcanzadoPorLfi: false };
  const m2Lote = medirM2(lote, origen);
  const dentro = recortarAlLote(lote, banda);
  const m2Dentro = dentro ? medirM2(dentro, origen) : 0;
  if (m2Dentro < m2Lote - 1) return { huella: dentro, m2: m2Dentro, alcanzadoPorLfi: true };
  // El lote entra entero en la banda: la L.F.I. no lo alcanza → retiro mínimo de fondo (6.4.2.4).
  const { a, b, fondo } = frenteYFondo(lote, manzana);
  const fr = franjaLonLat(manzana, a, b, Math.max(0, fondo - UNIDADES[unidad].retiroFondoMin));
  const h = recortarAlLote(lote, fr);
  return { huella: h, m2: h ? medirM2(h, origen) : 0, alcanzadoPorLfi: false };
}

/** Proporción de los retirados respecto del cuerpo, medida sobre la envolvente oficial de Roosevelt 4554 (244/261 y 192/261). Solo para el techo del rango. */
const RETIRADO_1_PROP = 0.9;
const RETIRADO_2_PROP = 0.7;

export function edificabilidadPorRegla(lote: Poligono, manzana: Poligono, unidad: Unidad): Edificabilidad {
  const def = UNIDADES[unidad];
  const origen = anillosDe(lote)[0][0] as P;
  const h = huellaPorRegla(lote, manzana, unidad);
  const { a, b } = frenteYFondo(lote, manzana);
  const h16 = recortarAlLote(lote, franjaLonLat(manzana, a, b, BANDA_MINIMA_M));
  const piso = (h16 ? medirM2(h16, origen) : 0) * def.pisosCuerpo;
  const m2Cuerpo = h.m2 > 0 ? h.m2 : piso / def.pisosCuerpo;
  const techo = m2Cuerpo * def.pisosCuerpo + (def.retirados ? m2Cuerpo * (RETIRADO_1_PROP + RETIRADO_2_PROP) : 0);
  return {
    modo: "regla", unidades: [unidad], alturaMaxima: def.alturaMaxima, planoLimite: def.planoLimite,
    plantas: [{ nombre: `Planta baja y ${def.pisosCuerpo - 1} pisos`, unidad, m2PorNivel: m2Cuerpo, niveles: def.pisosCuerpo, desdeM: 0, hastaM: def.alturaMaxima }],
    m2Construibles: techo, m2Vendibles: techo * FACTOR_VENDIBLE, huella: h.huella, rango: { piso, techo },
  };
}
