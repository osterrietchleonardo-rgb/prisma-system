import { describe, it, expect, vi, beforeEach } from "vitest"
import { AsyncLocalStorage } from "node:async_hooks"

/**
 * CREAR LA FICHA DE UNA SELECCIÓN.
 *
 * Los dos testigos que importan son de CONDUCTA sobre lo que se GUARDA:
 *  - una propiedad dada de baja (404) se omite y la ficha sale con el resto;
 *  - una consulta que falla (503) corta todo y NO deja nada guardado a medias.
 * Por eso los tests miran `insertadas`, no el texto del error.
 */

const AGENCIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const DIRECTOR = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
const PROPIA_1 = "11111111-1111-4111-8111-111111111111"
const PROPIA_2 = "22222222-2222-4222-8222-222222222222"
const NO_EXISTE = "99999999-9999-4999-8999-999999999999"

vi.mock("@/lib/auth/tenant-validation", () => ({
  requireTenant: async () => ({ agencyId: AGENCIA, userId: DIRECTOR, role: "director" }),
}))

type Base = {
  propiedades: Array<Record<string, unknown>>
  insertadas: Array<Record<string, unknown>>
  /** Ids cuya consulta devuelve error. Vacío = ninguna falla. */
  romper: string[]
}
let base: Base
const baseDelPedido = new AsyncLocalStorage<Base>()

const clienteFalso = (b: Base) => ({
  from(tabla: string) {
    const filtros: Record<string, unknown> = {}
    const api: any = {
      select: () => api,
      eq: (col: string, val: unknown) => {
        filtros[col] = val
        return api
      },
      single: async () => {
        if (tabla === "profiles") {
          return {
            data: { full_name: "Leo", email: "l@v.com", phone: "5491100", avatar_url: null, role: "director" },
            error: null,
          }
        }
        if (tabla === "agencies") {
          return {
            data: {
              id: AGENCIA,
              name: "VAKDOR",
              marketing_ai_config: { brand_colors: ["#0a1f33"], logo_url: "https://x/l.png" },
            },
            error: null,
          }
        }
        return { data: null, error: null }
      },
      maybeSingle: async () => {
        if (b.romper.includes(String(filtros.id ?? filtros.slug ?? ""))) {
          return { data: null, error: { message: "roto a propósito" } }
        }
        const f = b.propiedades.find((p) => Object.entries(filtros).every(([k, v]) => p[k] === v))
        return { data: f ?? null, error: null }
      },
    }
    return api
  },
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => clienteFalso(baseDelPedido.getStore() ?? base),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: async (fila: Record<string, unknown>) => {
        ;(baseDelPedido.getStore() ?? base).insertadas.push(fila)
        return { error: null }
      },
    }),
  }),
}))

const fila = (id: string, titulo: string) => ({
  id,
  agency_id: AGENCIA,
  title: titulo,
  description: "",
  price: 100000,
  currency: "USD",
  property_type: "Departamento",
  status: "Venta",
  bedrooms: 2,
  bathrooms: 1,
  total_area: 60,
  covered_area: 55,
  address: "Calle 1",
  city: "CABA",
  images: [],
  tokko_data: {},
})

beforeEach(() => {
  base = { propiedades: [fila(PROPIA_1, "Uno"), fila(PROPIA_2, "Dos")], insertadas: [], romper: [] }
})

