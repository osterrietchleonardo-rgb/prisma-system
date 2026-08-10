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

  it("descarta el análisis aunque esté mezclado en el mismo párrafo, sin salto de línea de por medio", () => {
    // Forma de salida real: el modelo mete el "Análisis:" y la "Descripción:"
    // en la misma prosa corrida, sin línea en blanco que las separe.
    const t = "Análisis: se observan pisos de madera y buena luz. Descripción: Departamento de dos ambientes, luminoso."
    expect(sanearDescripcionIA(t)).toBe("Departamento de dos ambientes, luminoso.")
  })

  it("descarta el análisis aunque las etiquetas vengan envueltas en markdown (negrita)", () => {
    const t = "**Análisis:**\nSe observan pisos de madera y buena luz.\n\n**Descripción final:**\nDepto luminoso, dos ambientes."
    expect(sanearDescripcionIA(t)).toBe("Depto luminoso, dos ambientes.")
  })

  it("no descarta un párrafo legítimo que arranca con 'Observaciones:' solo porque comparte texto con el análisis", () => {
    // "Observaciones" no es palabra reservada del andamiaje: es una forma
    // normal de arrancar un dato real de la propiedad (ver hallazgo Minor).
    const t = "Análisis visual: se observan pisos de madera.\n\nObservaciones: apto profesional, sin cochera.\n\nDepartamento luminoso al frente."
    expect(sanearDescripcionIA(t)).toBe("Observaciones: apto profesional, sin cochera. Departamento luminoso al frente.")
  })

  it("saca los cercos de markdown aunque no estén pegados al borde del string", () => {
    const t = "Nota:\n```\nDepartamento luminoso al frente.\n```"
    expect(sanearDescripcionIA(t)).toBe("Nota: Departamento luminoso al frente.")
  })

  it("descarta el análisis aunque el modelo NUNCA imprima una segunda etiqueta de cierre", () => {
    // Este es el caso realista: el prompt le PROHÍBE al modelo imprimir
    // "Descripción:", así que la desobediencia parcial más probable es que
    // filtre el "Análisis:" y siga derecho con el texto final, sin rotularlo.
    const t = "Análisis: se observan pisos de madera y buena luz. El departamento tiene dos ambientes, es luminoso y de buena categoría."
    expect(sanearDescripcionIA(t)).toBe("El departamento tiene dos ambientes, es luminoso y de buena categoría.")
  })

  it("descarta el análisis con encabezados markdown (##), no solo negrita", () => {
    const t = "## Análisis\nSe observan pisos de madera y buena luz.\n\n## Descripción final\nDepto luminoso, dos ambientes."
    expect(sanearDescripcionIA(t)).toBe("Depto luminoso, dos ambientes.")
  })

  it("descarta el análisis con itálica simple (_texto_), no solo negrita (__/**)", () => {
    const t = "_Análisis:_ se observan pisos de madera y buena luz.\n\n_Descripción final:_ Depto luminoso, dos ambientes."
    expect(sanearDescripcionIA(t)).toBe("Depto luminoso, dos ambientes.")
  })

  it("descarta el análisis con una combinación de marcadores no probada antes (blockquote + negrita)", () => {
    // No es un marcador más para enumerar: prueba que la normalización de
    // arranque de línea (#, >, -, backtick, espacios) es genérica, no una
    // lista de casos especiales.
    const t = "> **Análisis:** se observan pisos de madera y buena luz.\n\n> **Descripción final:** Depto luminoso, dos ambientes."
    expect(sanearDescripcionIA(t)).toBe("Depto luminoso, dos ambientes.")
  })

  it("NO toca una etiqueta que aparece en medio de una oración real (prosa inmobiliaria normal)", () => {
    // Regresión de la ronda anterior: "buscar la etiqueta en cualquier parte
    // del texto" se comía descripciones legítimas. "Como resultado:" es
    // prosa argentina normal, no un separador de andamiaje.
    const t = "El departamento tiene dos ambientes, cocina integrada y buena luz natural. Como resultado: apto para invertir o vivir."
    expect(sanearDescripcionIA(t)).toBe(t)
  })

  it("NO toca 'descripción' cuando aparece en medio de una oración real", () => {
    const t = "El living es amplio y tiene buena descripción: los ambientes están bien distribuidos y con luz natural."
    expect(sanearDescripcionIA(t)).toBe(t)
  })

  it("devuelve vacío (nunca el razonamiento) cuando el párrafo es 100% andamiaje, sin nada rescatable", () => {
    const t = "Análisis: se observan pisos de madera y buena luz natural en el living."
    expect(sanearDescripcionIA(t)).toBe("")
  })

  it("no regresión: una descripción inmobiliaria realista, limpia y de varios párrafos sale intacta", () => {
    const t = "Departamento de dos ambientes al frente, con muy buena luz natural durante todo el día. Living comedor integrado con cocina, piso de madera en buen estado de conservación. Dormitorio con placard, baño completo. Edificio con portero y ascensor, a metros del subte."
    expect(sanearDescripcionIA(t)).toBe(t)
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

  it("no rompe con vacío", () => {
    expect(recortarAPalabra("", 700)).toBe("")
  })

  it("no deja una coma colgando cuando el corte cae justo después de ella", () => {
    // Con max=21 el límite de palabra cae exactamente después de la coma:
    // "Departamento amplio," queda como una frase rota en la hoja impresa.
    const r = recortarAPalabra("Departamento amplio, luminoso.", 21)
    expect(r).toBe("Departamento amplio")
    expect(r.endsWith(",")).toBe(false)
  })
})
