import { describe, it, expect } from "vitest"
import {
  validarDibujo, areaKm2, contarPedazos, sumarPedazo, choquesContra, bboxDeDibujo,
  MAX_VERTICES, MAX_KM2, MAX_ZONAS_ACTIVAS, MIN_M2_CHOQUE,
  type Dibujo,
} from "./geometria"

/**
 * La geometría del territorio. Las reglas que sostiene este archivo:
 *  1. Un dibujo que no es polígono, no cierra, está fuera del mapa, tiene demasiados
 *     puntos o SE CRUZA CONSIGO MISMO (un 8) se rechaza con un motivo en criollo.
 *  2. El área se mide en km² sobre TODOS los pedazos.
 *  3. Sumar un pedazo suelto da MultiPolygon; sumar uno que se toca da un solo Polygon.
 *  4. Choque = superposición REAL: más de 100 m² o más del 1% de la zona más chica.
 *     Tocarse por una calle no es choque.
 *  5. El recorte del choque se devuelve para dibujarlo rayado.
 */

// Cuadrados en Belgrano. GeoJSON va [lng, lat]. A esta latitud, 0.01° de lng ≈ 0,92 km y
// 0.01° de lat ≈ 1,11 km, así que un cuadrado de 0.01 × 0.01 ronda 1 km².
const cuadrado = (lng: number, lat: number, lado = 0.01): Dibujo => ({
  type: "Polygon",
  coordinates: [[[lng, lat], [lng + lado, lat], [lng + lado, lat + lado], [lng, lat + lado], [lng, lat]]],
})

const LNG = -58.46
const LAT = -34.56

describe("validarDibujo", () => {
  it("acepta un cuadrado bien cerrado", () => {
    const v = validarDibujo(cuadrado(LNG, LAT))
    expect(v.ok).toBe(true)
  })

  it("acepta un MultiPolygon de dos pedazos", () => {
    const d: Dibujo = { type: "MultiPolygon", coordinates: [cuadrado(LNG, LAT).coordinates as any, cuadrado(LNG + 0.05, LAT).coordinates as any] }
    expect(validarDibujo(d).ok).toBe(true)
  })

  it.each<[string, unknown]>([
    ["null", null],
    ["un punto", { type: "Point", coordinates: [LNG, LAT] }],
    ["sin coordenadas", { type: "Polygon" }],
    ["anillo abierto", { type: "Polygon", coordinates: [[[LNG, LAT], [LNG + 0.01, LAT], [LNG + 0.01, LAT + 0.01], [LNG, LAT + 0.01]]] }],
    ["tres puntos", { type: "Polygon", coordinates: [[[LNG, LAT], [LNG + 0.01, LAT], [LNG, LAT]]] }],
    ["fuera del mapa", { type: "Polygon", coordinates: [[[200, LAT], [201, LAT], [201, LAT + 1], [200, LAT + 1], [200, LAT]]] }],
    ["coordenada NaN", { type: "Polygon", coordinates: [[[LNG, LAT], [NaN, LAT], [LNG + 0.01, LAT + 0.01], [LNG, LAT + 0.01], [LNG, LAT]]] }],
  ])("rechaza %s", (_, g) => {
    const v = validarDibujo(g)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.motivo.length).toBeGreaterThan(0)
  })

  it("rechaza un trazo con más de MAX_VERTICES puntos", () => {
    const anillo: number[][] = []
    for (let i = 0; i <= MAX_VERTICES; i++) {
      const a = (i / MAX_VERTICES) * 2 * Math.PI
      anillo.push([LNG + 0.01 * Math.cos(a), LAT + 0.01 * Math.sin(a)])
    }
    anillo.push(anillo[0])
    const v = validarDibujo({ type: "Polygon", coordinates: [anillo] })
    expect(v.ok).toBe(false)
  })

  it("rechaza un 8: el trazo que se cruza consigo mismo", () => {
    // Moño: las dos diagonales se cruzan en el medio.
    const ocho = { type: "Polygon", coordinates: [[[LNG, LAT], [LNG + 0.01, LAT + 0.01], [LNG + 0.01, LAT], [LNG, LAT + 0.01], [LNG, LAT]]] }
    const v = validarDibujo(ocho)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.motivo).toMatch(/cruza/)
  })

  it("acepta un trazo cuyo punto de cierre quedó duplicado (el lápiz lo repite dos veces)", () => {
    // El lápiz cierra el anillo agregando el primer punto; si el último punto muestreado YA
    // era ese punto, quedan dos [LNG, LAT] seguidos: antes, kinks() lo confundía con un cruce.
    const base = cuadrado(LNG, LAT)
    const conCierreDuplicado = { type: "Polygon" as const, coordinates: [[...base.coordinates[0], [LNG, LAT]]] }
    const v = validarDibujo(conCierreDuplicado)
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.dibujo.type).toBe("Polygon")
      const anillo = (v.dibujo as { coordinates: number[][][] }).coordinates[0]
      for (let i = 1; i < anillo.length; i++) {
        const igual = anillo[i][0] === anillo[i - 1][0] && anillo[i][1] === anillo[i - 1][1]
        expect(igual).toBe(false)
      }
    }
  })
})

