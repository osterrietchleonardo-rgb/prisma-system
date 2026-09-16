import { describe, it, expect } from "vitest"
import { unidadesTotales, normalizarDireccion, validarDireccion, partirDireccion, tipoDesdeAviso, TIPOS, ETAPAS } from "./direcciones"

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

  it("rechaza números negativos o cero: no muestra «-15 unidades» en el preview", () => {
    expect(unidadesTotales({ pisos: -5, unidades_por_piso: 3, unidades_manual: null })).toBeNull()
    expect(unidadesTotales({ pisos: 0, unidades_por_piso: 4, unidades_manual: null })).toBeNull()
    expect(unidadesTotales({ pisos: null, unidades_por_piso: null, unidades_manual: 0 })).toBeNull()
    expect(unidadesTotales({ pisos: null, unidades_por_piso: null, unidades_manual: -3 })).toBeNull()
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
    const res = validarDireccion({ calle: "Conde", tipo: "edificio" })
    expect(res.errores).toEqual([])
    expect(res.avisos).toEqual([])
  })

  it("sin calle no se guarda, y lo dice en criollo", () => {
    const res = validarDireccion({ tipo: "casa" })
    expect(res.errores).toHaveLength(1)
    expect(res.errores[0]).toMatch(/calle/i)
  })

  it("un tipo que no existe se rechaza", () => {
    const res = validarDireccion({ calle: "Conde", tipo: "castillo" as any })
    expect(res.errores).toHaveLength(1)
  })

  // El arreglo de una línea: `if (!e.tipo)` disparaba TAMBIÉN la rama de "presente pero
  // inválido" para un tipo falsy-pero-no-nulo (""), duplicando la misma frase. Con
  // `e.tipo == null` las dos ramas son mutuamente excluyentes.
  it("un tipo vacío (string) da el mensaje una sola vez, no duplicado", () => {
    const res = validarDireccion({ calle: "Conde", tipo: "" as any })
    const veces = res.errores.filter((x) => x === "Elegí qué tipo de propiedad es.").length
    expect(veces).toBe(1)
  })

  it("pisos sin unidades por piso avisa, pero no bloquea: errores vacío, avisos lleno", () => {
    const res = validarDireccion({ calle: "Conde", tipo: "edificio", pisos: 8 })
    expect(res.errores).toEqual([])
    expect(res.avisos.some((x) => /unidades/i.test(x))).toBe(true)
  })

  it("unidades por piso sin pisos avisa, pero no bloquea: errores vacío", () => {
    const res = validarDireccion({ calle: "Conde", tipo: "edificio", unidades_por_piso: 4 })
    expect(res.errores).toEqual([])
    expect(res.avisos.some((x) => /pisos/i.test(x))).toBe(true)
  })

  it("un precio sin moneda avisa, pero no bloquea: errores vacío", () => {
    const res = validarDireccion({ calle: "Conde", tipo: "casa", precio_pedido: 180000 })
    expect(res.errores).toEqual([])
    expect(res.avisos.some((x) => /moneda/i.test(x))).toBe(true)
  })

  it("cartel de inmobiliaria sin nombre avisa, pero no bloquea: errores vacío", () => {
    const res = validarDireccion({ calle: "Conde", tipo: "casa", cartel: "inmobiliaria" })
    expect(res.errores).toEqual([])
    expect(res.avisos.some((x) => /inmobiliaria/i.test(x))).toBe(true)
  })

  it("junta todos los problemas en sus respectivos vectores: errores con errores, avisos con avisos", () => {
    const res = validarDireccion({ pisos: 8, precio_pedido: 1 })
    expect(res.errores.length).toBeGreaterThan(0) // calle y tipo
    expect(res.avisos.length).toBeGreaterThan(0) // pisos sin unidades, precio sin moneda
  })

  // Los mismos topes que los `check` de la migración: un valor imposible es un ERROR (bloquea),
  // no un aviso — si no, llega crudo a Postgres y sale como un 23514 sin traducir.
  it("pisos afuera de 1-200 bloquea", () => {
    expect(validarDireccion({ calle: "Conde", tipo: "edificio", pisos: 0, unidades_por_piso: 1 }).errores.length).toBeGreaterThan(0)
    expect(validarDireccion({ calle: "Conde", tipo: "edificio", pisos: 300, unidades_por_piso: 1 }).errores.length).toBeGreaterThan(0)
  })

  it("pisos en el borde (1 y 200) no bloquea", () => {
    expect(validarDireccion({ calle: "Conde", tipo: "edificio", pisos: 1, unidades_por_piso: 1 }).errores).toEqual([])
    expect(validarDireccion({ calle: "Conde", tipo: "edificio", pisos: 200, unidades_por_piso: 1 }).errores).toEqual([])
  })

  it("unidades_por_piso afuera de 1-200 bloquea", () => {
    const res = validarDireccion({ calle: "Conde", tipo: "edificio", pisos: 1, unidades_por_piso: 500 })
    expect(res.errores.length).toBeGreaterThan(0)
  })

  it("unidades_manual afuera de 1-5000 bloquea", () => {
    expect(validarDireccion({ calle: "Conde", tipo: "casa", unidades_manual: 0 }).errores.length).toBeGreaterThan(0)
    expect(validarDireccion({ calle: "Conde", tipo: "casa", unidades_manual: 99999 }).errores.length).toBeGreaterThan(0)
  })

  it("unidades_manual en el borde (1 y 5000) no bloquea", () => {
    expect(validarDireccion({ calle: "Conde", tipo: "casa", unidades_manual: 1 }).errores).toEqual([])
    expect(validarDireccion({ calle: "Conde", tipo: "casa", unidades_manual: 5000 }).errores).toEqual([])
  })

  it("una moneda que no es USD ni ARS bloquea, aunque haya precio", () => {
    const res = validarDireccion({ calle: "Conde", tipo: "casa", precio_pedido: 100, moneda: "EUR" as any })
    expect(res.errores.length).toBeGreaterThan(0)
    expect(res.errores.some((x) => /moneda/i.test(x))).toBe(true)
  })

  it("un cartel que no existe bloquea", () => {
    const res = validarDireccion({ calle: "Conde", tipo: "casa", cartel: "cualquiera" as any })
    expect(res.errores.length).toBeGreaterThan(0)
  })

  it("los carteles válidos (dueno, inmobiliaria con nombre, sin_cartel) no bloquean", () => {
    expect(validarDireccion({ calle: "Conde", tipo: "casa", cartel: "dueno" }).errores).toEqual([])
    expect(validarDireccion({ calle: "Conde", tipo: "casa", cartel: "sin_cartel" }).errores).toEqual([])
    expect(validarDireccion({ calle: "Conde", tipo: "casa", cartel: "inmobiliaria", inmobiliaria_cartel: "Vakdor" }).errores).toEqual([])
  })
})

