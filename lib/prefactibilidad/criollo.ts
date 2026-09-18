import { UNIDADES } from "./codigo";
import type { Planta, Unidad } from "./tipos";

const fmtM = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 1 });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Vive acá (y no en ficha-lote.tsx, que es "use client") porque un export de un módulo cliente
// llega al servidor como referencia opaca, no como string: la ficha pública (server component)
// necesita el texto en sí. ficha-lote.tsx la importa de acá y la re-exporta para no romper nada.
export const LEYENDA = "Estudio orientativo elaborado con datos públicos del Gobierno de la Ciudad de Buenos Aires. No reemplaza el informe de un profesional matriculado ni el certificado urbanístico oficial.";

export function describirUnidad(u: Unidad): string {
  const d = UNIDADES[u];
  const pisos = d.pisosCuerpo - 1;
  const retirados = d.retirados ? `, más ${d.retirados} retirados` : "";
  const plano = d.retirados ? `; plano límite ${fmtM(d.planoLimite)} m` : "";
  return `${cap(d.criollo)}: planta baja y ${pisos} pisos${retirados} (hasta ${fmtM(d.alturaMaxima)} m${plano})`;
}

export function describirPlanta(p: Planta): string {
  return `${p.nombre} · ${m2(p.m2PorNivel)} por nivel · ${p.niveles} ${p.niveles === 1 ? "nivel" : "niveles"}`;
}

export function m2(n: number): string {
  return `${Math.round(n).toLocaleString("es-AR")} m²`;
}

export function usd(n: number): string {
  return `USD ${Math.round(n).toLocaleString("es-AR")}`;
}
