import { describe, it, expect } from "vitest"
import { verNumero, leerNumero } from "./campo-numerico"

describe("campos numéricos del ACM", () => {
  // El bug: `sujeto.piso || ''` borraba el 0 de la pantalla, porque en JS el 0 es "falso".
  // La etiqueta del campo dice "Piso (0 = PB)" y el input no dejaba escribir 0.
  it("el 0 se ve, porque es un valor real: PB, monoambiente, lote sin construir", () => {
    expect(verNumero(0)).toBe("0")
  })

  it("un número cualquiera se ve tal cual", () => {
    expect(verNumero(122)).toBe("122")
    expect(verNumero(45.5)).toBe("45.5")
  })

  it("el campo que nunca se cargó se ve vacío, no como 0", () => {
    expect(verNumero(undefined)).toBe("")
    expect(verNumero(null)).toBe("")
    expect(verNumero(Number.NaN)).toBe("")
  })

  // "Borré el campo" y "es planta baja" no son lo mismo, y el ACM tiene que poder
  // distinguirlos: si no, un formulario en blanco afirma PB y monoambiente.
  it("borrar el campo lo deja sin cargar, no en 0", () => {
    expect(leerNumero("")).toBeUndefined()
    expect(leerNumero("   ")).toBeUndefined()
  })

  it("lo que se escribe se lee como número, y el 0 sobrevive", () => {
    expect(leerNumero("0")).toBe(0)
    expect(leerNumero("7")).toBe(7)
  })

  it("un texto que no es número no ensucia el sujeto con NaN", () => {
    expect(leerNumero("abc")).toBeUndefined()
  })
})
