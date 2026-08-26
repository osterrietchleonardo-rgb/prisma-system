// Convierte una zona dibujada a mano (GeoJSON) en el literal de polígono que entiende Postgres.
//
// Por qué existe: la búsqueda del Buscador IA recorta por el dibujo EN SQL, con
// `point(lng,lat) <@ polygono`. Esa forma exacta es la que engancha el índice
// `idx_roomix_geo_vigentes` y resuelve en 12 ms; escrito de cualquier otra manera Postgres lee
// la tabla entera (4.225 ms y 2.488 MB, medido el 26-ago-2026).
//
// GeoJSON escribe las coordenadas al revés de como se dicen: `[lng, lat]`. El índice está
// construido sobre `point(lng, lat)`, así que el orden se respeta tal cual viene.

/** Tope de vértices. Un dibujo a mano alzada trae ~300; más que esto es basura o un ataque. */
const MAX_VERTICES = 5000

/**
 * Devuelve el literal `((lng,lat),(lng,lat),...)` o `null` si el dibujo no sirve.
 *
 * Devuelve null en vez de tirar error a propósito: si una zona quedó guardada mal, la búsqueda
 * tiene que seguir andando sin el filtro de zona, no romperse. Quien llama decide qué decirle
 * al asesor.
 */
export function poligonoParaSql(geojson: unknown): string | null {
  const anillo = primerAnillo(geojson)
  if (!anillo || anillo.length < 3) return null
  if (anillo.length > MAX_VERTICES) return null

  const partes: string[] = []
  for (const punto of anillo) {
    if (!Array.isArray(punto) || punto.length < 2) return null
    const lng = Number(punto[0])
    const lat = Number(punto[1])
    // Un NaN o un infinito acá se convertiría en un literal inválido y Postgres tiraría un
    // error de sintaxis en medio de la búsqueda. Se corta antes.
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
    partes.push(`(${lng},${lat})`)
  }
  return `(${partes.join(',')})`
}

/** Saca el anillo exterior, sea un Polygon suelto, un Feature o una FeatureCollection. */
function primerAnillo(g: any): any[] | null {
  if (!g || typeof g !== 'object') return null
  if (g.type === 'FeatureCollection') return primerAnillo(g.features?.[0])
  if (g.type === 'Feature') return primerAnillo(g.geometry)
  if (g.type === 'Polygon') return Array.isArray(g.coordinates?.[0]) ? g.coordinates[0] : null
  if (g.type === 'MultiPolygon') return Array.isArray(g.coordinates?.[0]?.[0]) ? g.coordinates[0][0] : null
  return null
}
