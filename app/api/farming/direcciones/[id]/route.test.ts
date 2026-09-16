// app/api/farming/direcciones/[id]/route.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest"
import { baseFalsa } from "@/lib/farming/base-falsa"

/**
 * Editar y borrar UNA tarjeta de la caminata. Las reglas que sostiene este archivo:
 *  1. `direccionAccesible` corre ANTES de cada escritura y de cada borrado, sin excepción:
 *     403 si la tarjeta es de la zona de un colega, 404 si no existe o es de otra agencia.
 *  2. Lista blanca EXPLÍCITA de columnas que el PATCH puede tocar: nunca por descarte.
 *     `zona_id`, `agency_id`, `creada_por`, `created_at`, `id`, `unidades_totales` (generada,
 *     manda un 428C9 si aparece en el UPDATE), `aviso_id`, `aviso_es_dueno_directo`, `origen`,
 *     `fuera_de_zona` y `fuera_de_zona_desde` NUNCA se tocan desde acá.
 *  3. `updated_at` lo pisa el servidor siempre.
 *  4. Una `etapa` fuera de las siete del check: 400, no un 500 de Postgres.
 *  5. `DELETE` borra de verdad.
 */

const AGENCIA = "ag-1"
const OTRA_AGENCIA = "ag-2"
const YO = "u-yo"
const JUAN = "u-juan"

const cuadrado = {
  type: "Polygon",
  coordinates: [[[-58.46, -34.56], [-58.45, -34.56], [-58.45, -34.55], [-58.46, -34.55], [-58.46, -34.56]]],
}

const Z_MIA = "10000000-0000-0000-0000-000000000001"
const Z_JUAN = "10000000-0000-0000-0000-000000000002"
const Z_AJENA = "10000000-0000-0000-0000-000000000004"

const D_MIA = "20000000-0000-0000-0000-000000000001"
const D_JUAN = "20000000-0000-0000-0000-000000000002"
const D_AJENA = "20000000-0000-0000-0000-000000000003"

const sesion = { userId: YO, agencyId: AGENCIA, role: "asesor" }
vi.mock("@/lib/auth/tenant-validation", () => ({ requireTenant: vi.fn(async () => ({ ...sesion })) }))
import { requireTenant } from "@/lib/auth/tenant-validation"

let base = baseFalsa({})
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => base }))

const { PATCH, DELETE } = await import("./route")

const zonasFixture = () => [
  { id: Z_MIA, agency_id: AGENCIA, owner_user_id: YO, nombre: "Colegiales", geojson: cuadrado, estado: "activa" },
  { id: Z_JUAN, agency_id: AGENCIA, owner_user_id: JUAN, nombre: "De Juan", geojson: cuadrado, estado: "activa" },
  { id: Z_AJENA, agency_id: OTRA_AGENCIA, owner_user_id: "u-x", nombre: "Otra agencia", geojson: cuadrado, estado: "activa" },
]

const direccionFixture = (id: string, zonaId: string, agencyId: string, extra: any = {}) => ({
  id,
  zona_id: zonaId,
  agency_id: agencyId,
  creada_por: YO,
  tramo: null,
  calle: "Peron",
  altura: "100",
  tipo: "casa",
  pisos: null,
  unidades_por_piso: null,
  unidades_manual: null,
  unidades_totales: null,
  encargado_nombre: null,
  encargado_turno: null,
  encargado_notas: null,
  lat: null,
  lng: null,
  etapa: "relevado",
  orden: 0,
  a_la_venta: false,
  cartel: null,
  inmobiliaria_cartel: null,
  precio_pedido: null,
  moneda: null,
  aviso_id: null,
  aviso_es_dueno_directo: null,
  origen: "caminata",
  fuera_de_zona: false,
  fuera_de_zona_desde: null,
  observaciones: null,
  relevada_en: null,
  created_at: "2026-09-16T10:00:00.000Z",
  updated_at: "2026-09-16T10:00:00.000Z",
  ...extra,
})

function nuevaBase(extra: Record<string, any[]> = {}) {
  base = baseFalsa({
    farming_zonas: zonasFixture(),
    farming_zonas_compartidas: [],
    farming_direcciones: [
      direccionFixture(D_MIA, Z_MIA, AGENCIA),
      direccionFixture(D_JUAN, Z_JUAN, AGENCIA),
      direccionFixture(D_AJENA, Z_MIA, OTRA_AGENCIA),
    ],
    ...extra,
  })
}

beforeEach(() => {
  vi.mocked(requireTenant).mockImplementation(async () => ({ ...sesion }))
  nuevaBase()
})

