// ACM · de las zonas que el asesor dibujó en el mapa a los literales de polígono de Postgres.
//
// Vive acá y no en lib/mapa a propósito: lib/mapa corre sus tests con `node --test` (así lo
// excluye vitest.config.ts) y esto se testea con vitest junto al resto del ACM. La conversión
// en sí no se reescribe: la hace `poligonoParaSql`, que ya está probada en producción desde el
// 26-ago-2026 con el Buscador IA.
import { poligonoParaSql } from "@/lib/mapa/poligono-sql"

/**
 * Cuántas zonas puede sumar una sola búsqueda.
 *
 * El tope de VÉRTICES por zona ya lo pone `poligonoParaSql` (5.000). Este es el otro lado: el
 * filtro se resuelve por índice con `<@ any(array)`, pero el array igual se recorre, y diez
 * zonas es más de lo que un ACM defendible necesita.
 */
export const MAX_ZONAS_POR_BUSQUEDA = 10

/** Una fila de `mapa_zonas`, con lo poco que hace falta acá. */
export interface ZonaFila {
  id: string
  nombre: string
  geojson: unknown
}

export interface ZonasResueltas {
  /** Literales `((lng,lat),...)` listos para `p_poligonos`. Mismo orden que `usadas`. */
  poligonos: string[]
  /** Las que efectivamente entraron a la búsqueda (para el snapshot y el chip de pantalla). */
  usadas: { id: string; nombre: string }[]
  /** Nombres de las que no se pudieron convertir. Se avisan; NUNCA se ignoran en silencio. */
  invalidas: string[]
}

/**
 * Un dibujo roto descarta SOLO a esa zona, no a la búsqueda: si alguna quedó mal guardada, las
 * demás tienen que seguir sirviendo. Pero se devuelve su nombre para que quien llama lo diga.
 *
 * Si NINGUNA convierte, esto devuelve `poligonos: []`. Quien llama tiene que avisar y no buscar:
 * buscar sin filtro sería devolver una búsqueda distinta de la que el asesor pidió.
 */
export function resolverZonas(filas: ZonaFila[]): ZonasResueltas {
  const poligonos: string[] = []
  const usadas: { id: string; nombre: string }[] = []
  const invalidas: string[] = []

  for (const fila of filas.slice(0, MAX_ZONAS_POR_BUSQUEDA)) {
    const poligono = poligonoParaSql(fila.geojson)
    if (poligono) {
      poligonos.push(poligono)
      usadas.push({ id: fila.id, nombre: fila.nombre })
    } else {
      invalidas.push(fila.nombre)
    }
  }

  return { poligonos, usadas, invalidas }
}
