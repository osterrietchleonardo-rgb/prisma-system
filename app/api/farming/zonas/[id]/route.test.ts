// app/api/farming/zonas/[id]/route.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest"
import { baseFalsa } from "@/lib/farming/base-falsa"

/**
 * Editar y borrar una zona. Las reglas que sostiene este archivo:
 *  1. Solo el dueño edita o borra. Un compartido o un colega recibe 403; otra agencia, 404.
 *  2. "redibujar" reemplaza el trazo; "sumar" lo une al que había; "renombrar" solo el nombre.
 *  3. Cada edición vuelve a pasar por el control de choque y la zona SE EXCLUYE A SÍ MISMA.
 *  4. Sumar un pedazo que pisa a otro: 409 y el trazo viejo queda intacto.
 *  5. El tope de 5 km² se mide sobre la suma de los pedazos.
 */

const AGENCIA = "ag-1"
const YO = "u-yo", JUAN = "u-juan"

const cuadrado = (lng: number, lat: number, lado = 0.01) => ({
  type: "Polygon",
  coordinates: [[[lng, lat], [lng + lado, lat], [lng + lado, lat + lado], [lng, lat + lado], [lng, lat]]],
})

const sesion = { userId: YO, agencyId: AGENCIA, role: "asesor" }
vi.mock("@/lib/auth/tenant-validation", () => ({ requireTenant: async () => ({ ...sesion }) }))
let base = baseFalsa({})
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => base }))

const { PATCH, DELETE } = await import("./route")

const patch = (id: string, body: any) =>
  PATCH(new Request(`http://localhost/api/farming/zonas/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: { id } })
const borrar = (id: string) => DELETE(new Request(`http://localhost/api/farming/zonas/${id}`, { method: "DELETE" }), { params: { id } })

const zona = (id: string, owner: string, geojson: any, extra: any = {}) => ({
  id, agency_id: AGENCIA, owner_user_id: owner, nombre: id, geojson, area_km2: 1, estado: "activa",
  origen_mapa_zona_id: null, trazo_editado_en: null, created_at: "2026-09-12T10:00:00Z", ...extra,
})

beforeEach(() => {
  sesion.userId = YO
  sesion.role = "asesor"
  base = baseFalsa({
    profiles: [
      { id: YO, agency_id: AGENCIA, full_name: "Leo", role: "asesor", estado: "activo" },
      { id: JUAN, agency_id: AGENCIA, full_name: "Juan Pérez", role: "asesor", estado: "activo" },
    ],
    farming_zonas: [
      zona("z-mia", YO, cuadrado(-58.40, -34.56)),
      zona("z-juan", JUAN, cuadrado(-58.46, -34.56)),
      zona("z-ajena", "u-x", cuadrado(-58.40, -34.56), { agency_id: "ag-2" }),
      zona("z-liberada", YO, cuadrado(-58.20, -34.56), { estado: "liberada" }),
    ],
    farming_zonas_compartidas: [{ zona_id: "z-juan", user_id: YO, agregado_por: JUAN, created_at: "" }],
  })
})

describe("PATCH", () => {
  it("renombrar cambia solo el nombre", async () => {
    const r = await patch("z-mia", { accion: "renombrar", nombre: "  Belgrano R  " })
    expect(r.status).toBe(200)
    expect((await r.json()).zona.nombre).toBe("Belgrano R")
    expect(base.tablas.farming_zonas[0].trazo_editado_en).toBeNull()
  })

  it("redibujar reemplaza el trazo y marca trazo_editado_en", async () => {
    const r = await patch("z-mia", { accion: "redibujar", geojson: cuadrado(-58.30, -34.56) })
    const d = await r.json()
    expect(r.status).toBe(200)
    expect(d.zona.geojson.coordinates[0][0]).toEqual([-58.30, -34.56])
    expect(base.tablas.farming_zonas[0].trazo_editado_en).not.toBeNull()
  })

  it("redibujar sobre el mismo lugar NO choca consigo misma", async () => {
    const r = await patch("z-mia", { accion: "redibujar", geojson: cuadrado(-58.402, -34.56) })
    expect(r.status).toBe(200)
  })

  it("sumar un pedazo suelto deja dos pedazos y suma el área", async () => {
    const r = await patch("z-mia", { accion: "sumar", geojson: cuadrado(-58.35, -34.56) })
    const d = await r.json()
    expect(r.status).toBe(200)
    expect(d.zona.pedazos).toBe(2)
    expect(d.zona.area_km2).toBeGreaterThan(1.8)
  })

  it("sumar un pedazo que pisa a Juan: 409 y el trazo viejo queda", async () => {
    const r = await patch("z-mia", { accion: "sumar", geojson: cuadrado(-58.455, -34.56) })
    expect(r.status).toBe(409)
    expect((await r.json()).choques[0].owner_nombre).toBe("Juan Pérez")
    expect(base.tablas.farming_zonas[0].geojson.type).toBe("Polygon")
    expect(base.tablas.farming_zonas[0].geojson).toEqual(cuadrado(-58.40, -34.56))
  })

  it("sumar hasta pasar los 5 km²: 400", async () => {
    const r = await patch("z-mia", { accion: "sumar", geojson: cuadrado(-58.30, -34.56, 0.025) })
    expect(r.status).toBe(400)
    expect((await r.json()).error).toMatch(/5 km/)
  })

  it("un compartido no edita el trazo: 403", async () => {
    const r = await patch("z-juan", { accion: "renombrar", nombre: "Mío ahora" })
    expect(r.status).toBe(403)
  })

  it("otra agencia: 404", async () => {
    expect((await patch("z-ajena", { accion: "renombrar", nombre: "X" })).status).toBe(404)
  })

  it("acción desconocida: 400", async () => {
    expect((await patch("z-mia", { accion: "volar" })).status).toBe(400)
  })

  it("una zona liberada no se puede renombrar: 404 y la fila queda igual", async () => {
    const r = await patch("z-liberada", { accion: "renombrar", nombre: "Otra cosa" })
    expect(r.status).toBe(404)
    const fila = base.tablas.farming_zonas.find((z) => z.id === "z-liberada")!
    expect(fila.nombre).toBe("z-liberada")
  })
})

describe("DELETE", () => {
  it("el dueño borra y se lleva las compartidas", async () => {
    base.tablas.farming_zonas_compartidas.push({ zona_id: "z-mia", user_id: JUAN, agregado_por: YO, created_at: "" })
    const r = await borrar("z-mia")
    expect(r.status).toBe(200)
    expect(base.tablas.farming_zonas.find((z) => z.id === "z-mia")).toBeUndefined()
    expect(base.tablas.farming_zonas_compartidas.filter((c) => c.zona_id === "z-mia")).toEqual([])
  })

  it("un compartido no borra: 403", async () => {
    expect((await borrar("z-juan")).status).toBe(403)
    expect(base.tablas.farming_zonas.find((z) => z.id === "z-juan")).toBeDefined()
  })

  it("una zona liberada no se puede borrar: 404 y sigue en la base", async () => {
    const r = await borrar("z-liberada")
    expect(r.status).toBe(404)
    expect(base.tablas.farming_zonas.find((z) => z.id === "z-liberada")).toBeDefined()
  })
})
