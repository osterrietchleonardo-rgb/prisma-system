import { describe, it, expect } from "vitest"
import { resumirPieza, formatearMemoria } from "./store"
import type { Receta } from "./types"

const receta: Receta = {
  estructura: "contraste", proposito: "ensenar", cluster: "operacion",
  escenas: ["id-1"], comentario_tipo: "matiz",
  modelo: "claude-sonnet-5", revision: { aprobado: true, reintentos: 0 },
}

describe("resumirPieza", () => {
  it("toma la primera línea NO vacía como hook, completa", () => {
    const p = resumirPieza("\n\nEl lead entró un sábado a la noche.\n\nY nadie contestó.", receta)
    expect(p.hook).toBe("El lead entró un sábado a la noche.")
  })

  it("recorta la entrada a 400 caracteres", () => {
    const p = resumirPieza("Hook.\n" + "x".repeat(900), receta)
    expect(p.entrada.length).toBeLessThanOrEqual(400)
  })

  it("toma estructura y escenas de la receta", () => {
    const p = resumirPieza("Hook.\ncuerpo", receta)
    expect(p.estructura).toBe("contraste")
    expect(p.escenas).toEqual(["id-1"])
  })

  it("sin receta no rompe", () => {
    const p = resumirPieza("Hook.\ncuerpo", null)
    expect(p.estructura).toBeNull()
    expect(p.escenas).toEqual([])
  })

  it("con contenido vacío devuelve hook vacío", () => {
    expect(resumirPieza("", null).hook).toBe("")
  })
})

describe("formatearMemoria", () => {
  it("lista los hooks y nombra la prohibición de repetir", () => {
    const texto = formatearMemoria([resumirPieza("El lead del sábado.\ncuerpo largo", receta)])
    expect(texto).toContain("El lead del sábado.")
    expect(texto).toMatch(/no repitas/i)
    expect(texto).toContain("contraste")
  })

  it("sin piezas devuelve string vacío (no se inyecta nada al prompt)", () => {
    expect(formatearMemoria([])).toBe("")
  })
})
