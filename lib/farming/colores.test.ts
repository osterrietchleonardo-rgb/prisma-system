import { describe, it, expect } from "vitest"
import { coloresPorAsesor, PALETA_ASESORES } from "./colores"

/**
 * Un color por asesor en el mapa y la lista del director. Las reglas:
 *  1. El mismo asesor tiene siempre el mismo color, aparezca las veces que aparezca.
 *  2. Dos asesores distintos no comparten color mientras la paleta alcance.
 *  3. Si hay más asesores que colores, se repite en orden (no explota, no queda sin color).
 *  4. Ningún color es el rojo del choque ni el verde de la zona propia.
 */
describe("coloresPorAsesor", () => {
  it("el mismo asesor repetido tiene un solo color, en orden de aparición", () => {
    const c = coloresPorAsesor(["juan", "maria", "juan"])
    expect(c.size).toBe(2)
    expect(c.get("juan")).toBe(PALETA_ASESORES[0])
    expect(c.get("maria")).toBe(PALETA_ASESORES[1])
  })

  it("con más asesores que colores, vuelve a empezar la paleta", () => {
    const ids = Array.from({ length: PALETA_ASESORES.length + 2 }, (_, i) => `a${i}`)
    const c = coloresPorAsesor(ids)
    expect(c.get(`a${PALETA_ASESORES.length}`)).toBe(PALETA_ASESORES[0])
    expect(c.get(`a${PALETA_ASESORES.length + 1}`)).toBe(PALETA_ASESORES[1])
  })

  it("la paleta no usa el rojo del choque (#b91c1c) ni el verde de la zona propia (#15803d)", () => {
    expect(PALETA_ASESORES).not.toContain("#b91c1c")
    expect(PALETA_ASESORES).not.toContain("#15803d")
    expect(new Set(PALETA_ASESORES).size).toBe(PALETA_ASESORES.length)
  })

  it("sin asesores, mapa vacío", () => {
    expect(coloresPorAsesor([]).size).toBe(0)
  })
})
