import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * SUMAR UN COMPARABLE POR LINK: quién puede tocar qué ACM guardado.
 *
 *  1. El asesor solo guarda (o quita) en SUS búsquedas: la lectura filtra por user_id además de
 *     por agencia. El director, en cualquiera de su agencia. createAdminClient saltea RLS, así
 *     que ese filtro es la única defensa.
 *  2. Lo sumado queda en resultados.agregados, sin pisar el resto del snapshot.
 *  3. El mismo aviso pegado dos veces queda una sola vez.
 *  4. Quitar saca solo ese.
 */

const AGENCIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const ASESOR = "11111111-1111-4111-8111-111111111111"

const estado = vi.hoisted(() => ({
  rol: "asesor" as string,
  filtros: [] as Record<string, any>[],
  filas: [] as any[],
  updates: [] as any[],
  comparable: null as any,
}))

vi.mock("@/lib/auth/tenant-validation", () => ({
  requireTenant: async () => ({ userId: ASESOR, agencyId: AGENCIA, role: estado.rol }),
}))

vi.mock("@/lib/acm/comparable-link", () => ({
  comparableDesdeLink: async () => ({ ok: true, comparable: estado.comparable }),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const filtros: Record<string, any> = {}
      let update: any = null
      const q: any = {
        select: () => q,
        update: (v: any) => ((update = v), q),
        eq: (col: string, val: any) => ((filtros[col] = val), q),
        maybeSingle: async () => {
          estado.filtros.push({ ...filtros })
          const fila = estado.filas.find((f) => Object.entries(filtros).every(([k, v]) => f[k] === v))
          return { data: fila ? { id: fila.id, resultados: fila.resultados } : null, error: null }
        },
        then: (resolve: any) => {
          if (update) estado.updates.push({ filtros: { ...filtros }, update })
          return resolve({ data: null, error: null })
        },
      }
      return q
    },
  }),
}))

import { POST } from "./route"

const pedir = (body: any) =>
  POST(new Request("http://x/api/acm/comparable-link", { method: "POST", body: JSON.stringify(body) }))

const MIA = { id: "s1", agency_id: AGENCIA, user_id: ASESOR, resultados: { cartera: [1], roomix: [2], agregados: [{ id: "link_a" }] } }
const AJENA = { id: "s2", agency_id: AGENCIA, user_id: "otro-asesor", resultados: { cartera: [], roomix: [], agregados: [] } }

beforeEach(() => {
  estado.rol = "asesor"
  estado.filtros = []
  estado.filas = [MIA, AJENA]
  estado.updates = []
  estado.comparable = { id: "roomix_9", match_pct: 80 }
})

describe("POST /api/acm/comparable-link", () => {
  it("guarda lo sumado en la búsqueda propia, sin pisar el resto del snapshot", async () => {
    const res = await pedir({ url: "https://www.zonaprop.com.ar/x-9.html", sujeto: {}, search_id: "s1" })
    expect(res.status).toBe(200)
    expect(estado.filtros[0]).toEqual({ id: "s1", agency_id: AGENCIA, user_id: ASESOR })
    expect(estado.updates).toHaveLength(1)
    expect(estado.updates[0].update.resultados).toEqual({
      cartera: [1], roomix: [2], agregados: [{ id: "link_a" }, { id: "roomix_9", match_pct: 80 }],
    })
  })

  it("si la búsqueda ya lo había traído, no lo guarda y dice dónde está", async () => {
    MIA.resultados.roomix = [{ id: "roomix_9", source: "roomix", match_pct: 92 }] as any
    const res = await pedir({ url: "https://www.zonaprop.com.ar/x-9.html", sujeto: {}, search_id: "s1" })
    expect((await res.json()).ya_en_lista).toEqual({ source: "roomix", match_pct: 92 })
    expect(estado.updates).toHaveLength(0)
    MIA.resultados.roomix = [2] as any
  })

  it("el mismo aviso dos veces queda una sola vez", async () => {
    estado.comparable = { id: "link_a", match_pct: 55 }
    await pedir({ url: "https://www.argenprop.com/x--1", sujeto: {}, search_id: "s1" })
    expect(estado.updates[0].update.resultados.agregados).toEqual([{ id: "link_a", match_pct: 55 }])
  })

  it("un asesor NO puede guardar en la búsqueda de otro asesor", async () => {
    const res = await pedir({ url: "https://www.zonaprop.com.ar/x-9.html", sujeto: {}, search_id: "s2" })
    expect(res.status).toBe(404)
    expect(estado.updates).toHaveLength(0)
  })

  it("un asesor NO puede quitar de la búsqueda de otro asesor", async () => {
    const res = await pedir({ accion: "quitar", id: "link_a", search_id: "s2" })
    expect(res.status).toBe(404)
    expect(estado.updates).toHaveLength(0)
  })

  it("el director sí puede, en su agencia", async () => {
    estado.rol = "director"
    const res = await pedir({ url: "https://www.zonaprop.com.ar/x-9.html", sujeto: {}, search_id: "s2" })
    expect(res.status).toBe(200)
    expect(estado.filtros[0]).toEqual({ id: "s2", agency_id: AGENCIA })
  })

  it("quitar saca solo ese comparable", async () => {
    MIA.resultados.agregados = [{ id: "link_a" }, { id: "roomix_9" }] as any
    await pedir({ accion: "quitar", id: "link_a", search_id: "s1" })
    expect(estado.updates[0].update.resultados.agregados).toEqual([{ id: "roomix_9" }])
    MIA.resultados.agregados = [{ id: "link_a" }]
  })

  it("rechaza algo que no es un link", async () => {
    const res = await pedir({ url: "javascript:alert(1)", sujeto: {} })
    expect(res.status).toBe(400)
  })

  it("sin búsqueda guardada, devuelve el comparable y no guarda nada", async () => {
    const res = await pedir({ url: "https://www.zonaprop.com.ar/x-9.html", sujeto: {} })
    expect((await res.json()).comparable.id).toBe("roomix_9")
    expect(estado.updates).toHaveLength(0)
  })
})
