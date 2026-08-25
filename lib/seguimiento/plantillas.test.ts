import { describe, it, expect } from "vitest"
import { armarVariables, plantillaDesdeFila, BAJA } from "./plantillas"

describe("armarVariables", () => {
  it("v2 con 0 seguimientos previos: sin BAJA", () => {
    expect(armarVariables("seg_retomar", "Natalia", "La cochera era el tema que te frenaba.", 0))
      .toEqual(["Natalia", "La cochera era el tema que te frenaba."])
  })
  it("v2 con 1 seguimiento previo sin respuesta: agrega la BAJA (regla 25/8)", () => {
    const [, frase] = armarVariables("seg_retomar", "Natalia", "La cochera era el tema.", 1)
    expect(frase.endsWith(BAJA)).toBe(true)
  })
  it("seg_pendiente nunca lleva BAJA (es una disculpa, no marketing)", () => {
    const [, frase] = armarVariables("seg_pendiente", "Maia", "Quedó pendiente confirmarte la renta.", 2)
    expect(frase).not.toContain("BAJA")
  })
  it("f3 lleva solo el nombre (texto fijo)", () => {
    expect(armarVariables("seg_f3_breakup", "Juan", "esto se descarta", 2)).toEqual(["Juan"])
  })
  it("f1/f2 llevan nombre y frase, sin BAJA (no la tenían nunca)", () => {
    expect(armarVariables("seg_f1_seguimiento", "Juan", "¿Seguís buscando?", 1)).toEqual(["Juan", "¿Seguís buscando?"])
  })
})

describe("plantillaDesdeFila", () => {
  it("quita el prefijo de agencia y saca el texto del BODY", () => {
    const p = plantillaDesdeFila({
      template_name: "ag57c613_seg_valor",
      components: [{ type: "BODY", text: "Hola {{1}}, te escribo de X. {{2}} Si te sirve, decime." }],
    })
    expect(p).toEqual({ nombre: "seg_valor", texto: "Hola {{1}}, te escribo de X. {{2}} Si te sirve, decime." })
  })
  it("sin BODY devuelve null", () => {
    expect(plantillaDesdeFila({ template_name: "ag57c613_x", components: [] })).toBeNull()
  })
})
