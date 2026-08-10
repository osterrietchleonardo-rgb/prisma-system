import { describe, it, expect } from "vitest"
import { elegirRecursos, type Recurso } from "./recursos"

const r = (id: string, usos: number, ultimo_uso: string | null): Recurso => ({
  id, tipo: "escena", clave: null, titulo: `t-${id}`, detalle: `d-${id}`, usos, ultimo_uso,
})

describe("elegirRecursos", () => {
  it("prioriza el menos usado", () => {
    const out = elegirRecursos([r("a", 5, null), r("b", 1, null), r("c", 3, null)], 1, [])
    expect(out.map((x) => x.id)).toEqual(["b"])
  })

  it("a igual cantidad de usos, prioriza el que hace más tiempo no se usa (nulls primero)", () => {
    const out = elegirRecursos(
      [r("a", 2, "2026-08-09T00:00:00Z"), r("b", 2, null), r("c", 2, "2026-01-01T00:00:00Z")], 3, [])
    expect(out.map((x) => x.id)).toEqual(["b", "c", "a"])
  })

  it("excluye los ids pedidos", () => {
    const out = elegirRecursos([r("a", 0, null), r("b", 1, null)], 2, ["a"])
    expect(out.map((x) => x.id)).toEqual(["b"])
  })

  it("si al excluir no queda ninguno, recicla el menos usado en vez de devolver vacío", () => {
    const out = elegirRecursos([r("a", 7, null), r("b", 2, null)], 1, ["a", "b"])
    expect(out.map((x) => x.id)).toEqual(["b"])
  })

  it("devuelve como mucho la cantidad pedida", () => {
    expect(elegirRecursos([r("a", 0, null), r("b", 0, null), r("c", 0, null)], 2, [])).toHaveLength(2)
  })

  it("con la lista vacía devuelve vacío y no rompe", () => {
    expect(elegirRecursos([], 2, [])).toEqual([])
  })

  it("es determinista: dos llamadas iguales dan el mismo resultado", () => {
    const lista = [r("a", 1, null), r("b", 1, "2026-05-01T00:00:00Z"), r("c", 0, null)]
    expect(elegirRecursos(lista, 2, []).map((x) => x.id)).toEqual(elegirRecursos(lista, 2, []).map((x) => x.id))
  })
})
