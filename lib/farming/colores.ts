// Farming · un color por asesor en el mapa y la lista del director.
//
// Tonos 700: se leen sobre el mapa claro (el fondo es claro en los dos temas) y como punto
// al lado del nombre en la lista. Quedan afuera a propósito el rojo del choque (#b91c1c) y el
// verde de la zona propia (#15803d): si un asesor fuera rojo, su zona se confundiría con un
// choque.
export const PALETA_ASESORES: readonly string[] = [
  "#1d4ed8", // azul
  "#b45309", // ámbar
  "#7e22ce", // violeta
  "#0e7490", // cian
  "#be185d", // rosa
  "#4d7c0f", // oliva
  "#c2410c", // naranja
  "#4338ca", // índigo
]

/**
 * Asigna los colores en orden de aparición: el primer asesor de la lista toma el primer
 * color. Como la lista del director y el mapa salen del mismo arreglo, los dos coinciden.
 * Con más asesores que colores, la paleta vuelve a empezar.
 */
export function coloresPorAsesor(ownerIds: string[]): Map<string, string> {
  const colores = new Map<string, string>()
  for (const id of ownerIds) {
    if (!colores.has(id)) colores.set(id, PALETA_ASESORES[colores.size % PALETA_ASESORES.length])
  }
  return colores
}
