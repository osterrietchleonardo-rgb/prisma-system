// ACM · Lo que comparten el mapa de la hoja del entorno y su lista de referencias.
//
// El mapa es una imagen que arma el servidor (app/api/acm/mapa-zona) y la lista de referencias
// se dibuja en HTML sobre la hoja (app/ficha-acm/[token]/page.tsx). Son dos archivos distintos
// que tienen que decir EXACTAMENTE lo mismo: si el mapa pinta la escuela de naranja, la
// referencia tiene que decir "escuela" en ese mismo naranja, y si un punto no llegó a entrar en
// el recorte del mapa no puede figurar en las referencias.
//
// Por eso los colores y el cálculo de qué entra en cuadro viven acá y no en cada lado: una copia
// pegada en dos archivos es una copia que en la próxima edición va a quedar desincronizada, y el
// síntoma sería una ficha que le miente al cliente sobre lo que está mirando.
import type { CategoriaZona, FichaZona, FichaZonaPoi } from "./ficha";

export const TILE = 256;
/** Zoom 16 ≈ 2 m por píxel en Buenos Aires: la imagen cubre unos 1,5 × 2 km. */
export const ZOOM = 16;
/** Vertical (3 × 4 tiles = 768 × 1024): es la proporción del hueco que tiene en la hoja. */
export const ANCHO_TILES = 3;
export const ALTO_TILES = 4;
export const ANCHO = ANCHO_TILES * TILE;
export const ALTO = ALTO_TILES * TILE;
/** Tope de marcadores dibujados: más que esto es una mancha de colores. */
export const MAX_MARCADORES = 12;

// TAMAÑO DE LOS MARCADORES: se dibujan sobre una imagen de 768 px de ancho que en la hoja se
// muestra a ~310 px, o sea que TODO se ve al 40%. Con radio 9 (que en la imagen suelta parece
// correcto) el marcador terminaba midiendo 3,6 px en el papel: prácticamente invisible.
export const R_POI = 22;   // ~9 px en la hoja
export const R_CASA = 34;  // ~14 px en la hoja

/** Un punto pegado al borde sale mordido y parece un error de impresión: se descarta. */
const MARGEN = 10;

/** Color del marcador de la propiedad analizada. Es el único azul oscuro del mapa. */
export const COLOR_PROPIEDAD = "#0a1f33";

/** Color de cada categoría. Mismo valor en el PNG del mapa y en el punto de la referencia. */
export const COLOR_ZONA: Record<CategoriaZona, string> = {
  subte: "#1d4ed8",
  espacio_verde: "#15803d",
  escuela: "#b45309",
  hospital: "#be123c",
  comisaria: "#4338ca",
  ciclovia: "#0891b2",
  farmacia: "#7c3aed",
  ecobici: "#0d9488",
  parada_colectivo: "#525252",
};

/** lon/lat → coordenadas de tile fraccionarias (Web Mercator). */
export function aTile(lat: number, lon: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const latRad = (lat * Math.PI) / 180;
  return {
    x: ((lon + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  };
}

/** Esquina superior izquierda del recorte, en tiles enteros. */
export function origenDelRecorte(centro: { lat: number; lon: number }): { x0: number; y0: number } {
  const t = aTile(centro.lat, centro.lon, ZOOM);
  return {
    x0: Math.floor(t.x) - Math.floor(ANCHO_TILES / 2),
    y0: Math.floor(t.y) - Math.floor(ALTO_TILES / 2),
  };
}

export interface MarcadorZona {
  categoria: CategoriaZona;
  /** Píxel dentro de la imagen de 768 × 1024. */
  x: number;
  y: number;
}

/**
 * Los marcadores que el mapa efectivamente dibuja.
 *
 * Quedan afuera los que no tienen punto propio (los conteos: "8 farmacias a menos de 5 cuadras"
 * no es un lugar) y los que caen fuera del recorte (un hospital puede estar a 3 km).
 */
export function marcadoresDibujados(centro: { lat: number; lon: number } | null, pois: FichaZonaPoi[]): MarcadorZona[] {
  if (!centro || !Number.isFinite(centro.lat) || !Number.isFinite(centro.lon)) return [];
  const { x0, y0 } = origenDelRecorte(centro);

  const marcadores: MarcadorZona[] = [];
  for (const p of pois) {
    if (marcadores.length >= MAX_MARCADORES) break;
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    const t = aTile(p.lat as number, p.lon as number, ZOOM);
    const x = (t.x - x0) * TILE;
    const y = (t.y - y0) * TILE;
    if (x < MARGEN || y < MARGEN || x > ANCHO - MARGEN || y > ALTO - MARGEN) continue;
    marcadores.push({ categoria: p.categoria, x, y });
  }
  return marcadores;
}

/** Categorías que el cliente va a ver pintadas en el mapa (para armar las referencias). */
export function categoriasEnElMapa(zona: Pick<FichaZona, "centro" | "pois">): Set<CategoriaZona> {
  return new Set(marcadoresDibujados(zona.centro, zona.pois).map((m) => m.categoria));
}
