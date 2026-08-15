import { describe, it, expect } from "vitest"
import {
  ESTRUCTURAS,
  ESTRUCTURAS_LISTA,
  sugerirEstructura,
  resolverEstructura,
  esquemaJsonGuion,
  guiaBloquesParaPrompt,
} from "./estructuras"

describe("catálogo de estructuras", () => {
  it("tiene las 6 estructuras pedidas", () => {
    expect(ESTRUCTURAS_LISTA.map((e) => e.id).sort()).toEqual(
      ["aida", "bab", "pas", "storytelling", "variante_1", "variante_2"]
    )
  })

  it("todas cierran con un bloque de CTA (un anuncio sin llamada a la acción no convierte)", () => {
    for (const e of ESTRUCTURAS_LISTA) {
      expect(e.bloques.at(-1)!.id).toBe("cta")
    }
  })

  it("todas tienen al menos 3 bloques, con título y guía", () => {
    for (const e of ESTRUCTURAS_LISTA) {
      expect(e.bloques.length).toBeGreaterThanOrEqual(3)
      for (const b of e.bloques) {
        expect(b.titulo.length).toBeGreaterThan(2)
        expect(b.guia.length).toBeGreaterThan(15)
      }
    }
  })

  it("la variante 1 y la variante 2 arrancan con la oferta", () => {
    expect(ESTRUCTURAS.variante_1.bloques.map((b) => b.id))
      .toEqual(["oferta", "problema", "solucion", "prueba_social", "cta"])
    expect(ESTRUCTURAS.variante_2.bloques.map((b) => b.id))
      .toEqual(["oferta", "prueba_social", "problema", "solucion", "cta"])
  })
})

describe("sugerirEstructura", () => {
  it("es determinista para los 5 niveles de consciencia", () => {
    expect(sugerirEstructura(0)).toBe("pas")
    expect(sugerirEstructura(1)).toBe("bab")
    expect(sugerirEstructura(2)).toBe("aida")
    expect(sugerirEstructura(3)).toBe("variante_2")
    expect(sugerirEstructura(4)).toBe("variante_1")
  })

  it("nunca sugiere storytelling (necesita un caso real cargado, va solo a mano)", () => {
    for (const nivel of [0, 1, 2, 3, 4] as const) {
      expect(sugerirEstructura(nivel)).not.toBe("storytelling")
    }
  })
})

describe("resolverEstructura", () => {
  it("respeta la que eligió el asesor", () => {
    expect(resolverEstructura("storytelling", 0)).toBe("storytelling")
  })

  it("sugiere cuando viene 'sugerida', vacío o basura", () => {
    expect(resolverEstructura("sugerida", 4)).toBe("variante_1")
    expect(resolverEstructura(undefined, 4)).toBe("variante_1")
    expect(resolverEstructura("no_existe" as never, 0)).toBe("pas")
  })
})

describe("render para el prompt", () => {
  it("el esquema JSON nombra cada bloque de la estructura", () => {
    const esquema = esquemaJsonGuion(ESTRUCTURAS.pas)
    for (const b of ESTRUCTURAS.pas.bloques) {
      expect(esquema).toContain(`"id": "${b.id}"`)
      expect(esquema).toContain(`"titulo": "${b.titulo}"`)
    }
    expect(esquema).toContain("segundos")
    expect(esquema).toContain("por_que")
  })

  it("la guía de bloques va numerada y en orden", () => {
    const guia = guiaBloquesParaPrompt(ESTRUCTURAS.aida)
    expect(guia.indexOf("1.")).toBeLessThan(guia.indexOf("2."))
    expect(guia).toContain(ESTRUCTURAS.aida.bloques[0].guia)
  })
})
