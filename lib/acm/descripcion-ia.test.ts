import { describe, it, expect } from "vitest"
import { sanearDescripcionIA, recortarAPalabra, MAX_DESC_IA } from "./descripcion-ia"

describe("sanearDescripcionIA", () => {
  it("deja intacto un párrafo limpio", () => {
    const t = "Departamento de dos ambientes con muy buena luz natural."
    expect(sanearDescripcionIA(t)).toBe(t)
  })

  it("saca los cercos de markdown", () => {
    expect(sanearDescripcionIA("```\nTexto real.\n```")).toBe("Texto real.")
  })

  it("descarta el bloque de análisis previo si el modelo lo imprime", () => {
    const t = "Análisis visual: se observan pisos de madera y ventanas amplias.\n\nDepartamento luminoso al frente."
    expect(sanearDescripcionIA(t)).toBe("Departamento luminoso al frente.")
  })

  it("saca el prefijo 'Descripción:'", () => {
    expect(sanearDescripcionIA("Descripción: Casa en dos plantas.")).toBe("Casa en dos plantas.")
  })

  it("junta los saltos de línea en un solo párrafo", () => {
    expect(sanearDescripcionIA("Primera parte.\nSegunda parte.")).toBe("Primera parte. Segunda parte.")
  })

  it("no rompe con vacío", () => {
    expect(sanearDescripcionIA("")).toBe("")
  })

  it("no rompe con espacios en blanco solamente", () => {
    expect(sanearDescripcionIA("   \n\n   ")).toBe("")
  })
})

describe("recortarAPalabra", () => {
  it("no toca lo que ya entra", () => {
    expect(recortarAPalabra("corto", 700)).toBe("corto")
  })

  it("corta en límite de palabra, nunca a mitad", () => {
    const r = recortarAPalabra("uno dos tres cuatro", 11)
    expect(r).toBe("uno dos")
    expect(r.length).toBeLessThanOrEqual(11)
  })

  it("el tope duro es 700", () => {
    expect(MAX_DESC_IA).toBe(700)
  })

  it("corta duro si no hay ningún espacio antes del tope", () => {
    const r = recortarAPalabra("unapalabrasinespaciosnitildesnicortesposibles", 10)
    expect(r).toBe("unapalabra")
    expect(r.length).toBeLessThanOrEqual(10)
  })

  it("no toca un texto exactamente del largo del tope", () => {
    const t = "a".repeat(11)
    expect(recortarAPalabra(t, 11)).toBe(t)
  })

  it("no deja espacio colgando cuando el corte cae justo antes de un espacio", () => {
    // "uno dos " tiene 8 caracteres, el índice 8 sería el espacio entre "dos" y "tres".
    const r = recortarAPalabra("uno dos tres", 8)
    expect(r).toBe("uno dos")
    expect(r.endsWith(" ")).toBe(false)
  })
})
