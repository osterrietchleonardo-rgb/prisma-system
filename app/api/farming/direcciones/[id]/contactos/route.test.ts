// app/api/farming/direcciones/[id]/contactos/route.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest"
import { baseFalsa } from "@/lib/farming/base-falsa"

/**
 * El historial firmado de una tarjeta (`farming_contactos`). Las reglas que sostiene este
 * archivo:
 *  1. `direccionAccesible(..., "leer")` corre ANTES de devolver nada: 403 si la tarjeta es de
 *     la zona de un colega, 404 si no existe o es de otra agencia.
 *  2. Una zona ARCHIVADA sí deja leer su historial (es la otra mitad de "se mira, no se
 *     trabaja": el candado de "leer" no la bloquea).
 *  3. Orden: `fecha desc, created_at desc`.
 *  4. El nombre de quien lo hizo sale de `profiles`, en UNA sola consulta por el conjunto de
 *     `user_id` — nunca una por fila. Si el perfil no aparece, el nombre es «un colega»:
 *     nunca un uuid crudo.
 *  5. `agency_id` en `farming_contactos` es una columna denormalizada: se filtra también por
 *     ella, igual que en `propietarios` y en el GET de `direcciones`.
 */

const AGENCIA = "ag-1"
const OTRA_AGENCIA = "ag-2"
const YO = "u-yo"
const JUAN = "u-juan"
const FANTASMA = "u-fantasma" // dejó la agencia / nunca tuvo perfil cargado

const cuadrado = {
  type: "Polygon",
  coordinates: [[[-58.46, -34.56], [-58.45, -34.56], [-58.45, -34.55], [-58.46, -34.55], [-58.46, -34.56]]],
}

const Z_MIA = "10000000-0000-0000-0000-000000000001"
const Z_JUAN = "10000000-0000-0000-0000-000000000002"
const Z_ARCHIVADA = "10000000-0000-0000-0000-000000000003"

const D_MIA = "20000000-0000-0000-0000-000000000001"
const D_MIA_2 = "20000000-0000-0000-0000-000000000002"
const D_JUAN = "20000000-0000-0000-0000-000000000003"
const D_AJENA = "20000000-0000-0000-0000-000000000004"
const D_VIEJA = "20000000-0000-0000-0000-000000000005"

const sesion = { userId: YO, agencyId: AGENCIA, role: "asesor" }
vi.mock("@/lib/auth/tenant-validation", () => ({ requireTenant: vi.fn(async () => ({ ...sesion })) }))
import { requireTenant } from "@/lib/auth/tenant-validation"

let base = baseFalsa({})
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => base }))

const { GET } = await import("./route")

const zonasFixture = () => [
  { id: Z_MIA, agency_id: AGENCIA, owner_user_id: YO, nombre: "Colegiales", geojson: cuadrado, estado: "activa" },
  { id: Z_JUAN, agency_id: AGENCIA, owner_user_id: JUAN, nombre: "De Juan", geojson: cuadrado, estado: "activa" },
  { id: Z_ARCHIVADA, agency_id: AGENCIA, owner_user_id: YO, nombre: "Vieja", geojson: cuadrado, estado: "archivada" },
]

const direccionFixture = (id: string, zonaId: string, agencyId: string, extra: any = {}) => ({
  id,
  zona_id: zonaId,
  agency_id: agencyId,
  creada_por: YO,
  calle: "Peron",
  altura: "100",
  tipo: "casa",
  etapa: "relevado",
  orden: 0,
  created_at: "2026-09-16T10:00:00.000Z",
  ...extra,
})

const contactoFixture = (id: string, direccionId: string, agencyId: string, extra: any = {}) => ({
  id,
  direccion_id: direccionId,
  agency_id: agencyId,
  user_id: YO,
  propietario_id: null,
  fecha: "2026-09-16",
  tipo: "llamada",
  cartas_entregadas: null,
  etapa_desde: "relevado",
  etapa_hasta: "presentado",
  nota: null,
  created_at: "2026-09-16T10:00:00.000Z",
  ...extra,
})