describe("partirDireccion", () => {
  it("calle y altura simples", () => {
    expect(partirDireccion("Conde 900")).toEqual({ calle: "Conde", altura: "900" })
  })

  it("una calle con abreviatura y varias palabras", () => {
    expect(partirDireccion("Av. Santa Fe 3200")).toEqual({ calle: "Av. Santa Fe", altura: "3200" })
  })

  it("sin número: la calle entera, altura null", () => {
    expect(partirDireccion("Camino Real")).toEqual({ calle: "Camino Real", altura: null })
  })

  it("texto después del número: el número final —no el del medio— es la altura", () => {
    // Regla literal (regex simple): todo lo que no sea el número FINAL es la calle. Acá el
    // final es "3" (de "piso 3"), no "900" — así que "900" queda adentro de la calle.
    expect(partirDireccion("Conde 900 piso 3")).toEqual({ calle: "Conde 900 piso", altura: "3" })
  })

  it("null da calle vacía y altura null", () => {
    expect(partirDireccion(null)).toEqual({ calle: "", altura: null })
  })

  it("vacío da calle vacía y altura null", () => {
    expect(partirDireccion("")).toEqual({ calle: "", altura: null })
  })
})

describe("tipoDesdeAviso", () => {
  it("mapea los seis tipos conocidos del portal", () => {
    expect(tipoDesdeAviso("Departamento")).toBe("edificio")
    expect(tipoDesdeAviso("Casa")).toBe("casa")
    expect(tipoDesdeAviso("PH")).toBe("ph")
    expect(tipoDesdeAviso("Local")).toBe("local")
    expect(tipoDesdeAviso("Oficina")).toBe("oficina")
    expect(tipoDesdeAviso("Terreno")).toBe("lote")
  })

  it("cualquier otra cosa, u null, cae en otro", () => {
    expect(tipoDesdeAviso("Cochera")).toBe("otro")
    expect(tipoDesdeAviso(null)).toBe("otro")
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
