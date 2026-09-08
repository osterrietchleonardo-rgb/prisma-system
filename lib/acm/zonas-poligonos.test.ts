import { describe, it, expect } from "vitest"
import { resolverZonas, MAX_ZONAS_POR_BUSQUEDA, type ZonaFila } from "./zonas-poligonos"

/**
 * De filas de `mapa_zonas` a los literales de polígono que entiende Postgres.
 *
 * Las tres reglas que sostiene este archivo:
 *  1. Un dibujo roto se ignora SOLO A ÉL y queda anotado por nombre — nunca cancela la búsqueda
 *     de las otras zonas ni desaparece en silencio.
 *  2. El orden de `poligonos` y de `usadas` es el mismo, y solo entran las que convirtieron.
 *  3. Hay un tope de zonas por búsqueda.
 */

// Un cuadrado válido alrededor de Belgrano. GeoJSON va [lng, lat].
const cuadrado = (lng: number, lat: number) => ({
  type: "Polygon",
  coordinates: [[[lng, lat], [lng + 0.01, lat], [lng + 0.01, lat + 0.01], [lng, lat + 0.01], [lng, lat]]],
})

const fila = (id: string, nombre: string, geojson: unknown): ZonaFila => ({ id, nombre, geojson })

describe("resolverZonas", () => {
  it("convierte una zona válida y la deja anotada como usada", () => {
    const r = resolverZonas([fila("z1", "Belgrano bajo", cuadrado(-58.45, -34.56))])

    expect(r.poligonos).toHaveLength(1)
    expect(r.poligonos[0].startsWith("((-58.45,-34.56)")).toBe(true)
    expect(r.usadas).toEqual([{ id: "z1", nombre: "Belgrano bajo" }])
    expect(r.invalidas).toEqual([])
  })

  it("convierte varias y mantiene el mismo orden en polígonos y en usadas", () => {
    const r = resolverZonas([
      fila("z1", "A", cuadrado(-58.45, -34.56)),
      fila("z2", "B", cuadrado(-58.47, -34.58)),
    ])

    expect(r.poligonos).toHaveLength(2)
    expect(r.usadas.map((z) => z.nombre)).toEqual(["A", "B"])
  })

  it("descarta SOLO el dibujo roto y lo anota por nombre", () => {
    const r = resolverZonas([
      fila("z1", "La buena", cuadrado(-58.45, -34.56)),
      fila("z2", "La rota", { type: "Polygon", coordinates: [[[-58.4, -34.5]]] }), // 1 punto: no es un anillo
    ])

    expect(r.poligonos).toHaveLength(1)
    expect(r.usadas.map((z) => z.nombre)).toEqual(["La buena"])
    expect(r.invalidas).toEqual(["La rota"])
  })

  it("cuando NINGUNA sirve devuelve cero polígonos: quien llama tiene que avisar, no buscar sin filtro", () => {
    const r = resolverZonas([fila("z2", "La rota", { type: "Point", coordinates: [-58.4, -34.5] })])

    expect(r.poligonos).toEqual([])
    expect(r.usadas).toEqual([])
    expect(r.invalidas).toEqual(["La rota"])
  })

  it("corta en el tope de zonas por búsqueda", () => {
    const muchas = Array.from({ length: MAX_ZONAS_POR_BUSQUEDA + 3 }, (_, i) =>
      fila(`z${i}`, `Zona ${i}`, cuadrado(-58.45 - i * 0.02, -34.56))
    )

    const r = resolverZonas(muchas)

    expect(r.poligonos).toHaveLength(MAX_ZONAS_POR_BUSQUEDA)
    expect(r.usadas).toHaveLength(MAX_ZONAS_POR_BUSQUEDA)
  })

  it("una lista vacía no es un error: cero polígonos y nada anotado", () => {
    const r = resolverZonas([])

    expect(r).toEqual({ poligonos: [], usadas: [], invalidas: [] })
  })
})