function nuevaBase(extra: Record<string, any[]> = {}) {
  base = baseFalsa({
    farming_zonas: zonasFixture(),
    farming_zonas_compartidas: [],
    farming_direcciones: [
      direccionFixture(D_MIA, Z_MIA, AGENCIA),
      direccionFixture(D_MIA_2, Z_MIA, AGENCIA),
      direccionFixture(D_JUAN, Z_JUAN, AGENCIA),
      direccionFixture(D_AJENA, Z_MIA, OTRA_AGENCIA),
      direccionFixture(D_VIEJA, Z_ARCHIVADA, AGENCIA),
    ],
    farming_contactos: [],
    profiles: [
      { id: YO, full_name: "Leo Osterrietch", role: "asesor", estado: "activo", agency_id: AGENCIA },
      { id: JUAN, full_name: "Juan Pérez", role: "asesor", estado: "activo", agency_id: AGENCIA },
    ],
    ...extra,
  })
}

beforeEach(() => {
  vi.mocked(requireTenant).mockImplementation(async () => ({ ...sesion }))
  nuevaBase()
})

const leer = (id: string) =>
  GET(new Request(`http://localhost/api/farming/direcciones/${id}/contactos`), { params: { id } })

describe("GET /api/farming/direcciones/[id]/contactos", () => {
  it("devuelve SOLO el historial de esa tarjeta, no el de la de al lado", async () => {
    nuevaBase({
      farming_contactos: [
        contactoFixture("c1", D_MIA, AGENCIA),
        contactoFixture("c2", D_MIA_2, AGENCIA),
      ],
    })
    const r = await leer(D_MIA)
    const d = await r.json()
    expect(r.status).toBe(200)
    expect(d.contactos.map((c: any) => c.id)).toEqual(["c1"])
  })

  it("una tarjeta de la zona de un colega que no comparte: 403 y no devuelve nada", async () => {
    nuevaBase({ farming_contactos: [contactoFixture("c1", D_JUAN, AGENCIA)] })
    const r = await leer(D_JUAN)
    const d = await r.json()
    expect(r.status).toBe(403)
    expect(d.contactos).toBeUndefined()
  })

  it("una tarjeta de otra agencia: 404 y no devuelve nada", async () => {
    const r = await leer(D_AJENA)
    const d = await r.json()
    expect(r.status).toBe(404)
    expect(d.contactos).toBeUndefined()
  })

  it("una tarjeta que no existe: 404", async () => {
    const r = await leer("20000000-0000-0000-0000-000000000099")
    expect(r.status).toBe(404)
  })

  // LA OTRA MITAD DE "SE MIRA, NO SE TRABAJA": una zona archivada deja LEER su historial.
  // Es la misma promesa que sostienen `propietarios` y el GET de `direcciones`.
  it("una tarjeta de una zona archivada: SÍ se puede leer su historial (200)", async () => {
    nuevaBase({ farming_contactos: [contactoFixture("c1", D_VIEJA, AGENCIA)] })
    const r = await leer(D_VIEJA)
    const d = await r.json()
    expect(r.status).toBe(200)
    expect(d.contactos.map((c: any) => c.id)).toEqual(["c1"])
  })

  it("una tarjeta sin historial: 200 con la lista vacía, no un error", async () => {
    const r = await leer(D_MIA)
    const d = await r.json()
    expect(r.status).toBe(200)
    expect(d.contactos).toEqual([])
  })

  // Orden: fecha desc, created_at desc. Las cuatro filas se insertan fuera de orden a
  // propósito. El doble de prueba (lib/farming/base-falsa.ts) solo respeta el ÚLTIMO
  // `.order()` de la cadena (created_at desc), así que las fechas y los created_at de este
  // fixture avanzan JUNTOS: alcanza para probar que el orden se pide de verdad, y de paso
  // prueba el desempate real (c2 y c3 comparten fecha; created_at desc decide entre ellas),
  // que el doble sí puede verificar sin ayuda. Contra Postgres real las dos claves valen.
  it("el historial sale más reciente primero (fecha desc, created_at desc)", async () => {
    nuevaBase({
      farming_contactos: [
        contactoFixture("c1", D_MIA, AGENCIA, { fecha: "2026-09-10", created_at: "2026-09-10T09:00:00.000Z" }),
        contactoFixture("c4", D_MIA, AGENCIA, { fecha: "2026-09-15", created_at: "2026-09-15T09:00:00.000Z" }),
        contactoFixture("c2", D_MIA, AGENCIA, { fecha: "2026-09-12", created_at: "2026-09-12T08:00:00.000Z" }),
        contactoFixture("c3", D_MIA, AGENCIA, { fecha: "2026-09-12", created_at: "2026-09-12T09:30:00.000Z" }),
      ],
    })
    const r = await leer(D_MIA)
    const d = await r.json()
    expect(r.status).toBe(200)
    expect(d.contactos.map((c: any) => c.id)).toEqual(["c4", "c3", "c2", "c1"])
  })

  it("el nombre de quien lo hizo viaja, sacado de profiles", async () => {
    nuevaBase({
      farming_contactos: [contactoFixture("c1", D_MIA, AGENCIA, { user_id: JUAN })],
    })
    const r = await leer(D_MIA)
    const d = await r.json()
    expect(r.status).toBe(200)
    expect(d.contactos[0].quien).toBe("Juan Pérez")
  })

  // NUNCA UN UUID CRUDO EN PANTALLA. Si el perfil no aparece (se fue de la agencia, o el
  // seed de prueba nunca lo cargó), el nombre tiene que ser una frase, no el uuid en bruto.
  it("un perfil que no aparece: el nombre es «un colega», nunca el uuid", async () => {
    nuevaBase({
      farming_contactos: [contactoFixture("c1", D_MIA, AGENCIA, { user_id: FANTASMA })],
    })
    const r = await leer(D_MIA)
    const d = await r.json()
    expect(r.status).toBe(200)
    expect(d.contactos[0].quien).toBe("un colega")
    expect(d.contactos[0].quien).not.toContain(FANTASMA)
  })

  // UNA SOLA CONSULTA A `profiles`, sea cual sea la cantidad de filas del historial. Si un
  // refactor volviera a una consulta por fila (buscar el nombre adentro del `.map`), este
  // test lo agarra: con 3 filas de 2 autores distintos, `profiles` tiene que pedirse UNA vez.
  it("el nombre sale de UNA sola consulta a profiles, no una por fila", async () => {
    nuevaBase({
      farming_contactos: [
        contactoFixture("c1", D_MIA, AGENCIA, { user_id: YO }),
        contactoFixture("c2", D_MIA, AGENCIA, { user_id: JUAN }),
        contactoFixture("c3", D_MIA, AGENCIA, { user_id: YO }),
      ],
    })
    let llamadasAPerfiles = 0
    const fromOriginal = base.from
    base.from = ((tabla: string) => {
      if (tabla === "profiles") llamadasAPerfiles++
      return fromOriginal(tabla)
    }) as typeof base.from

    const r = await leer(D_MIA)
    const d = await r.json()
    expect(r.status).toBe(200)
    expect(llamadasAPerfiles).toBe(1)
    expect(d.contactos.map((c: any) => c.quien)).toEqual(["Leo Osterrietch", "Juan Pérez", "Leo Osterrietch"])
  })

  // `agency_id` en `farming_contactos` es una columna DENORMALIZADA, sin FK que la ate a la
  // dirección (ver el comentario de la migración): una fila mal escrita tiene que fallar
  // cerrada (no se devuelve), no filtrarse a otra inmobiliaria.
  it("una fila con el agency_id mal escrito no se devuelve, aunque cuelgue de mi tarjeta", async () => {
    nuevaBase({
      farming_contactos: [
        contactoFixture("c1", D_MIA, AGENCIA),
        contactoFixture("c-ajeno", D_MIA, OTRA_AGENCIA, { nota: "de otra agencia" }),
      ],
    })
    const r = await leer(D_MIA)
    const d = await r.json()
    expect(r.status).toBe(200)
    expect(d.contactos.map((c: any) => c.id)).toEqual(["c1"])
  })
})
