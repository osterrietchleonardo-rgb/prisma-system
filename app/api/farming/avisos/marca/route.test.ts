import { describe, it, expect, beforeEach, vi } from "vitest"
import { baseFalsa } from "@/lib/farming/base-falsa"

/**
 * Descartar un aviso de la zona. Reglas:
 *  1. Solo en una zona a la que tengo acceso (dueño o compartido): si no, 403/404.
 *  2. Descartar dos veces el mismo aviso no duplica la fila ni falla.
 *  3. Deshacer borra la marca; deshacer algo que no existe no rompe.
 *  4. La marca guarda quién la hizo (queda firmada, como todo en Farming).
 */

const AGENCIA = "ag-1"
const YO = "u-yo", JUAN = "u-juan"
const cuadrado = { type: "Polygon", coordinates: [[[-58.46, -34.56], [-58.45, -34.56], [-58.45, -34.55], [-58.46, -34.55], [-58.46, -34.56]]] }

const sesion = { userId: YO, agencyId: AGENCIA, role: "asesor" }
vi.mock("@/lib/auth/tenant-validation", () => ({ requireTenant: async () => ({ ...sesion }) }))
let base = baseFalsa({})
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => base }))

const { POST, DELETE } = await import("./route")

const descartar = (body: any) =>
  POST(new Request("http://localhost/api/farming/avisos/marca", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }))
const deshacer = (qs: string) =>
  DELETE(new Request(`http://localhost/api/farming/avisos/marca?${qs}`, { method: "DELETE" }))

beforeEach(() => {
  base = baseFalsa({
    farming_zonas: [
      { id: "z-mia", agency_id: AGENCIA, owner_user_id: YO, nombre: "Colegiales", geojson: cuadrado, estado: "activa" },
      { id: "z-juan", agency_id: AGENCIA, owner_user_id: JUAN, nombre: "De Juan", geojson: cuadrado, estado: "activa" },
      { id: "z-ajena", agency_id: "ag-2", owner_user_id: "u-x", nombre: "Otra", geojson: cuadrado, estado: "activa" },
    ],
    farming_zonas_compartidas: [],
    farming_avisos_marca: [],
  })
})

describe("POST (descartar)", () => {
  it("guarda la marca firmada por quien la hizo", async () => {
    const r = await descartar({ zona_id: "z-mia", aviso_id: 42, es_dueno_directo: true })
    expect(r.status).toBe(200)
    expect(base.tablas.farming_avisos_marca).toEqual([
      expect.objectContaining({ zona_id: "z-mia", aviso_id: 42, aviso_es_dueno_directo: true, user_id: YO, estado: "descartado" }),
    ])
  })

  it("descartar dos veces el mismo aviso no duplica", async () => {
    await descartar({ zona_id: "z-mia", aviso_id: 42, es_dueno_directo: false })
    const r = await descartar({ zona_id: "z-mia", aviso_id: 42, es_dueno_directo: false })
    expect(r.status).toBe(200)
    expect(base.tablas.farming_avisos_marca).toHaveLength(1)
  })

  it("en la zona de un colega que no comparte conmigo: 403 y no guarda", async () => {
    const r = await descartar({ zona_id: "z-juan", aviso_id: 42, es_dueno_directo: false })
    expect(r.status).toBe(403)
    expect(base.tablas.farming_avisos_marca).toEqual([])
  })

  it("en una zona de otra agencia: 404", async () => {
    expect((await descartar({ zona_id: "z-ajena", aviso_id: 42, es_dueno_directo: false })).status).toBe(404)
  })

  it.each([
    ["sin zona", { aviso_id: 42, es_dueno_directo: false }],
    ["sin aviso", { zona_id: "z-mia", es_dueno_directo: false }],
    ["aviso que no es número", { zona_id: "z-mia", aviso_id: "x", es_dueno_directo: false }],
  ])("%s: 400", async (_, body) => {
    expect((await descartar(body)).status).toBe(400)
  })
})

describe("DELETE (deshacer)", () => {
  it("borra la marca", async () => {
    await descartar({ zona_id: "z-mia", aviso_id: 42, es_dueno_directo: false })
    const r = await deshacer("zona_id=z-mia&aviso_id=42")
    expect(r.status).toBe(200)
    expect(base.tablas.farming_avisos_marca).toEqual([])
  })

  it("deshacer algo que no estaba marcado no rompe", async () => {
    expect((await deshacer("zona_id=z-mia&aviso_id=999")).status).toBe(200)
  })

  it("en la zona de un colega: 403", async () => {
    expect((await deshacer("zona_id=z-juan&aviso_id=42")).status).toBe(403)
  })
})
