import { describe, it, expect } from "vitest"
import { filtrarOportunidades } from "./gsc-oportunidades"

const fila = (query: string, url: string, position: number, impressions: number, clicks = 0) => ({
  keys: [query, url], clicks, impressions, position,
})

describe("filtrarOportunidades", () => {
  it("deja pasar solo posiciones 4 a 20 con impresiones suficientes", () => {
    const out = filtrarOportunidades([
      fila("ya rankea", "/a", 2.1, 500),   // muy arriba: no es una oportunidad, ya está
      fila("la buena", "/b", 7.4, 340),
      fila("muy abajo", "/c", 34.0, 900),  // fuera de rango: no alcanza con mejorar
      fila("ruido", "/d", 9.0, 1),         // una sola impresión no manda el calendario
    ])
    expect(out.map((o) => o.query)).toEqual(["la buena"])
  })

  it("incluye los bordes 4 y 20", () => {
    const out = filtrarOportunidades([fila("borde bajo", "/a", 4, 10), fila("borde alto", "/b", 20, 10)])
    expect(out).toHaveLength(2)
  })

  it("ordena por impresiones y corta en el límite", () => {
    const out = filtrarOportunidades(
      [fila("chica", "/a", 5, 10), fila("grande", "/b", 5, 900)],
      { limite: 1 },
    )
    expect(out.map((o) => o.query)).toEqual(["grande"])
  })

  it("redondea la posición a un decimal y conserva clicks", () => {
    const [o] = filtrarOportunidades([fila("q", "/a", 7.4444, 100, 3)])
    expect(o.position).toBe(7.4)
    expect(o.clicks).toBe(3)
    expect(o.url).toBe("/a")
  })

  it("tolera filas rotas sin explotar", () => {
    expect(filtrarOportunidades([{}, { keys: [] }, null as unknown as object])).toEqual([])
  })

  it("tolera que no venga la dimensión page", () => {
    // Si algún día la consulta pide solo `query`, la url queda vacía pero la fila sirve igual.
    const [o] = filtrarOportunidades([{ keys: ["solo query"], impressions: 50, position: 8 }])
    expect(o.query).toBe("solo query")
    expect(o.url).toBe("")
  })

  it("con una lista vacía o indefinida devuelve vacío", () => {
    expect(filtrarOportunidades([])).toEqual([])
    expect(filtrarOportunidades(undefined as unknown as unknown[])).toEqual([])
  })
})
