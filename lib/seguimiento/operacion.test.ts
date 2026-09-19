import { describe, it, expect } from "vitest"
import { avisaPorEstaOperacion, OPERACIONES_SIN_AVISO } from "./operacion"

/**
 * LA REGLA DE KEVIN (19/9/2026): en ALQUILER no se persigue al equipo con avisos; en venta sí.
 *
 * Lo que más importa acá no es que calle en alquiler, sino que NO calle cuando no sabe: si un
 * dato falta o viene raro, el aviso sale. El silencio se elige, no se hereda de un campo vacío.
 */
describe("a qué operaciones se les avisa al equipo", () => {
  it("en alquiler NO se avisa", () => {
    expect(avisaPorEstaOperacion({ tipo_operacion: "alquiler" })).toBe(false)
  })

  it("en compra, venta e inversión SÍ se avisa", () => {
    for (const op of ["compra", "venta", "inversion", "inversión"]) {
      expect(avisaPorEstaOperacion({ tipo_operacion: op })).toBe(true)
    }
  })

  it("no se deja engañar por mayúsculas ni espacios", () => {
    expect(avisaPorEstaOperacion({ tipo_operacion: "  Alquiler " })).toBe(false)
    expect(avisaPorEstaOperacion({ tipo_operacion: "ALQUILAR" })).toBe(false)
  })

  it("si NO se sabe qué busca, se avisa igual", () => {
    expect(avisaPorEstaOperacion({})).toBe(true)
    expect(avisaPorEstaOperacion(null)).toBe(true)
    expect(avisaPorEstaOperacion(undefined)).toBe(true)
    expect(avisaPorEstaOperacion({ tipo_operacion: "" })).toBe(true)
    // el agente de n8n a veces escribe el texto "null" en vez de dejarlo vacío
    expect(avisaPorEstaOperacion({ tipo_operacion: "null" })).toBe(true)
    expect(avisaPorEstaOperacion({ tipo_operacion: "no sé todavía" })).toBe(true)
  })

  it("la lista de operaciones calladas se puede leer desde afuera (para explicarla)", () => {
    expect(OPERACIONES_SIN_AVISO).toContain("alquiler")
    expect(OPERACIONES_SIN_AVISO).not.toContain("compra")
  })
})
