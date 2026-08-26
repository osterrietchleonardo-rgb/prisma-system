import { describe, it, expect } from "vitest"
import {
  CAMPOS_PERFIL,
  CAMPOS_CAPTACION,
  CAMPOS_VENTA,
  operacionCompleta,
  camposFaltantes,
} from "./campos-operacion"

describe("catálogo de campos de la forma de trabajar", () => {
  it("tiene las 6 preguntas de captación y las 5 de venta del documento de Hormozi", () => {
    // Captación: volumen + %ACM cuentan como 2 campos separados (la pregunta 1 se parte en dos)
    expect(CAMPOS_CAPTACION).toHaveLength(7)
    // Venta: rebaja + off-market cuentan como 2 campos separados (la pregunta 2 se parte en dos)
    expect(CAMPOS_VENTA).toHaveLength(6)
    expect(CAMPOS_PERFIL).toHaveLength(8)
  })

  it("no repite nombres de campo dentro de cada bloque", () => {
    for (const bloque of [CAMPOS_PERFIL, CAMPOS_CAPTACION, CAMPOS_VENTA]) {
      const nombres = bloque.map((c) => c.name)
      expect(new Set(nombres).size).toBe(nombres.length)
    }
  })

  it("cada campo trae etiqueta y placeholder para que nadie vea un input mudo", () => {
    for (const campo of [...CAMPOS_PERFIL, ...CAMPOS_CAPTACION, ...CAMPOS_VENTA]) {
      expect(campo.label.length).toBeGreaterThan(5)
      expect(campo.placeholder.length).toBeGreaterThan(2)
    }
  })

  it("operacionCompleta exige captación y venta, pero nunca el perfil", () => {
    const lleno = (campos: { name: string }[]) =>
      Object.fromEntries(campos.map((c) => [c.name, "un valor real"]))

    expect(
      operacionCompleta({ perfil: {}, captacion: lleno(CAMPOS_CAPTACION), venta: lleno(CAMPOS_VENTA) })
    ).toBe(true)

    expect(
      operacionCompleta({ perfil: {}, captacion: lleno(CAMPOS_CAPTACION), venta: {} })
    ).toBe(false)

    const captacionCoja = { ...lleno(CAMPOS_CAPTACION), porcentaje_acm: " " }
    expect(
      operacionCompleta({ perfil: {}, captacion: captacionCoja, venta: lleno(CAMPOS_VENTA) })
    ).toBe(false)
  })
})

describe("qué cuenta como campo completo", () => {
  const lleno = (campos: { name: string }[]) =>
    Object.fromEntries(campos.map((c) => [c.name, "un valor real"]))

  // Caso real: Diego Capozzo cargó los 13 campos y el paso 4 seguía diciendo "faltan datos".
  // Su rebaja promedio era "2" (2%), un solo carácter, y la regla exigía dos.
  it("una respuesta de un solo carácter es válida: '2' es 2% de rebaja", () => {
    expect(
      operacionCompleta({
        perfil: {},
        captacion: lleno(CAMPOS_CAPTACION),
        venta: { ...lleno(CAMPOS_VENTA), rebaja_promedio: "2" },
      })
    ).toBe(true)
  })

  it("camposFaltantes nombra el bloque y la pregunta exacta que falta", () => {
    const faltantes = camposFaltantes({
      perfil: {},
      captacion: { ...lleno(CAMPOS_CAPTACION), compradores_activos: "   " },
      venta: lleno(CAMPOS_VENTA),
    })
    expect(faltantes).toHaveLength(1)
    expect(faltantes[0].bloque).toBe("Captación")
    expect(faltantes[0].label).toBe(
      CAMPOS_CAPTACION.find((c) => c.name === "compradores_activos")!.label
    )
  })

  it("camposFaltantes queda vacío cuando está todo, y nunca mira el perfil", () => {
    expect(
      camposFaltantes({ perfil: {}, captacion: lleno(CAMPOS_CAPTACION), venta: lleno(CAMPOS_VENTA) })
    ).toEqual([])
  })

  it("camposFaltantes lista los dos bloques cuando faltan campos en ambos", () => {
    const faltantes = camposFaltantes({ perfil: {}, captacion: {}, venta: {} })
    expect(faltantes).toHaveLength(CAMPOS_CAPTACION.length + CAMPOS_VENTA.length)
    expect(new Set(faltantes.map((f) => f.bloque))).toEqual(new Set(["Captación", "Venta"]))
  })
})
