// app/api/farming/direcciones/[id]/propietarios/route.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest"
import { baseFalsa } from "@/lib/farming/base-falsa"

/**
 * Los propietarios de una tarjeta: filas propias, nunca un texto suelto. Las reglas que
 * sostiene este archivo:
 *  1. `direccionAccesible` corre ANTES de cada alta, edición y borrado: 403 si la tarjeta es
 *     de la zona de un colega, 404 si no existe o es de otra agencia.
 *  2. El `pid` tiene que pertenecer a la dirección de la ruta: un propietario de OTRA
 *     dirección da 404 aunque quien llama tenga acceso a las dos.
 *  3. `nombre` es lo único obligatorio. El resto se completa después.
 *  4. El teléfono se guarda normalizado con `normalizePhoneE164`; si no se puede normalizar,
 *     se guarda tal como lo escribió el asesor y NO se rechaza.
 *  5. `agency_id` y `creado_por` salen de la sesión, nunca del body. Lista blanca explícita.
 *  6. `tracking_log_id` no se toca acá (es de la etapa 3-B).
 *  7. Un `vinculo` fuera de la lista del check: 400, no un 500 de Postgres.
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

const D_MIA = "20000000-0000-0000-0000-000000000001"
const D_MIA_2 = "20000000-0000-0000-0000-000000000002"
const D_JUAN = "20000000-0000-0000-0000-000000000003"
const D_AJENA = "20000000-0000-0000-0000-000000000004"

const P_DE_MIA = "30000000-0000-0000-0000-000000000001"
const P_DE_MIA_2 = "30000000-0000-0000-0000-000000000002"
const P_DE_JUAN = "30000000-0000-0000-0000-000000000003"

const sesion = { userId: YO, agencyId: AGENCIA, role: "asesor" }
vi.mock("@/lib/auth/tenant-validation", () => ({ requireTenant: vi.fn(async () => ({ ...sesion })) }))
import { requireTenant } from "@/lib/auth/tenant-validation"

let base = baseFalsa({})
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => base }))

const { POST } = await import("./route")
const { PATCH, DELETE } = await import("./[pid]/route")

const zonasFixture = () => [
  { id: Z_MIA, agency_id: AGENCIA, owner_user_id: YO, nombre: "Colegiales", geojson: cuadrado, estado: "activa" },
  { id: Z_JUAN, agency_id: AGENCIA, owner_user_id: JUAN, nombre: "De Juan", geojson: cuadrado, estado: "activa" },
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
  updated_at: "2026-09-16T10:00:00.000Z",
  ...extra,
})

const propietarioFixture = (id: string, direccionId: string, agencyId: string, extra: any = {}) => ({
  id,
  direccion_id: direccionId,
  agency_id: agencyId,
  piso: null,
  unidad: null,
  nombre: "Doña Rosa",
  vinculo: "propietario",
  telefono: null,
  email: null,
  notas: null,
  tracking_log_id: null,
  creado_por: YO,
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
      direccionFixture(D_MIA_2, Z_MIA, AGENCIA),
      direccionFixture(D_JUAN, Z_JUAN, AGENCIA),
      direccionFixture(D_AJENA, Z_MIA, OTRA_AGENCIA),
    ],
    farming_propietarios: [
      propietarioFixture(P_DE_MIA, D_MIA, AGENCIA),
      propietarioFixture(P_DE_MIA_2, D_MIA_2, AGENCIA),
      propietarioFixture(P_DE_JUAN, D_JUAN, AGENCIA),
    ],
    ...extra,
  })
}

beforeEach(() => {
  vi.mocked(requireTenant).mockImplementation(async () => ({ ...sesion }))
  nuevaBase()
})

const post = (id: string, body: any) =>
  POST(
    new Request(`http://localhost/api/farming/direcciones/${id}/propietarios`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: { id } },
  )

const patch = (id: string, pid: string, body: any) =>
  PATCH(
    new Request(`http://localhost/api/farming/direcciones/${id}/propietarios/${pid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: { id, pid } },
  )

const borrar = (id: string, pid: string) =>
  DELETE(
    new Request(`http://localhost/api/farming/direcciones/${id}/propietarios/${pid}`, { method: "DELETE" }),
    { params: { id, pid } },
  )

describe("POST /api/farming/direcciones/[id]/propietarios", () => {
  it("crea un propietario con solo el nombre", async () => {
    const r = await post(D_MIA, { nombre: "Marta" })
    const d = await r.json()
    expect(r.status).toBe(201)
    expect(d.propietario.nombre).toBe("Marta")
    expect(d.propietario.direccion_id).toBe(D_MIA)
    expect(d.propietario.agency_id).toBe(AGENCIA)
    expect(d.propietario.creado_por).toBe(YO)
    const fila = base.tablas.farming_propietarios.find((p: any) => p.id === d.propietario.id)
    expect(fila).toBeDefined()
  })

  it("sin nombre: 400 y no crea nada", async () => {
    const antes = base.tablas.farming_propietarios.length
    const r = await post(D_MIA, { piso: "3" })
    expect(r.status).toBe(400)
    expect(base.tablas.farming_propietarios.length).toBe(antes)
  })

  it("nombre en blanco: 400 y no crea nada", async () => {
    const antes = base.tablas.farming_propietarios.length
    const r = await post(D_MIA, { nombre: "   " })
    expect(r.status).toBe(400)
    expect(base.tablas.farming_propietarios.length).toBe(antes)
  })

  it("un vínculo fuera de la lista del check: 400, no crea nada", async () => {
    const antes = base.tablas.farming_propietarios.length
    const r = await post(D_MIA, { nombre: "Marta", vinculo: "vecino" })
    const d = await r.json()
    expect(r.status).toBe(400)
    expect(typeof d.error).toBe("string")
    expect(base.tablas.farming_propietarios.length).toBe(antes)
  })

  it("un vínculo válido se guarda tal cual", async () => {
    const r = await post(D_MIA, { nombre: "Marta", vinculo: "inquilino" })
    const d = await r.json()
    expect(r.status).toBe(201)
    expect(d.propietario.vinculo).toBe("inquilino")
  })

  it("sin vínculo, el default es propietario", async () => {
    const r = await post(D_MIA, { nombre: "Marta" })
    const d = await r.json()
    expect(d.propietario.vinculo).toBe("propietario")
  })

  it("un teléfono que se puede normalizar se guarda en E.164", async () => {
    const r = await post(D_MIA, { nombre: "Marta", telefono: "11 2345 6789" })
    const d = await r.json()
    expect(r.status).toBe(201)
    expect(d.propietario.telefono).toBe("5491123456789")
  })

  it("un teléfono que NO se puede normalizar se guarda tal cual, sin rechazar el alta", async () => {
    const r = await post(D_MIA, { nombre: "Marta", telefono: "el de al lado, preguntar por Carlos" })
    const d = await r.json()
    expect(r.status).toBe(201)
    expect(d.propietario.telefono).toBe("el de al lado, preguntar por Carlos")
  })

  it("sin teléfono: queda null", async () => {
    const r = await post(D_MIA, { nombre: "Marta" })
    const d = await r.json()
    expect(d.propietario.telefono).toBeNull()
  })

  it("una tarjeta de la zona de un colega que no comparte: 403 y no crea nada", async () => {
    const antes = base.tablas.farming_propietarios.length
    const r = await post(D_JUAN, { nombre: "Marta" })
    expect(r.status).toBe(403)
    expect(base.tablas.farming_propietarios.length).toBe(antes)
  })

  it("una tarjeta de otra agencia: 404 y no crea nada", async () => {
    const antes = base.tablas.farming_propietarios.length
    const r = await post(D_AJENA, { nombre: "Marta" })
    expect(r.status).toBe(404)
    expect(base.tablas.farming_propietarios.length).toBe(antes)
  })

  it("una tarjeta que no existe: 404", async () => {
    const r = await post("20000000-0000-0000-0000-000000000099", { nombre: "Marta" })
    expect(r.status).toBe(404)
  })

  it("agency_id y creado_por del body se ignoran: salen de la sesión", async () => {
    const r = await post(D_MIA, { nombre: "Marta", agency_id: OTRA_AGENCIA, creado_por: "u-ajeno", direccion_id: D_JUAN })
    const d = await r.json()
    expect(r.status).toBe(201)
    expect(d.propietario.agency_id).toBe(AGENCIA)
    expect(d.propietario.creado_por).toBe(YO)
    expect(d.propietario.direccion_id).toBe(D_MIA)
  })
})

describe("PATCH /api/farming/direcciones/[id]/propietarios/[pid]", () => {
  it("cambia un campo editable y pisa updated_at", async () => {
    const antes = base.tablas.farming_propietarios.find((p: any) => p.id === P_DE_MIA)!.updated_at
    const r = await patch(D_MIA, P_DE_MIA, { piso: "4", unidad: "B" })
    const d = await r.json()
    expect(r.status).toBe(200)
    expect(d.propietario.piso).toBe("4")
    expect(d.propietario.unidad).toBe("B")
    const fila = base.tablas.farming_propietarios.find((p: any) => p.id === P_DE_MIA)!
    expect(fila.piso).toBe("4")
    expect(fila.updated_at).not.toBe(antes)
  })

  it("actualiza el teléfono normalizándolo", async () => {
    const r = await patch(D_MIA, P_DE_MIA, { telefono: "11 2345 6789" })
    const d = await r.json()
    expect(r.status).toBe(200)
    expect(d.propietario.telefono).toBe("5491123456789")
  })

  it("un teléfono impresentable en el PATCH se guarda tal cual, no se pierde", async () => {
    const r = await patch(D_MIA, P_DE_MIA, { telefono: "preguntar en el kiosco" })
    const d = await r.json()
    expect(r.status).toBe(200)
    expect(d.propietario.telefono).toBe("preguntar en el kiosco")
  })

  it("un vínculo fuera de la lista: 400, no escribe", async () => {
    const r = await patch(D_MIA, P_DE_MIA, { vinculo: "vecino" })
    const d = await r.json()
    expect(r.status).toBe(400)
    const fila = base.tablas.farming_propietarios.find((p: any) => p.id === P_DE_MIA)!
    expect(fila.vinculo).toBe("propietario")
    expect(typeof d.error).toBe("string")
  })

  it("vaciar el nombre: 400, no escribe", async () => {
    const r = await patch(D_MIA, P_DE_MIA, { nombre: "   " })
    expect(r.status).toBe(400)
    const fila = base.tablas.farming_propietarios.find((p: any) => p.id === P_DE_MIA)!
    expect(fila.nombre).toBe("Doña Rosa")
  })

  // Este test muere si se saca la lista blanca: agency_id, creado_por, direccion_id y
  // tracking_log_id ajenos quedarían pegados en la fila.
  it("un PATCH que manda agency_id, creado_por, direccion_id y tracking_log_id ajenos: se ignoran", async () => {
    const r = await patch(D_MIA, P_DE_MIA, {
      agency_id: OTRA_AGENCIA,
      creado_por: "u-ajeno",
      direccion_id: D_JUAN,
      tracking_log_id: "99999999-0000-0000-0000-000000000000",
      id: "otro-id",
      created_at: "2020-01-01T00:00:00.000Z",
      nombre: "Sí cambia",
    })
    const d = await r.json()
    expect(r.status).toBe(200)
    const fila = base.tablas.farming_propietarios.find((p: any) => p.id === P_DE_MIA)!
    expect(fila.agency_id).toBe(AGENCIA)
    expect(fila.creado_por).toBe(YO)
    expect(fila.direccion_id).toBe(D_MIA)
    expect(fila.tracking_log_id).toBeNull()
    expect(fila.id).toBe(P_DE_MIA)
    expect(fila.created_at).toBe("2026-09-16T10:00:00.000Z")
    expect(fila.nombre).toBe("Sí cambia")
    expect(d.propietario.nombre).toBe("Sí cambia")
  })

  it("un propietario de OTRA dirección: 404 aunque tenga acceso a las dos direcciones", async () => {
    const r = await patch(D_MIA, P_DE_MIA_2, { piso: "9" })
    expect(r.status).toBe(404)
    const fila = base.tablas.farming_propietarios.find((p: any) => p.id === P_DE_MIA_2)!
    expect(fila.piso).toBeNull()
  })

  it("una tarjeta de la zona de un colega que no comparte: 403 y no escribe", async () => {
    const r = await patch(D_JUAN, P_DE_JUAN, { piso: "9" })
    expect(r.status).toBe(403)
    const fila = base.tablas.farming_propietarios.find((p: any) => p.id === P_DE_JUAN)!
    expect(fila.piso).toBeNull()
  })

  it("una tarjeta de otra agencia: 404", async () => {
    const r = await patch(D_AJENA, "30000000-0000-0000-0000-000000000099", { piso: "9" })
    expect(r.status).toBe(404)
  })

  it("un propietario que no existe: 404", async () => {
    const r = await patch(D_MIA, "30000000-0000-0000-0000-000000000099", { piso: "9" })
    expect(r.status).toBe(404)
  })
})

describe("DELETE /api/farming/direcciones/[id]/propietarios/[pid]", () => {
  it("borra de verdad", async () => {
    const r = await borrar(D_MIA, P_DE_MIA)
    const d = await r.json()
    expect(r.status).toBe(200)
    expect(d.ok).toBe(true)
    expect(base.tablas.farming_propietarios.find((p: any) => p.id === P_DE_MIA)).toBeUndefined()
  })

  it("un propietario de OTRA dirección: 404 y no borra", async () => {
    const r = await borrar(D_MIA, P_DE_MIA_2)
    expect(r.status).toBe(404)
    expect(base.tablas.farming_propietarios.find((p: any) => p.id === P_DE_MIA_2)).toBeDefined()
  })

  it("una tarjeta de la zona de un colega que no comparte: 403 y no borra", async () => {
    const r = await borrar(D_JUAN, P_DE_JUAN)
    expect(r.status).toBe(403)
    expect(base.tablas.farming_propietarios.find((p: any) => p.id === P_DE_JUAN)).toBeDefined()
  })

  it("una tarjeta de otra agencia: 404", async () => {
    const r = await borrar(D_AJENA, "30000000-0000-0000-0000-000000000099")
    expect(r.status).toBe(404)
  })

  it("algo que no existe: 404", async () => {
    const r = await borrar(D_MIA, "30000000-0000-0000-0000-000000000099")
    expect(r.status).toBe(404)
  })
})
