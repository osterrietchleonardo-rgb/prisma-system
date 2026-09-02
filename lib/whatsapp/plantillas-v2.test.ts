import { describe, it, expect } from "vitest"
import { plantillasV2, plantillasEquipo, NOMBRES_V2, NOMBRES_EQUIPO } from "./plantillas-v2"

const cuentaVars = (body: string) => (body.match(/\{\{\d\}\}/g) ?? []).length

describe("catálogo de plantillas v2 (clientes)", () => {
  const cat = plantillasV2("ag57c613", "PRISMAIA - VAKDOR")
  it("son las 5 aprobadas, con prefijo y nombre de agencia", () => {
    expect(cat.map((p) => p.template_name)).toEqual(NOMBRES_V2.map((n) => `ag57c613_${n}`))
    for (const p of cat) expect(p.body).toContain("PRISMAIA - VAKDOR")
  })
  it("todas empiezan con el nombre y tienen exactamente {{1}} y {{2}} con sus ejemplos", () => {
    for (const p of cat) {
      expect(p.body.startsWith("Hola {{1}}")).toBe(true)
      expect(cuentaVars(p.body)).toBe(2)
      expect(p.body_examples).toHaveLength(2)
    }
  })
  it("regla de Meta (26/8): ninguna variable al principio ni al final del cuerpo", () => {
    for (const p of [...cat, ...plantillasEquipo("ag57c613")]) {
      expect(p.body.trim().startsWith("{{")).toBe(false)
      expect(p.body.trim().endsWith("}}")).toBe(false)
    }
  })
  it("ninguna trae la BAJA fija (la agrega el ejecutor desde el 2º seguimiento)", () => {
    for (const p of cat) expect(p.body).not.toMatch(/BAJA/)
  })
  it("seg_pendiente es UTILITY, el resto MARKETING", () => {
    for (const p of cat) expect(p.category).toBe(p.template_name.endsWith("seg_pendiente") ? "UTILITY" : "MARKETING")
  })
})

describe("catálogo del equipo (asesores/director)", () => {
  const cat = plantillasEquipo("ag57c613")
  it("son las 4 del análisis del 25/8, todas UTILITY, sin BAJA", () => {
    expect(cat.map((p) => p.template_name)).toEqual(NOMBRES_EQUIPO.map((n) => `ag57c613_${n}`))
    for (const p of cat) {
      expect(p.category).toBe("UTILITY")
      expect(p.body).not.toMatch(/BAJA/)
      expect(p.body.startsWith("Hola {{1}}")).toBe(true)
    }
  })
  it("cada plantilla tiene tantos ejemplos como variables, y el último es un link a PRISMA", () => {
    for (const p of cat) {
      expect(p.body_examples).toHaveLength(cuentaVars(p.body))
      expect(p.body_examples.at(-1)).toMatch(/^https:\/\/prisma\.vakdor\.com\//)
    }
  })
})
