import { describe, it, expect } from "vitest"
import {
  CLAVES_ESTRUCTURA, CLAVES_COMENTARIO, MULETILLAS,
  detectarMuletillas, instruccionCta, instruccionComentario, promptRevision, RUBRICA,
} from "./voz"

describe("catálogos", () => {
  it("tiene 8 estructuras y 5 tipos de comentario, sin repetidos", () => {
    expect(CLAVES_ESTRUCTURA).toHaveLength(8)
    expect(new Set(CLAVES_ESTRUCTURA).size).toBe(8)
    expect(CLAVES_COMENTARIO).toHaveLength(5)
    expect(new Set(CLAVES_COMENTARIO).size).toBe(5)
  })
})

describe("muletillas", () => {
  it("detecta una muletilla sin importar mayúsculas ni tildes", () => {
    expect(detectarMuletillas("Hoy mas que nunca hay que actuar")).toContain("hoy más que nunca")
  })

  it("no marca un texto limpio", () => {
    expect(detectarMuletillas("Te escribe por un tres ambientes y le mandás un menú.")).toEqual([])
  })

  // Es la fórmula del post de mayor rendimiento histórico. Nunca se prohíbe.
  it("NO prohíbe la fórmula 'X no es Y'", () => {
    expect(detectarMuletillas("Automatizar no es poner un bot.")).toEqual([])
    expect(MULETILLAS.some((m) => /no es/.test(m))).toBe(false)
  })
})

describe("CTA por etapa", () => {
  it("TOFU no nombra el producto ni manda a la demostración", () => {
    const t = instruccionCta("tofu")
    expect(t).not.toMatch(/vakdor\.com\/demostracion/)
    expect(t).toMatch(/no nombres el producto/i)
  })

  it("MOFU explica el mecanismo y tampoco lleva link", () => {
    expect(instruccionCta("mofu")).not.toMatch(/vakdor\.com\/demostracion/)
    expect(instruccionCta("mofu")).toMatch(/P-R-I-S-M-A/)
  })

  it("BOFU manda al video y aclara que el link va en el primer comentario", () => {
    const t = instruccionCta("bofu")
    expect(t).toMatch(/vakdor\.com\/demostracion/)
    expect(t).toMatch(/primer comentario/i)
    expect(t).toMatch(/nunca en el cuerpo/i)
  })
})

describe("primer comentario", () => {
  it("en TOFU y MOFU prohíbe el link", () => {
    expect(instruccionComentario("matiz", "tofu")).toMatch(/sin links/i)
    expect(instruccionComentario("dato_crudo", "mofu")).toMatch(/sin links/i)
  })

  it("en BOFU pide el link al final", () => {
    expect(instruccionComentario("micro_caso", "bofu")).toMatch(/vakdor\.com\/demostracion/)
  })

  it("la pregunta binaria prohíbe explícitamente el '¿y vos qué opinás?'", () => {
    expect(instruccionComentario("pregunta_binaria", "tofu")).toMatch(/qué opinás/i)
  })
})

describe("rúbrica", () => {
  it("tiene los 7 criterios y el prompt incluye el texto y los hooks previos", () => {
    expect(RUBRICA).toHaveLength(7)
    const p = promptRevision("TEXTO DE LA PIEZA", "bofu", ["hook viejo uno"])
    expect(p).toContain("TEXTO DE LA PIEZA")
    expect(p).toContain("hook viejo uno")
    expect(p).toMatch(/"aprobado"/)
  })
})
