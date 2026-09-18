import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * EL INTERRUPTOR del asistente de la web. Los testigos miran qué quedó escrito y qué NO: un
 * asesor no prende nada, no se prende un asistente que no leyó el sitio, y la agencia sale
 * SIEMPRE de la sesión.
 */

const AGENCIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const sesion = { agencyId: AGENCIA, userId: "u1", role: "director" as string | null }
const base = {
  widget: null as Record<string, unknown> | null,
  escrito: [] as Record<string, unknown>[],
}

vi.mock("@/lib/auth/tenant-validation", () => ({ requireTenant: async () => sesion }))

const admin = () => ({
  from: (tabla: string) => ({
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: base.widget, error: null }) }),
    }),
    update: (fila: Record<string, unknown>) => ({
      eq: (columna: string, valor: unknown) => {
        base.escrito.push({ tabla, columna, valor, ...fila })
        return {
          select: () => ({
            single: async () => ({ data: { ...base.widget, ...fila }, error: null }),
          }),
        }
      },
    }),
  }),
})
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin() }))

const { POST } = await import("./route")

const pedir = (cuerpo: unknown) =>
  POST(
    new Request("http://x/api/chat-web/widget/encender", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    })
  )

beforeEach(() => {
  sesion.role = "director"
  sesion.agencyId = AGENCIA
  base.widget = { id: "w-1", agency_id: AGENCIA, activo: false, rastreo_paginas: 5 }
  base.escrito = []
})

describe("quién puede prenderlo", () => {
  it("un asesor recibe 403 y NO se escribe nada", async () => {
    sesion.role = "asesor"
    const r = await pedir({ activo: true })
    expect(r.status).toBe(403)
    expect(base.escrito).toHaveLength(0)
  })
})

describe("prender", () => {
  it("prende y lo escribe en SU agencia", async () => {
    const r = await pedir({ activo: true })
    expect(r.status).toBe(200)
    expect(base.escrito[0]).toMatchObject({
      tabla: "web_widgets",
      columna: "agency_id",
      valor: AGENCIA,
      activo: true,
    })
  })

  it("sin configuración todavía, no prende nada y lo dice", async () => {
    base.widget = null
    const r = await pedir({ activo: true })
    expect(r.status).toBe(400)
    expect((await r.json()).error).toMatch(/configuración/i)
    expect(base.escrito).toHaveLength(0)
  })

  it("si el sitio nunca se leyó, NO se prende: contestaría sin saber nada", async () => {
    base.widget = { id: "w-1", agency_id: AGENCIA, activo: false, rastreo_paginas: 0 }
    const r = await pedir({ activo: true })
    expect(r.status).toBe(400)
    expect((await r.json()).error).toMatch(/sitio/i)
    expect(base.escrito).toHaveLength(0)
  })
})

describe("apagar", () => {
  it("apagar siempre se puede, incluso sin páginas leídas", async () => {
    base.widget = { id: "w-1", agency_id: AGENCIA, activo: true, rastreo_paginas: 0 }
    const r = await pedir({ activo: false })
    expect(r.status).toBe(200)
    expect(base.escrito[0]).toMatchObject({ activo: false })
  })

  it("un cuerpo que no es JSON apaga, no prende: nunca prende por accidente", async () => {
    const r = await POST(
      new Request("http://x/api/chat-web/widget/encender", { method: "POST", body: "{{{" })
    )
    expect(r.status).toBe(200)
    expect(base.escrito[0]).toMatchObject({ activo: false })
  })
})
