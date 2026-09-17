import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * LA BANDEJA DEL CHAT WEB. Lo que se vigila acá es la PRIVACIDAD: adentro hay teléfonos y emails
 * de gente que entró a la web y todavía no es cliente de nadie. La ven el director y el asesor
 * que el director eligió; ese asesor ve solo los "quiero sumarme al equipo".
 */

const AGENCIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const sesion = { agencyId: AGENCIA, userId: "d-1", role: "director" as string | null }
const base = { widget: { id: "w-1", perfil_equipo_id: "a-1" } as Record<string, unknown> | null, filtros: [] as Array<[string, unknown]> }

vi.mock("@/lib/auth/tenant-validation", () => ({ requireTenant: async () => sesion }))

const conversaciones = [
  { id: "c-1", objetivo: "busca_propiedad", datos: { telefono: "5491100000001" }, estado: "derivada" },
  { id: "c-2", objetivo: "sumarse_equipo", datos: { telefono: "5491100000002" }, estado: "derivada" },
]

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(tabla: string) {
      const chain: Record<string, unknown> = {}
      for (const m of ["select", "order", "limit"]) chain[m] = () => chain
      chain.eq = (col: string, val: unknown) => {
        base.filtros.push([col, val])
        return chain
      }
      chain.maybeSingle = async () => ({
        data: tabla === "web_widgets" ? base.widget : conversaciones[0],
        error: null,
      })
      chain.then = (res: (v: unknown) => unknown) => {
        const filtroObjetivo = base.filtros.find(([c]) => c === "objetivo")?.[1]
        const filas = filtroObjetivo
          ? conversaciones.filter((c) => c.objetivo === filtroObjetivo)
          : conversaciones
        return Promise.resolve({ data: tabla === "web_mensajes" ? [] : filas, error: null }).then(res)
      }
      return chain
    },
  }),
}))

const { GET } = await import("./route")
const pedir = (url = "http://x/api/chat-web/bandeja") => GET(new Request(url))

beforeEach(() => {
  sesion.role = "director"
  sesion.userId = "d-1"
  base.widget = { id: "w-1", perfil_equipo_id: "a-1" }
  base.filtros = []
})

describe("quién entra", () => {
  it("el director ve todas las conversaciones de su agencia", async () => {
    const r = await pedir()
    expect(r.status).toBe(200)
    const cuerpo = await r.json()
    expect(cuerpo.conversaciones.map((c: { id: string }) => c.id)).toEqual(["c-1", "c-2"])
    expect(cuerpo.soloMias).toBe(false)
  })

  it("el asesor elegido entra, pero SOLO ve los «quiero sumarme al equipo»", async () => {
    sesion.role = "asesor"
    sesion.userId = "a-1"
    const r = await pedir()
    expect(r.status).toBe(200)
    const cuerpo = await r.json()
    expect(cuerpo.conversaciones.map((c: { id: string }) => c.id)).toEqual(["c-2"])
    expect(cuerpo.soloMias).toBe(true)
    expect(base.filtros).toContainEqual(["objetivo", "sumarse_equipo"])
  })

  it("otro asesor NO entra: 403 y ni una fila", async () => {
    sesion.role = "asesor"
    sesion.userId = "a-9"
    const r = await pedir()
    expect(r.status).toBe(403)
    expect(await r.json()).toMatchObject({ error: expect.stringContaining("acceso") })
  })

  it("si el director no eligió a nadie, ningún asesor entra", async () => {
    base.widget = { id: "w-1", perfil_equipo_id: null }
    sesion.role = "asesor"
    sesion.userId = "a-1"
    expect((await pedir()).status).toBe(403)
  })

  it("devuelve el resumen calculado sobre LAS MISMAS filas que muestra", async () => {
    const cuerpo = await (await pedir()).json()
    expect(cuerpo.resumen.total).toBe(cuerpo.conversaciones.length)
    expect(cuerpo.resumen.porObjetivo.busca_propiedad).toBe(1)
    expect(cuerpo.resumen.derivadas).toBe(2)
  })

  it("el asesor ve el resumen de LO SUYO, no el de toda la agencia", async () => {
    sesion.role = "asesor"
    sesion.userId = "a-1"
    const cuerpo = await (await pedir()).json()
    expect(cuerpo.resumen.total).toBe(1)
    expect(cuerpo.resumen.porObjetivo.sumarse_equipo).toBe(1)
  })

  it("siempre se filtra por la agencia de la sesión", async () => {
    await pedir()
    expect(base.filtros).toContainEqual(["agency_id", AGENCIA])
  })
})
