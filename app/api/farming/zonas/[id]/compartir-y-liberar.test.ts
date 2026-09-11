// app/api/farming/zonas/[id]/compartir-y-liberar.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest"
import { baseFalsa } from "@/lib/farming/base-falsa"

/**
 * Compartir (solo el dueño, solo con asesores activos de su agencia) y liberar (solo el
 * director, con motivo, sin borrar nada).
 */

const AGENCIA = "ag-1"
const YO = "u-yo", JUAN = "u-juan", PAUSADO = "u-pausado", DIRECTOR = "u-dir"

const cuadrado = { type: "Polygon", coordinates: [[[-58.40, -34.56], [-58.39, -34.56], [-58.39, -34.55], [-58.40, -34.55], [-58.40, -34.56]]] }

const sesion = { userId: YO, agencyId: AGENCIA, role: "asesor" }
vi.mock("@/lib/auth/tenant-validation", () => ({ requireTenant: async () => ({ ...sesion }) }))
let base = baseFalsa({})
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => base }))

const compartir = await import("./compartir/route")
const liberar = await import("./liberar/route")

const postCompartir = (id: string, body: any) =>
  compartir.POST(new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: { id } })
const delCompartir = (id: string, userId: string) =>
  compartir.DELETE(new Request(`http://localhost/x?user_id=${userId}`, { method: "DELETE" }), { params: { id } })
const postLiberar = (id: string, body: any) =>
  liberar.POST(new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: { id } })

beforeEach(() => {
  sesion.userId = YO
  sesion.role = "asesor"
  base = baseFalsa({
    profiles: [
      { id: YO, agency_id: AGENCIA, full_name: "Leo", role: "asesor", estado: "activo" },
      { id: JUAN, agency_id: AGENCIA, full_name: "Juan", role: "asesor", estado: "activo" },
      { id: PAUSADO, agency_id: AGENCIA, full_name: "Pausado", role: "asesor", estado: "pausado" },
      { id: DIRECTOR, agency_id: AGENCIA, full_name: "Dire", role: "director", estado: "activo" },
      { id: "u-otra", agency_id: "ag-2", full_name: "Otra", role: "asesor", estado: "activo" },
    ],
    farming_zonas: [
      { id: "z-mia", agency_id: AGENCIA, owner_user_id: YO, nombre: "Mía", geojson: cuadrado, area_km2: 1, estado: "activa", origen_mapa_zona_id: null, trazo_editado_en: null, created_at: "" },
      { id: "z-juan", agency_id: AGENCIA, owner_user_id: JUAN, nombre: "De Juan", geojson: cuadrado, area_km2: 1, estado: "activa", origen_mapa_zona_id: null, trazo_editado_en: null, created_at: "" },
    ],
    farming_zonas_compartidas: [],
  })
})

describe("compartir", () => {
  it("el dueño suma a un asesor activo de su agencia", async () => {
    const r = await postCompartir("z-mia", { user_id: JUAN })
    expect(r.status).toBe(200)
    expect(base.tablas.farming_zonas_compartidas).toEqual([expect.objectContaining({ zona_id: "z-mia", user_id: JUAN, agregado_por: YO })])
  })

  it("sumar dos veces al mismo no duplica", async () => {
    await postCompartir("z-mia", { user_id: JUAN })
    await postCompartir("z-mia", { user_id: JUAN })
    expect(base.tablas.farming_zonas_compartidas).toHaveLength(1)
  })

  it.each([["uno mismo", YO], ["un pausado", PAUSADO], ["el director", DIRECTOR], ["otra agencia", "u-otra"], ["alguien que no existe", "u-nadie"]])(
    "no se puede compartir con %s: 400",
    async (_, id) => {
      expect((await postCompartir("z-mia", { user_id: id })).status).toBe(400)
      expect(base.tablas.farming_zonas_compartidas).toEqual([])
    },
  )

  it("un no-dueño no comparte la de otro: 403", async () => {
    expect((await postCompartir("z-juan", { user_id: PAUSADO })).status).toBe(403)
  })

  it("el dueño saca a alguien", async () => {
    base.tablas.farming_zonas_compartidas.push({ zona_id: "z-mia", user_id: JUAN, agregado_por: YO, created_at: "" })
    const r = await delCompartir("z-mia", JUAN)
    expect(r.status).toBe(200)
    expect(base.tablas.farming_zonas_compartidas).toEqual([])
  })
})

describe("liberar", () => {
  it("el director libera con motivo; la fila queda, no se borra", async () => {
    sesion.userId = DIRECTOR
    sesion.role = "director"
    const r = await postLiberar("z-juan", { motivo: "Juan se desvinculó" })
    expect(r.status).toBe(200)
    const fila = base.tablas.farming_zonas.find((z) => z.id === "z-juan")!
    expect(fila.estado).toBe("liberada")
    expect(fila.liberada_por).toBe(DIRECTOR)
    expect(fila.motivo_liberacion).toBe("Juan se desvinculó")
    expect(fila.liberada_en).toBeTruthy()
  })

  it("sin motivo: 400", async () => {
    sesion.userId = DIRECTOR
    sesion.role = "director"
    expect((await postLiberar("z-juan", { motivo: " " })).status).toBe(400)
  })

  it("un asesor no libera, ni la propia: 403", async () => {
    expect((await postLiberar("z-mia", { motivo: "x" })).status).toBe(403)
    expect(base.tablas.farming_zonas[0].estado).toBe("activa")
  })
})