const pedir = async (cuerpo: unknown) => {
  const miBase = base
  const { POST } = await import("./route")
  const res = await baseDelPedido.run(miBase, () =>
    POST(
      new Request("http://localhost/api/seleccion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      }),
    ),
  )
  return { status: res.status, cuerpo: (await res.json()) as Record<string, any> }
}

describe("POST /api/seleccion", () => {
  it("guarda las dos propiedades con sus notas y devuelve el link", async () => {
    const r = await pedir({
      propiedades: [
        { source: "own", id: PROPIA_1, nota: "la más luminosa" },
        { source: "own", id: PROPIA_2 },
      ],
      nota_final: "Cualquiera de las dos entra en tu presupuesto",
    })

    expect(r.status).toBe(200)
    expect(r.cuerpo.path).toBe(`/seleccion/${r.cuerpo.token}`)
    expect(r.cuerpo.omitidas).toEqual([])

    expect(base.insertadas).toHaveLength(1)
    const snap = base.insertadas[0].snapshot as any
    expect(snap.properties).toHaveLength(2)
    expect(snap.properties[0].nota).toBe("la más luminosa")
    expect(snap.properties[1].nota).toBe("")
    expect(snap.nota_final).toBe("Cualquiera de las dos entra en tu presupuesto")
    expect(snap.agency.name).toBe("VAKDOR")
    expect(snap.brand.colors).toEqual(["#0a1f33"])
  })

  it("una que ya no está se omite y la ficha se genera con el resto", async () => {
    const r = await pedir({
      propiedades: [
        { source: "own", id: PROPIA_1 },
        { source: "own", id: NO_EXISTE },
      ],
    })

    expect(r.status).toBe(200)
    expect(r.cuerpo.omitidas).toHaveLength(1)
    expect((base.insertadas[0].snapshot as any).properties).toHaveLength(1)
  })

  it("si NINGUNA se pudo traer, no guarda nada", async () => {
    const r = await pedir({ propiedades: [{ source: "own", id: NO_EXISTE }] })

    expect(r.status).toBe(404)
    expect(base.insertadas).toHaveLength(0)
  })

  /**
   * La SEGUNDA falla, la primera anduvo bien. Es el caso que separa las dos conductas
   * posibles: si el código tratara el 503 como una omisión más, acá guardaría una ficha
   * con UNA sola propiedad y devolvería 200. Rompiendo las dos, ese bug pasaría
   * desapercibido (con cero propiedades igual no se guarda nada).
   */
  it("si una consulta falla corta todo con 503 y no guarda la ficha coja", async () => {
    base.romper = [PROPIA_2]
    const r = await pedir({
      propiedades: [
        { source: "own", id: PROPIA_1 },
        { source: "own", id: PROPIA_2 },
      ],
    })

    expect(r.status).toBe(503)
    expect(base.insertadas).toHaveLength(0)
  })

  it("no acepta más de 12", async () => {
    const trece = Array.from({ length: 13 }, () => ({ source: "own", id: PROPIA_1 }))
    const r = await pedir({ propiedades: trece })

    expect(r.status).toBe(400)
    expect(base.insertadas).toHaveLength(0)
  })

  /**
   * LA REGLA QUE SOSTIENE LA REVISIÓN DEL ASESOR.
   *
   * El 55% de los avisos de la red trae la matrícula del colega adentro de la descripción, y
   * eso no se puede limpiar solo de forma confiable. El asesor lo corrige en el repaso, y lo
   * que se publica tiene que ser SU texto — no el de la base. Si esto se rompe, la corrección
   * se pierde en silencio y el cliente termina leyendo los datos del colega igual.
   */
  it("publica el texto que el asesor revisó, no el de la base", async () => {
    await pedir({
      propiedades: [
        {
          source: "own",
          id: PROPIA_1,
          titulo: "Dos ambientes con balcón en Caballito",
          descripcion: "Luminoso y al frente. Cerca del subte.",
        },
      ],
    })

    const p = (base.insertadas[0].snapshot as any).properties[0]
    expect(p.title).toBe("Dos ambientes con balcón en Caballito")
    expect(p.description).toBe("Luminoso y al frente. Cerca del subte.")
  })

  it("si no mandó texto revisado, vale el de la base", async () => {
    await pedir({ propiedades: [{ source: "own", id: PROPIA_1 }] })

    const p = (base.insertadas[0].snapshot as any).properties[0]
    expect(p.title).toBe("Uno")
  })

  it("un texto revisado en blanco no borra el de la base", async () => {
    await pedir({ propiedades: [{ source: "own", id: PROPIA_1, titulo: "   " }] })

    const p = (base.insertadas[0].snapshot as any).properties[0]
    expect(p.title).toBe("Uno")
  })

  it("no acepta una selección vacía", async () => {
    const r = await pedir({ propiedades: [] })

    expect(r.status).toBe(400)
    expect(base.insertadas).toHaveLength(0)
  })
})
