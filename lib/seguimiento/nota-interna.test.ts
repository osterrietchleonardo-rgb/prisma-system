import { describe, it, expect } from "vitest"
import { MARCADOR_HANDOFF, notaPosterior } from "./nota-interna"

/** Fake mínimo: cada from() devuelve una cadena donde todo método se encadena y
 *  maybeSingle() resuelve la primera fila que el test le dio para esa tabla. */
function dbDeUnaTabla(filaMaybeSingle: unknown) {
  const chain: Record<string, unknown> = {}
  for (const m of ["select", "eq", "not", "gt", "gte", "order", "limit", "contains", "in", "lt"])
    chain[m] = () => chain
  chain.maybeSingle = async () => ({ data: filaMaybeSingle })
  return { from: () => chain } as never
}

describe("notaPosterior", () => {
  it("devuelve la nota interna posterior a t0", async () => {
    const fila = { id: "n-1", content: "Ya lo llamé, visita el viernes", created_at: "2026-09-03T21:20:00Z" }
    const nota = await notaPosterior(dbDeUnaTabla(fila), "conv-1", "2026-09-03T20:09:00Z")
    expect(nota).toEqual(fila)
  })
  it("sin nota devuelve null", async () => {
    expect(await notaPosterior(dbDeUnaTabla(null), "conv-1", "2026-09-03T20:09:00Z")).toBeNull()
  })
  it("el marcador automático de handoff existe y arranca con el warning", () => {
    expect(MARCADOR_HANDOFF).toBe("⚠️ Handoff activado")
  })
})
