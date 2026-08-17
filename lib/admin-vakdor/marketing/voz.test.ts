import { describe, it, expect } from "vitest"
import {
  CLAVES_ESTRUCTURA, CLAVES_COMENTARIO, MULETILLAS,
  detectarMuletillas, instruccionCta, instruccionComentario, promptRevision, RUBRICA,
  momentoDeEtapa, estructurasCompatibles, claveValida,
} from "./voz"

describe("catálogos", () => {
  // OJO: estas listas ya NO validan nada. Son el set conocido para tipar; la validación
  // real va contra las claves activas de la base (claveValida), para que agregar una
  // estructura por SQL no requiera tocar código.
  it("tiene 9 estructuras y 5 tipos de comentario, sin repetidos", () => {
    expect(CLAVES_ESTRUCTURA).toHaveLength(9)
    expect(new Set(CLAVES_ESTRUCTURA).size).toBe(9)
    expect(CLAVES_COMENTARIO).toHaveLength(5)
    expect(new Set(CLAVES_COMENTARIO).size).toBe(5)
  })
})

describe("momentoDeEtapa", () => {
  it("ata cada etapa del embudo a su momento", () => {
    expect(momentoDeEtapa("tofu")).toBe("dolor")
    expect(momentoDeEtapa("mofu")).toBe("intento_fallido")
    expect(momentoDeEtapa("bofu")).toBe("resuelto")
  })
})

describe("estructurasCompatibles", () => {
  const banco = [
    { clave: "mito_realidad", propositos: ["convencer"] },
    { clave: "framework_pasos", propositos: ["ensenar"] },
    { clave: "autopsia", propositos: ["ensenar", "probar_con_dato"] },
  ]

  it("filtra a las que declaran el propósito", () => {
    expect(estructurasCompatibles(banco, "ensenar").map((e) => e.clave))
      .toEqual(["framework_pasos", "autopsia"])
  })

  it("sin propósito devuelve todas", () => {
    expect(estructurasCompatibles(banco, null)).toHaveLength(3)
  })

  it("si ninguna declara ese propósito devuelve todas, no vacío", () => {
    // Nunca bloquear la generación: una estructura menos afín es mejor que ninguna.
    expect(estructurasCompatibles(banco, "reflexionar")).toHaveLength(3)
  })

  it("tolera estructuras sin la columna propositos", () => {
    // El tipo va en la variable y no en el literal a propósito: pasado suelto, TypeScript
    // infiere el genérico desde su restricción y trata a `clave` como una propiedad de más.
    const sinLaColumna: Array<{ clave: string; propositos?: string[] }> = [{ clave: "vieja" }]
    expect(estructurasCompatibles(sinLaColumna, "ensenar")).toHaveLength(1)
  })
})

describe("claveValida", () => {
  it("acepta una clave que existe en la base aunque el código no la conozca", () => {
    // La prueba de que se dejó de validar contra la lista cerrada del código.
    expect(claveValida(["confesion", "estructura_inventada_hoy"], "estructura_inventada_hoy"))
      .toBe("estructura_inventada_hoy")
  })

  it("rechaza lo que no está y lo que no es string", () => {
    expect(claveValida(["confesion"], "no_existe")).toBeNull()
    expect(claveValida(["confesion"], 42)).toBeNull()
    expect(claveValida(["confesion"], null)).toBeNull()
  })

  it("normaliza espacios y mayúsculas", () => {
    expect(claveValida(["confesion"], "  CONFESION ")).toBe("confesion")
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

  it("usa el detalle de la base cuando viene", () => {
    const txt = instruccionComentario("dato_crudo", "tofu", "Texto nuevo desde la base.")
    expect(txt).toContain("Texto nuevo desde la base.")
    expect(txt).toMatch(/sin links/i)
  })

  it("cae al texto hardcodeado si el detalle viene vacío", () => {
    expect(instruccionComentario("dato_crudo", "tofu", "   ")).toContain("Un número real del negocio")
    expect(instruccionComentario("dato_crudo", "tofu", null)).toContain("Un número real del negocio")
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

  // El criterio 6 le pedía al juez que evaluara una regla que nunca le habíamos dicho.
  it("le da al juez la regla de CTA de la etapa (la respuesta del criterio 6)", () => {
    expect(promptRevision("PIEZA", "bofu", [])).toContain(instruccionCta("bofu"))
    expect(promptRevision("PIEZA", "tofu", [])).toContain(instruccionCta("tofu"))
    expect(promptRevision("PIEZA", "mofu", [])).toContain(instruccionCta("mofu"))
  })

  it("aclara que el primer comentario no está en la PIEZA, para no pedir el link en el cuerpo", () => {
    expect(promptRevision("PIEZA", "bofu", [])).toMatch(/primer comentario no está incluido/i)
  })

  // El criterio extra es solo para artículos: en LinkedIn cada criterio de más sube los
  // reintentos, y un reintento es una llamada paga en el formato que más se publica.
  it("con keyword suma el criterio de respuesta temprana", () => {
    const p = promptRevision("PIEZA", "mofu", [], { keyword: "leads inmobiliarios" })
    expect(p).toContain("leads inmobiliarios")
    expect(p).toMatch(/primeras 100 palabras/)
    expect(p).toMatch(new RegExp(`${RUBRICA.length + 1}\\. La búsqueda objetivo`))
  })

  it("sin keyword la rúbrica queda igual que hoy", () => {
    expect(promptRevision("PIEZA", "mofu", [])).not.toMatch(/primeras 100 palabras/)
  })

  it("una keyword vacía o de espacios no agrega criterio", () => {
    expect(promptRevision("PIEZA", "mofu", [], { keyword: "  " })).not.toMatch(/primeras 100 palabras/)
    expect(promptRevision("PIEZA", "mofu", [], { keyword: null })).not.toMatch(/primeras 100 palabras/)
  })
})
