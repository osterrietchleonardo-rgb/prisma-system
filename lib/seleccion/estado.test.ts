import { describe, it, expect } from "vitest"
import {
  alternar,
  anotar,
  estaElegida,
  sacar,
  TOPE_SELECCION,
  type Candidata,
  type ItemSeleccion,
} from "./estado"

const candidata = (id: string): Candidata => ({
  id,
  source: "own",
  titulo: `Propiedad ${id}`,
  precio: 100000,
  moneda: "USD",
  foto: null,
})

const conN = (n: number): ItemSeleccion[] =>
  Array.from({ length: n }, (_, i) => ({ ...candidata(`p${i}`), nota: "" }))

describe("alternar", () => {
  it("agrega una que no estaba, al final", () => {
    const r = alternar(conN(2), candidata("nueva"))
    expect(r.error).toBeUndefined()
    expect(r.items.map((i) => i.id)).toEqual(["p0", "p1", "nueva"])
    expect(r.items[2].nota).toBe("")
  })

  it("saca una que ya estaba", () => {
    const r = alternar(conN(3), candidata("p1"))
    expect(r.items.map((i) => i.id)).toEqual(["p0", "p2"])
  })

  it("en el tope no agrega y avisa", () => {
    const llena = conN(TOPE_SELECCION)
    const r = alternar(llena, candidata("una-mas"))
    expect(r.items).toHaveLength(TOPE_SELECCION)
    expect(r.error).toContain(String(TOPE_SELECCION))
  })

  it("en el tope SÍ deja sacar una de las que ya están", () => {
    const llena = conN(TOPE_SELECCION)
    const r = alternar(llena, candidata("p0"))
    expect(r.error).toBeUndefined()
    expect(r.items).toHaveLength(TOPE_SELECCION - 1)
  })

  it("sacar y volver a agregar la manda al final y le borra la nota", () => {
    const conNota = anotar(conN(3), "p0", "la más luminosa")
    const sinElla = alternar(conNota, candidata("p0")).items
    const devuelta = alternar(sinElla, candidata("p0")).items
    expect(devuelta.map((i) => i.id)).toEqual(["p1", "p2", "p0"])
    expect(devuelta[2].nota).toBe("")
  })
})

describe("sacar / anotar / estaElegida", () => {
  it("sacar quita solo esa", () => {
    expect(sacar(conN(3), "p1").map((i) => i.id)).toEqual(["p0", "p2"])
  })

  it("anotar escribe la nota sin mover el orden", () => {
    const r = anotar(conN(3), "p1", "acepta permuta")
    expect(r.map((i) => i.id)).toEqual(["p0", "p1", "p2"])
    expect(r[1].nota).toBe("acepta permuta")
  })

  it("estaElegida contesta por id", () => {
    expect(estaElegida(conN(2), "p1")).toBe(true)
    expect(estaElegida(conN(2), "nop")).toBe(false)
  })
})
