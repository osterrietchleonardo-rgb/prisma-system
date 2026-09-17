// Cuánto vale la tierra: terrenos en venta de mercado_avisos a menos de 800 m (spec, paso 5).
// Mediana y rango intercuartil de USD/m² de lote, por la superficie del lote. Con menos de 5
// comparables no se muestra número: "sin comparables suficientes" (mismo umbral que la mediana
// de la lista del ACM en comparables-result.tsx).
import type { TerrenoCerca, ValorTierra } from "./tipos";

export const MIN_COMPARABLES = 5;
export const RADIO_M = 800;

export function percentil(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 0) return NaN;
  const k = (s.length - 1) * p, lo = Math.floor(k), hi = Math.ceil(k);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (k - lo);
}
export const mediana = (xs: number[]) => percentil(xs, 0.5);

export function valorTierra(terrenos: TerrenoCerca[], superficieLoteM2: number): ValorTierra | null {
  const validos = terrenos.filter((t) => t.precioUsd > 0 && t.superficieM2 > 0).sort((a, b) => a.distanciaM - b.distanciaM);
  if (validos.length < MIN_COMPARABLES || !(superficieLoteM2 > 0)) return null;
  const usdM2 = validos.map((t) => t.precioUsd / t.superficieM2);
  const med = mediana(usdM2), p25 = percentil(usdM2, 0.25), p75 = percentil(usdM2, 0.75);
  const r = Math.round;
  return {
    comparables: validos,
    usdM2Mediana: r(med), usdM2P25: r(p25), usdM2P75: r(p75),
    valorLote: { desde: r(p25 * superficieLoteM2), mediana: r(med * superficieLoteM2), hasta: r(p75 * superficieLoteM2) },
  };
}
