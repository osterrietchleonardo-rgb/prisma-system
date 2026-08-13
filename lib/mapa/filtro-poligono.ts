// Recorte por los trazos del lapiz. Corre EN EL NAVEGADOR sobre las propiedades
// ya cargadas: no vuelve a consultar la base.
//
// Regla de negocio: varios trazos SE SUMAN (union). "Al cliente le gustan Belgrano
// y Nunez, mostrame las dos", no "lo que este en los dos a la vez".
import { booleanPointInPolygon, point } from "@turf/turf"

type ConUbicacion = { lat: number | null; lng: number | null }

/**
 * Devuelve las propiedades que caen dentro de AL MENOS UNO de los trazos.
 *
 * - Sin trazos: devuelve todas, sin filtrar.
 * - Sin coordenadas: queda afuera del mapa. El panel de resultados igual la lista,
 *   marcada "sin ubicacion", para que nunca desaparezca en silencio.
 * - Trazo invalido: se ignora ese trazo, pero no se cancela el filtro. Si TODOS son
 *   invalidos no devuelve nada, en vez de fingir que no habia filtro.
 */
export function filtrarPorTrazos<T extends ConUbicacion>(propiedades: T[], trazos: unknown[]): T[] {
  if (trazos.length === 0) return propiedades

  return propiedades.filter((p) => {
    if (typeof p.lat !== "number" || typeof p.lng !== "number") return false

    // GeoJSON va [lng, lat], al reves de como se escribe una coordenada.
    const punto = point([p.lng, p.lat])

    return trazos.some((trazo) => {
      try {
        return booleanPointInPolygon(punto, trazo as any)
      } catch {
        return false
      }
    })
  })
}
