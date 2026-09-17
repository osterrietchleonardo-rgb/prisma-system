// Las constantes del Código Urbanístico (Ley 6.099, texto consolidado por Ley 6.776, BOCBA
// 7026 del 26-dic-2024). NADA de esto va a mano en otro archivo. Fuente: PDF "Cuerpo
// principal" del dataset codigo-urbanistico, art. 6.2.1 a 6.2.7 (alturas), 6.3 (retirados),
// 6.4.2.4 (fondo mínimo), 6.4.3 (basamento).
//
// Los pisos NO están en el Código (fija metros): se derivan con PB mínima (3 m; 2,6 m en las
// bajas) y entrepisos de ~2,85 m. Son los que usa el mercado y los que muestra TodoProps.
import type { Unidad } from "./tipos";

export interface DefUnidad {
  nombre: string;
  criollo: string;
  alturaMaxima: number;
  planoLimite: number;
  /** Niveles del cuerpo principal contando la planta baja. */
  pisosCuerpo: number;
  retirados: 0 | 2;
  /** Basamento hasta 6 m que puede llegar a la L.I.B. (solo corredores, art. 6.2.1/6.2.2). */
  basamento: boolean;
  /** Distancia no edificable desde el fondo si la L.F.I. no alcanza al lote (art. 6.4.2.4). */
  retiroFondoMin: 4 | 6 | 8;
  articulo: string;
}

export const UNIDADES: Record<Unidad, DefUnidad> = {
  CA:    { nombre: "Corredor Alto",   criollo: "corredor alto",         alturaMaxima: 38,   planoLimite: 45,   pisosCuerpo: 13, retirados: 2, basamento: true,  retiroFondoMin: 8, articulo: "6.2.1" },
  CM:    { nombre: "Corredor Medio",  criollo: "corredor medio",        alturaMaxima: 31.2, planoLimite: 38.2, pisosCuerpo: 11, retirados: 2, basamento: true,  retiroFondoMin: 8, articulo: "6.2.2" },
  USAA:  { nombre: "U.S.A.A.",        criollo: "altura alta",           alturaMaxima: 22.8, planoLimite: 29.8, pisosCuerpo: 8,  retirados: 2, basamento: false, retiroFondoMin: 6, articulo: "6.2.3" },
  USAM:  { nombre: "U.S.A.M.",        criollo: "altura media",          alturaMaxima: 17.2, planoLimite: 24.2, pisosCuerpo: 6,  retirados: 2, basamento: false, retiroFondoMin: 6, articulo: "6.2.4" },
  USAB2: { nombre: "U.S.A.B. 2",      criollo: "altura baja 2",         alturaMaxima: 14.6, planoLimite: 14.6, pisosCuerpo: 5,  retirados: 0, basamento: false, retiroFondoMin: 4, articulo: "6.2.5" },
  USAB1: { nombre: "U.S.A.B. 1",      criollo: "altura baja 1",         alturaMaxima: 12,   planoLimite: 12,   pisosCuerpo: 4,  retirados: 0, basamento: false, retiroFondoMin: 4, articulo: "6.2.6" },
  USAB0: { nombre: "U.S.A.B. 0",      criollo: "altura baja 0",         alturaMaxima: 9,    planoLimite: 9,    pisosCuerpo: 3,  retirados: 0, basamento: false, retiroFondoMin: 4, articulo: "6.2.7" },
};

/** Art. 6.3: primer retirado a 2 m de la L.O.; segundo a 4 m de la L.O. y de la L.F.I.; plano límite = altura + 7. */
export const RETIRO_1_M = 2;
export const RETIRO_2_M = 4;
export const PLANO_LIMITE_EXTRA_M = 7;
/** Art. 6.4.3: banda edificable mínima garantizada en manzanas especiales. */
export const BANDA_MINIMA_M = 16;
/** Vendible sobre construible. Mercado: 78–85 %; se toma abajo a propósito (spec). */
export const FACTOR_VENDIBLE = 0.8;

const POR_ALTURA: Array<[number, Unidad]> = [[38, "CA"], [31.2, "CM"], [22.8, "USAA"], [17.2, "USAM"], [14.6, "USAB2"], [12, "USAB1"], [9, "USAB0"]];

/** La columna uni_edif_N del CSV trae la altura; la unidad se deduce de ahí. */
export function unidadDesdeAltura(alturaCsv: number): Unidad | null {
  const hit = POR_ALTURA.find(([h]) => Math.abs(h - alturaCsv) < 0.05);
  return hit ? hit[1] : null;
}
