import { describe, it, expect } from "vitest"
import { sanearDescripcionIA, recortarAPalabra, extraerDescripcion, MAX_DESC_IA } from "./descripcion-ia"

describe("extraerDescripcion", () => {
  it("extrae el campo 'descripcion' de un JSON válido", () => {
    const crudo = JSON.stringify({ analisis: "se observan pisos de madera", descripcion: "Depto luminoso, dos ambientes." })
    expect(extraerDescripcion(crudo)).toBe("Depto luminoso, dos ambientes.")
  })

  it("devuelve vacío si el JSON está roto", () => {
    expect(extraerDescripcion("{esto no es json")).toBe("")
  })

  it("devuelve vacío con el string vacío", () => {
    expect(extraerDescripcion("")).toBe("")
  })

  it("devuelve vacío si falta el campo 'descripcion'", () => {
    expect(extraerDescripcion(JSON.stringify({ analisis: "solo esto" }))).toBe("")
  })

  it("devuelve vacío si 'descripcion' no es un string (number)", () => {
    expect(extraerDescripcion(JSON.stringify({ analisis: "x", descripcion: 123 }))).toBe("")
  })

  it("devuelve vacío si 'descripcion' no es un string (null)", () => {
    expect(extraerDescripcion(JSON.stringify({ analisis: "x", descripcion: null }))).toBe("")
  })

  it("devuelve vacío si 'descripcion' ya viene vacía en el JSON", () => {
    expect(extraerDescripcion(JSON.stringify({ analisis: "x", descripcion: "" }))).toBe("")
  })

  it("con 'descripcion' vacía pero 'analisis' lleno, nunca devuelve el análisis", () => {
    // Esta es la trampa: NO hay que rescatar texto de 'analisis' cuando falta
    // 'descripcion'. Rescatar es exactamente el adivinar que este diseño elimina.
    const crudo = JSON.stringify({ analisis: "Se observan pisos de madera y buena luz.", descripcion: "" })
    expect(extraerDescripcion(crudo)).toBe("")
  })

  it("saca el cerco de markdown ```json ... ``` antes de parsear (rareza conocida de Gemini)", () => {
    const json = JSON.stringify({ analisis: "se observan pisos de madera", descripcion: "Depto luminoso, dos ambientes." })
    const crudo = "```json\n" + json + "\n```"
    expect(extraerDescripcion(crudo)).toBe("Depto luminoso, dos ambientes.")
  })

  it("saca el cerco de markdown sin el identificador de lenguaje (``` a secas)", () => {
    const json = JSON.stringify({ analisis: "x", descripcion: "Casa amplia con jardín." })
    const crudo = "```\n" + json + "\n```"
    expect(extraerDescripcion(crudo)).toBe("Casa amplia con jardín.")
  })

  it("con cerco pero JSON igual roto adentro, sigue sin rescatar nada", () => {
    // El contrato de no-rescate se mantiene: sacar el cerco es estructural,
    // pero si lo de adentro no es JSON válido, la salida sigue siendo "".
    expect(extraerDescripcion("```json\n{esto no es json\n```")).toBe("")
  })
})

describe("sanearDescripcionIA", () => {
  it("deja intacto un párrafo limpio", () => {
    const t = "Departamento de dos ambientes con muy buena luz natural."
    expect(sanearDescripcionIA(t)).toBe(t)
  })

  it("saca los cercos de markdown", () => {
    expect(sanearDescripcionIA("```\nTexto real.\n```")).toBe("Texto real.")
  })

  it("saca los cercos de markdown aunque no estén pegados al borde del string", () => {
    const t = "Nota:\n```\nDepartamento luminoso al frente.\n```"
    expect(sanearDescripcionIA(t)).toBe("Nota: Departamento luminoso al frente.")
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

  it("no regresión: una descripción inmobiliaria realista, limpia y de varios párrafos sale intacta", () => {
    const t = "Departamento de dos ambientes al frente, con muy buena luz natural durante todo el día. Living comedor integrado con cocina, piso de madera en buen estado de conservación. Dormitorio con placard, baño completo. Edificio con portero y ascensor, a metros del subte."
    expect(sanearDescripcionIA(t)).toBe(t)
  })

  it("YA NO se borra una descripción legítima que arranca con 'Análisis de la ubicación:'", () => {
    // Con salida estructurada, este texto YA ES la descripción (viene del campo
    // 'descripcion' del JSON, separado de 'analisis'): no hay ninguna regla de
    // andamiaje que deba tocarlo. "Análisis" es una palabra normal de un aviso.
    const t = "Análisis de la ubicación: el edificio está a dos cuadras del subte, con buena conectividad y comercios cercanos."
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
