import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * LA TARJETA DEL WIDGET. Los testigos son de CONDUCTA: miran qué fila quedó escrita y qué NO
 * se escribió. Lo que importa acá: un asesor no configura nada, la agencia sale SIEMPRE de la
 * sesión (nunca del cuerpo del pedido), y el widget nace apagado.
 */

const AGENCIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const sesion = { agencyId: AGENCIA, userId: "u1", role: "director" as string | null }
const base = {
  widget: null as Record<string, unknown> | null,
  paginas: [] as Record<string, unknown>[],
  guardado: [] as Record<string, unknown>[],
}

vi.mock("@/lib/auth/tenant-validation", () => ({ requireTenant: async () => sesion }))

const admin = () => ({
  from: (tabla: string) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: base.widget, error: null }),
        order: async () => ({ data: base.paginas, error: null }),
      }),
    }),
    upsert: (fila: Record<string, unknown>) => {
      base.guardado.push({ tabla, ...fila })
      return { select: () => ({ single: async () => ({ data: { id: "w-1", ...fila }, error: null }) }) }
    },
  }),
})
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin() }))

const { GET, POST } = await import("./route")

const guardar = (cuerpo: unknown) =>
  POST(new Request("http://x/api/chat-web/widget", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo),
  }))

const valido = {
  sitio: "centralrealestate.com.ar",
  whatsapp_destino: "+54 9 11 5060-4928",
  secciones: [{ nombre: "Tasaciones", url: "https://centralrealestate.com.ar/tasaciones", resumen: "" }],
}

beforeEach(() => {
  sesion.role = "director"
  sesion.agencyId = AGENCIA
  base.widget = null
  base.paginas = []
  base.guardado = []
})

describe("solo el director configura", () => {
  it("un asesor recibe 403 y NO se escribe nada", async () => {
    sesion.role = "asesor"
    const r = await guardar(valido)
    expect(r.status).toBe(403)
    expect(base.guardado).toHaveLength(0)
  })
})

describe("guardar la configuración", () => {
  it("guarda el sitio normalizado, el WhatsApp solo con números, y nace APAGADO", async () => {
    const r = await guardar(valido)
    expect(r.status).toBe(200)
    expect(base.guardado[0]).toMatchObject({
      tabla: "web_widgets",
      agency_id: AGENCIA,
      sitio: "https://centralrealestate.com.ar/",
      whatsapp_destino: "5491150604928",
      activo: false,
    })
  })

  it("la agencia sale de la SESIÓN: mandarla en el cuerpo no sirve de nada", async () => {
    await guardar({ ...valido, agency_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" })
    expect(base.guardado[0].agency_id).toBe(AGENCIA)
  })

  it("con datos mal cargados devuelve 400 con los motivos y no escribe", async () => {
    const r = await guardar({ sitio: "nada", whatsapp_destino: "x" })
    expect(r.status).toBe(400)
    const cuerpo = await r.json()
    expect(Object.keys(cuerpo.errores).sort()).toEqual(["sitio", "whatsapp_destino"])
    expect(base.guardado).toHaveLength(0)
  })

  it("un cuerpo que no es JSON no rompe el endpoint", async () => {
    const r = await POST(new Request("http://x/api/chat-web/widget", { method: "POST", body: "{{{" }))
    expect(r.status).toBe(400)
  })
})

describe("leer la configuración", () => {
  it("sin widget todavía, devuelve vacío en vez de romper", async () => {
    const cuerpo = await (await GET()).json()
    expect(cuerpo).toEqual({ widget: null, paginas: [] })
  })

  it("con widget, devuelve la lista de páginas leídas para que el director las revise", async () => {
    base.widget = { id: "w-1", agency_id: AGENCIA, sitio: "https://c.com/" }
    base.paginas = [{ url: "https://c.com/tasaciones", titulo: "Tasaciones", orden: 0, excluida: false }]
    const cuerpo = await (await GET()).json()
    expect(cuerpo.widget.id).toBe("w-1")
    expect(cuerpo.paginas).toHaveLength(1)
  })
})