describe("areaKm2 y contarPedazos", () => {
  it("un cuadrado de 0.01° ronda 1 km²", () => {
    const a = areaKm2(cuadrado(LNG, LAT))
    expect(a).toBeGreaterThan(0.9)
    expect(a).toBeLessThan(1.2)
  })

  it("dos pedazos suman sus áreas", () => {
    const d: Dibujo = { type: "MultiPolygon", coordinates: [cuadrado(LNG, LAT).coordinates as any, cuadrado(LNG + 0.05, LAT).coordinates as any] }
    expect(areaKm2(d)).toBeGreaterThan(1.8)
    expect(contarPedazos(d)).toBe(2)
    expect(contarPedazos(cuadrado(LNG, LAT))).toBe(1)
  })

  it("el tope de 5 km² y el de 3 zonas son los del spec", () => {
    expect(MAX_KM2).toBe(5)
    expect(MAX_ZONAS_ACTIVAS).toBe(3)
    expect(MIN_M2_CHOQUE).toBe(100)
  })
})

describe("sumarPedazo", () => {
  it("un pedazo suelto da un MultiPolygon de dos", () => {
    const r = sumarPedazo(cuadrado(LNG, LAT), cuadrado(LNG + 0.05, LAT))
    expect(r?.type).toBe("MultiPolygon")
    expect(r && contarPedazos(r)).toBe(2)
  })

  it("un pedazo que se solapa se funde en un solo Polygon", () => {
    const r = sumarPedazo(cuadrado(LNG, LAT), cuadrado(LNG + 0.005, LAT))
    expect(r?.type).toBe("Polygon")
    expect(r && areaKm2(r)).toBeGreaterThan(1.3)
  })

  it("se puede sumar un pedazo a una zona que ya tiene dos", () => {
    const dos = sumarPedazo(cuadrado(LNG, LAT), cuadrado(LNG + 0.05, LAT))!
    const tres = sumarPedazo(dos, cuadrado(LNG + 0.1, LAT))
    expect(tres && contarPedazos(tres)).toBe(3)
  })
})

describe("choquesContra", () => {
  const juan = { id: "zj", nombre: "Belgrano C", owner_nombre: "Juan Pérez", geojson: cuadrado(LNG, LAT) }

  it("sin superposición no hay choque", () => {
    expect(choquesContra(cuadrado(LNG + 0.05, LAT), [juan])).toEqual([])
  })

  it("compartir una calle (tocarse por el borde) NO es choque", () => {
    // Pegado a la derecha: comparten exactamente la arista x = LNG + 0.01.
    expect(choquesContra(cuadrado(LNG + 0.01, LAT), [juan])).toEqual([])
  })

  it("una superposición mínima (menos de 100 m²) NO es choque", () => {
    // Se mete 0.00005° (~5 m) en una franja de 0.0001° (~11 m): ~55 m².
    const pelo: Dibujo = { type: "Polygon", coordinates: [[[LNG + 0.00995, LAT], [LNG + 0.01, LAT], [LNG + 0.01, LAT + 0.0001], [LNG + 0.00995, LAT + 0.0001], [LNG + 0.00995, LAT]]] }
    expect(choquesContra(pelo, [juan])).toEqual([])
  })

  it("pisar la mitad devuelve el choque con el porcentaje y el recorte", () => {
    const r = choquesContra(cuadrado(LNG + 0.005, LAT), [juan])
    expect(r).toHaveLength(1)
    expect(r[0].zona_id).toBe("zj")
    expect(r[0].owner_nombre).toBe("Juan Pérez")
    expect(r[0].pct).toBeGreaterThanOrEqual(45)
    expect(r[0].pct).toBeLessThanOrEqual(55)
    expect(areaKm2(r[0].recorte)).toBeGreaterThan(0.4)
  })

  it("una zona chica adentro de una grande pisa solo una parte", () => {
    // El pct es de la zona AJENA (Juan), no del dibujo nuevo: 0.003² / 0.01² ≈ 9%.
    const r = choquesContra(cuadrado(LNG + 0.002, LAT + 0.002, 0.003), [juan])
    expect(r).toHaveLength(1)
    expect(r[0].pct).toBeGreaterThanOrEqual(7)
    expect(r[0].pct).toBeLessThanOrEqual(11)
  })

  it("revisa contra todas y devuelve solo las que pisa", () => {
    const maria = { id: "zm", nombre: "Núñez", owner_nombre: "María", geojson: cuadrado(LNG + 0.2, LAT) }
    const r = choquesContra(cuadrado(LNG + 0.005, LAT), [juan, maria])
    expect(r.map((c) => c.zona_id)).toEqual(["zj"])
  })

  it("un dibujo ajeno roto se saltea, no rompe el control", () => {
    const rota = { id: "zr", nombre: "Rota", owner_nombre: "X", geojson: { type: "Polygon", coordinates: [] } as any }
    expect(choquesContra(cuadrado(LNG + 0.005, LAT), [rota, juan])).toHaveLength(1)
  })
})

describe("bboxDeDibujo", () => {
  it("abarca todos los pedazos de un MultiPolygon", () => {
    const d = sumarPedazo(cuadrado(LNG, LAT), cuadrado(LNG + 0.05, LAT))!
    const b = bboxDeDibujo(d)!
    expect(b.oeste).toBeCloseTo(LNG, 5)
    expect(b.este).toBeCloseTo(LNG + 0.06, 5)
    expect(b.sur).toBeCloseTo(LAT, 5)
    expect(b.norte).toBeCloseTo(LAT + 0.01, 5)
  })
})
