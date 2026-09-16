import { describe, it, expect } from "vitest"
import { unidadesTotales, normalizarDireccion, validarDireccion, TIPOS, ETAPAS } from "./direcciones"

/**
 * Las reglas de la tarjeta de la caminata. Lo que sostiene este archivo:
 *  1. Las unidades NO se cargan a mano: salen de pisos × unidades por piso, o del número suelto
 *     cuando no hay pisos (una casa es 1).
 *  2. La dirección comparable tiene que dar IGUAL para «Av. Ejemplo 1200» y «av  ejemplo 1200»,
 *     o dos asesores que comparten zona cargan la misma puerta dos veces.
 *  3. Lo único obligatorio es la calle y el tipo. El asesor está en la vereda, no en la oficina.
 *  4. Las seis columnas del tablero, más «descartada», en el orden del spec.
 */

describe("unidadesTotales", () => {
  it("un edificio: pisos por unidades por piso", () => {
    expect(unidadesTotales({ pisos: 8, unidades_por_piso: 4, unidades_manual: null })).toBe(32)
  })

  it("sin pisos, vale el número suelto (una casa es 1)", () => {
    expect(unidadesTotales({ pisos: null, unidades_por_piso: null, unidades_manual: 1 })).toBe(1)
  })

  it("los pisos le ganan al número suelto: la regla es que no se carga a mano", () => {
    expect(unidadesTotales({ pisos: 3, unidades_por_piso: 2, unidades_manual: 99 })).toBe(6)
  })

  it("sin nada, no inventa un número", () => {
    expect(unidadesTotales({ pisos: null, unidades_por_piso: null, unidades_manual: null })).toBeNull()
    expect(unidadesTotales({ pisos: 8, unidades_por_piso: null, unidades_manual: null })).toBeNull()
  })
})

describe("normalizarDireccion", () => {
  it("la misma puerta escrita de dos maneras da lo mismo", () => {
    expect(normalizarDireccion("Av. Ejemplo", "1200")).toBe(normalizarDireccion("av. ejemplo", " 1200 "))
  })

  it("los acentos no cuentan", () => {
    expect(normalizarDireccion("Güemes", "450")).toBe(normalizarDireccion("Guemes", "450"))
  })

  it("los espacios de más tampoco", () => {
    expect(normalizarDireccion("Av   Ejemplo", "1200")).toBe("av ejemplo 1200")
  })

  it("el punto de la abreviatura tampoco: «Av. Ejemplo» y «Av Ejemplo» son la misma puerta", () => {
    expect(normalizarDireccion("Av. Ejemplo", "1200")).toBe(normalizarDireccion("Av Ejemplo", "1200"))
    expect(normalizarDireccion("Av. Ejemplo", "1200")).toBe("av ejemplo 1200")
  })

  it("sin altura (el «s/n») no rompe", () => {
    expect(normalizarDireccion("Camino Real", null)).toBe("camino real")
  })
})

describe("validarDireccion", () => {
  it("con calle y tipo alcanza", () => {
    expect(validarDireccion({ calle: "Conde", tipo: "edificio" })).toEqual([])
  })

  it("sin calle no se guarda, y lo dice en criollo", () => {
    const e = validarDireccion({ tipo: "casa" })
    expect(e).toHaveLength(1)
    expect(e[0]).toMatch(/calle/i)
  })

  it("un tipo que no existe se rechaza", () => {
    expect(validarDireccion({ calle: "Conde", tipo: "castillo" as any })).toHaveLength(1)
  })

  it("pisos sin unidades por piso avisa, porque el total quedaría en blanco", () => {
    const e = validarDireccion({ calle: "Conde", tipo: "edificio", pisos: 8 })
    expect(e.some((x) => /unidades/i.test(x))).toBe(true)
  })

  it("un precio sin moneda no se guarda", () => {
    const e = validarDireccion({ calle: "Conde", tipo: "casa", precio_pedido: 180000 })
    expect(e.some((x) => /moneda/i.test(x))).toBe(true)
  })

  it("junta todos los problemas, no corta en el primero", () => {
    expect(validarDireccion({ pisos: 8, precio_pedido: 1 }).length).toBeGreaterThan(2)
  })
})

describe("las listas cerradas", () => {
  it("las seis columnas más descartada, en el orden del spec", () => {
    expect(ETAPAS.map((e) => e.clave)).toEqual([
      "relevado", "presentado", "en_secuencia", "respondio", "tasacion", "captada", "descartada",
    ])
  })

  it("los tipos de propiedad son los del spec", () => {
    expect(TIPOS.map((t) => t.clave)).toEqual(["edificio", "casa", "ph", "local", "oficina", "lote", "otro"])
  })
})
