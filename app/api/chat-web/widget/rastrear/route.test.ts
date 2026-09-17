import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * "ACTUALIZAR EL SITIO". Es la operación cara del módulo y la única donde el servidor abre una
 * dirección de afuera. Lo que importa acá: no la dispara un asesor, no se lee dos veces seguidas,
 * y el sitio que se lee es SIEMPRE el guardado — nunca uno que venga en el pedido.
 */

const AGENCIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const sesion = { agencyId: AGENCIA, userId: "u1", role: "director" as string | null }
const base = {
  widget: null as Record<string, unknown> | null,
  rastreados: [] as string[],
  guardados: 0,
}

vi.mock("@/lib/auth/tenant-validation", () => ({ requireTenant: async () => sesion }))
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: base.widget, error: null }) }) }) }),
  }),
}))
vi.mock("@/lib/gemini", () => ({ generateEmbedding: async () => Array.from({ length: 768 }, () => 0.1) }))
vi.mock("@/lib/chat-web/almacen-supabase", () => ({ almacenSupabase: () => ({}) }))
vi.mock("@/lib/chat-web/rastreo", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  rastrearSitio: async ({ sitio }: { sitio: string }) => {
    base.rastreados.push(sitio)
    return {
      paginas: [{ url: `${sitio}tasaciones`, titulo: "Tasaciones", texto: "Valuamos", orden: 0 }],
      urlsLeidas: 1, desdeSitemap: true, truncado: false, motivo: null,
    }
  },
}))
vi.mock("@/lib/chat-web/guardar", () => ({
  guardarRastreo: async () => {
    base.guardados++
    return { guardadas: 1, sinVector: 0, borradas: 0, estado: "ok", motivo: null }
  },
}))

const { POST } = await import("./route")

beforeEach(() => {
  sesion.role = "director"
  base.widget = { id: "w-1", sitio: "https://central.com/", rastreo_en: null }
  base.rastreados = []
  base.guardados = 0
})

it("un asesor no puede disparar el rastreo", async () => {
  sesion.role = "asesor"
  const r = await POST()
  expect(r.status).toBe(403)
  expect(base.rastreados).toHaveLength(0)
})

it("sin sitio guardado, avisa qué falta en vez de romper", async () => {
  base.widget = { id: "w-1", sitio: null, rastreo_en: null }
  const r = await POST()
  expect(r.status).toBe(404)
  expect((await r.json()).error).toMatch(/dirección del sitio/i)
  expect(base.rastreados).toHaveLength(0)
})

it("lee el sitio GUARDADO y deja el resumen", async () => {
  const r = await POST()
  expect(r.status).toBe(200)
  expect(base.rastreados).toEqual(["https://central.com/"])
  expect(base.guardados).toBe(1)
  expect(await r.json()).toMatchObject({ estado: "ok", guardadas: 1, paginasLeidas: 1 })
})

it("recién leído, no se vuelve a leer: cada rastreo cuesta", async () => {
  base.widget = { id: "w-1", sitio: "https://central.com/", rastreo_en: new Date().toISOString() }
  const r = await POST()
  expect(r.status).toBe(429)
  expect((await r.json()).error).toMatch(/minutos/)
  expect(base.rastreados).toHaveLength(0)
})

describe("el sitio no se elige desde afuera", () => {
  it("el endpoint no recibe ningún cuerpo: siempre lee el de la agencia de la sesión", async () => {
    // POST() no toma parámetros a propósito. Si alguien agregara un `sitio` en el cuerpo, este
    // test dejaría de compilar y habría que justificar por qué.
    expect(POST.length).toBe(0)
    await POST()
    expect(base.rastreados).toEqual(["https://central.com/"])
  })
})