const patch = (id: string, body: any) =>
  PATCH(
    new Request(`http://localhost/api/farming/direcciones/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: { id } },
  )

const borrar = (id: string) =>
  DELETE(new Request(`http://localhost/api/farming/direcciones/${id}`, { method: "DELETE" }), { params: { id } })

describe("PATCH /api/farming/direcciones/[id]", () => {
  it("cambia un campo editable y pisa updated_at", async () => {
    const antes = base.tablas.farming_direcciones.find((d: any) => d.id === D_MIA)!.updated_at
    const r = await patch(D_MIA, { encargado_nombre: "Doña Rosa" })
    const d = await r.json()
    expect(r.status).toBe(200)
    expect(d.direccion.encargado_nombre).toBe("Doña Rosa")
    const fila = base.tablas.farming_direcciones.find((x: any) => x.id === D_MIA)!
    expect(fila.encargado_nombre).toBe("Doña Rosa")
    expect(fila.updated_at).not.toBe(antes)
  })

  it("una tarjeta de la zona de un colega que no comparte: 403 y no escribe", async () => {
    const r = await patch(D_JUAN, { encargado_nombre: "Doña Rosa" })
    expect(r.status).toBe(403)
    const fila = base.tablas.farming_direcciones.find((x: any) => x.id === D_JUAN)!
    expect(fila.encargado_nombre).toBeNull()
  })

  it("una tarjeta de otra agencia: 404", async () => {
    const r = await patch(D_AJENA, { encargado_nombre: "Doña Rosa" })
    expect(r.status).toBe(404)
  })

  it("una tarjeta que no existe: 404", async () => {
    const r = await patch("20000000-0000-0000-0000-000000000099", { encargado_nombre: "x" })
    expect(r.status).toBe(404)
  })

  it("una etapa que no está entre las siete del check: 400, y no escribe", async () => {
    const r = await patch(D_MIA, { etapa: "ganada" })
    const d = await r.json()
    expect(r.status).toBe(400)
    const fila = base.tablas.farming_direcciones.find((x: any) => x.id === D_MIA)!
    expect(fila.etapa).toBe("relevado")
    expect(typeof d.error).toBe("string")
  })

  it("una etapa válida sí se guarda", async () => {
    const r = await patch(D_MIA, { etapa: "presentado" })
    const d = await r.json()
    expect(r.status).toBe(200)
    expect(d.direccion.etapa).toBe("presentado")
  })

  // Este test muere si se saca la lista blanca (por ejemplo, si el PATCH pasara a mandar
  // `...body` directo al update): zona_id y agency_id ajenos quedarían pegados en la fila.
  it("un PATCH que manda zona_id y agency_id ajenos: se ignoran, la fila queda con los originales", async () => {
    const r = await patch(D_MIA, {
      zona_id: Z_JUAN,
      agency_id: OTRA_AGENCIA,
      id: "otro-id",
      creada_por: "u-ajeno",
      unidades_totales: 999,
      aviso_id: 555,
      aviso_es_dueno_directo: true,
      origen: "aviso",
      fuera_de_zona: true,
      fuera_de_zona_desde: "2020-01-01T00:00:00.000Z",
      created_at: "2020-01-01T00:00:00.000Z",
      calle: "Sí cambia",
    })
    const d = await r.json()
    expect(r.status).toBe(200)
    const fila = base.tablas.farming_direcciones.find((x: any) => x.id === D_MIA)!
    expect(fila.zona_id).toBe(Z_MIA)
    expect(fila.agency_id).toBe(AGENCIA)
    expect(fila.id).toBe(D_MIA)
    expect(fila.creada_por).toBe(YO)
    expect(fila.unidades_totales).toBeNull()
    expect(fila.aviso_id).toBeNull()
    expect(fila.aviso_es_dueno_directo).toBeNull()
    expect(fila.origen).toBe("caminata")
    expect(fila.fuera_de_zona).toBe(false)
    expect(fila.fuera_de_zona_desde).toBeNull()
    expect(fila.created_at).toBe("2026-09-16T10:00:00.000Z")
    // Lo único de la lista blanca que sí venía en el body: eso sí cambia.
    expect(fila.calle).toBe("Sí cambia")
    expect(d.direccion.calle).toBe("Sí cambia")
  })

  // valoresImposibles corre ANTES de tocar la base: sin esto, `moneda: "EUR"` o `pisos: 9999`
  // llegan crudos a Postgres y ese 23514 sale como un 500 genérico en vez de un 400 legible.
  it("una moneda que no existe: 400, y no escribe", async () => {
    const r = await patch(D_MIA, { moneda: "EUR" })
    const d = await r.json()
    expect(r.status).toBe(400)
    expect(typeof d.error).toBe("string")
    const fila = base.tablas.farming_direcciones.find((x: any) => x.id === D_MIA)!
    expect(fila.moneda).toBeNull()
  })

  it("unos pisos afuera de 1-200: 400, y no escribe", async () => {
    const r = await patch(D_MIA, { pisos: 9999 })
    const d = await r.json()
    expect(r.status).toBe(400)
    expect(typeof d.error).toBe("string")
    const fila = base.tablas.farming_direcciones.find((x: any) => x.id === D_MIA)!
    expect(fila.pisos).toBeNull()
  })

  // Esta es la prueba que atraparía a alguien "arreglando" el chequeo con `validarDireccion`
  // en vez de `valoresImposibles`: un PATCH legítimo, parcial, sin calle ni tipo, tiene que
  // seguir guardando. `validarDireccion` los exige (son obligatorios en el ALTA) y rechazaría
  // esto con 400 aunque no haya nada imposible en el body.
  it("un PATCH parcial sin calle ni tipo se guarda igual (valoresImposibles, no validarDireccion)", async () => {
    const r = await patch(D_MIA, { orden: 5 })
    const d = await r.json()
    expect(r.status).toBe(200)
    expect(d.direccion.orden).toBe(5)
  })
})

describe("DELETE /api/farming/direcciones/[id]", () => {
  it("borra de verdad", async () => {
    const r = await borrar(D_MIA)
    const d = await r.json()
    expect(r.status).toBe(200)
    expect(d.ok).toBe(true)
    expect(base.tablas.farming_direcciones.find((x: any) => x.id === D_MIA)).toBeUndefined()
  })

  it("una tarjeta de la zona de un colega que no comparte: 403 y no borra", async () => {
    const r = await borrar(D_JUAN)
    expect(r.status).toBe(403)
    expect(base.tablas.farming_direcciones.find((x: any) => x.id === D_JUAN)).toBeDefined()
  })

  it("una tarjeta de otra agencia: 404 y no borra", async () => {
    const r = await borrar(D_AJENA)
    expect(r.status).toBe(404)
    expect(base.tablas.farming_direcciones.find((x: any) => x.id === D_AJENA)).toBeDefined()
  })

  it("algo que no existe: 404", async () => {
    const r = await borrar("20000000-0000-0000-0000-000000000099")
    expect(r.status).toBe(404)
  })
})

// Task 6, segundo cambio (16-sep-2026): con el fix de app/api/farming/avisos/route.ts, una
// marca "convertido" ahora excluye al aviso de «A la venta en mi zona» PARA SIEMPRE. Si se
// borra la tarjeta que esa marca señala sin borrar también la marca, el aviso desaparece de la
// solapa sin ninguna forma de volver a verlo — la desaparición silenciosa que este proyecto
// rechaza. Por eso el DELETE de acá también borra la fila de farming_avisos_marca (si la
// tarjeta tiene aviso_id), scopeada a zona_id + aviso_id (la PK de esa tabla).
describe("DELETE /api/farming/direcciones/[id]: la marca del aviso que la originó", () => {
  it("borrar una tarjeta nacida de un aviso borra también su marca: el aviso puede volver a listarse", async () => {
    nuevaBase({
      farming_direcciones: [direccionFixture(D_MIA, Z_MIA, AGENCIA, { aviso_id: 42, origen: "aviso" })],
      farming_avisos_marca: [
        { zona_id: Z_MIA, aviso_id: 42, aviso_es_dueno_directo: false, user_id: YO, estado: "convertido", direccion_id: D_MIA, created_at: "" },
      ],
    })
    const r = await borrar(D_MIA)
    const d = await r.json()
    expect(r.status).toBe(200)
    expect(d.ok).toBe(true)
    expect(base.tablas.farming_direcciones.find((x: any) => x.id === D_MIA)).toBeUndefined()
    expect(base.tablas.farming_avisos_marca).toHaveLength(0)
  })

  it("borrar una tarjeta que nunca vino de un aviso (aviso_id null) no toca ninguna marca", async () => {
    nuevaBase({
      farming_direcciones: [direccionFixture(D_MIA, Z_MIA, AGENCIA)], // aviso_id null, origen "caminata"
      farming_avisos_marca: [
        // Una marca de otro aviso en la MISMA zona: si el código borrara por zona_id solo (sin
        // el AND aviso_id), esto desaparecería igual, y no debería.
        { zona_id: Z_MIA, aviso_id: 7, aviso_es_dueno_directo: false, user_id: YO, estado: "descartado", direccion_id: null, created_at: "" },
      ],
    })
    const r = await borrar(D_MIA)
    expect(r.status).toBe(200)
    expect(base.tablas.farming_avisos_marca).toHaveLength(1)
  })

  it("una tarjeta de la zona de un colega (con aviso_id): sigue dando 403, no borra la tarjeta NI la marca", async () => {
    nuevaBase({
      farming_direcciones: [direccionFixture(D_JUAN, Z_JUAN, AGENCIA, { aviso_id: 42, origen: "aviso" })],
      farming_avisos_marca: [
        { zona_id: Z_JUAN, aviso_id: 42, aviso_es_dueno_directo: false, user_id: JUAN, estado: "convertido", direccion_id: D_JUAN, created_at: "" },
      ],
    })
    const r = await borrar(D_JUAN)
    expect(r.status).toBe(403)
    expect(base.tablas.farming_direcciones.find((x: any) => x.id === D_JUAN)).toBeDefined()
    expect(base.tablas.farming_avisos_marca).toHaveLength(1)
  })
})
