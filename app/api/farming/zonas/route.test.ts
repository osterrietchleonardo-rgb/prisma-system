import { describe, it, expect, beforeEach, vi } from "vitest"
import { baseFalsa } from "@/lib/farming/base-falsa"

/**
 * Crear y listar zonas de farming. Las reglas que sostiene este archivo:
 *  1. GET devuelve mías / compartidas conmigo / ajenas como contorno / colegas.
 *  2. POST rechaza: sin nombre, dibujo roto, más de 5 km², la 4ª zona activa, y que no sea
 *     asesor (403). Cada rechazo dice por qué.
 *  3. POST devuelve 409 con el recorte si pisa a otro. El trazo NO se guarda.
 *  4. POST guarda con agency_id y owner_user_id del que llama, NUNCA del body.
 */

const AGENCIA = "ag-1"
const YO = "u-yo", JUAN = "u-juan", DIRECTOR = "u-dir"

const cuadrado = (lng: number, lat: number, lado = 0.01) => ({
  type: "Polygon",
  coordinates: [[[lng, lat], [lng + lado, lat], [lng + lado, lat + lado], [lng, lat + lado], [lng, lat]]],
})

const sesion = { userId: YO, agencyId: AGENCIA, role: "asesor" }
vi.mock("@/lib/auth/tenant-validation", () => ({ requireTenant: async () => ({ ...sesion }) }))

let base = baseFalsa({})
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => base }))

const { GET, POST } = await import("./route")

const post = (body: any) =>
  POST(new Request("http://localhost/api/farming/zonas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }))

beforeEach(() => {
  sesion.userId = YO
  sesion.role = "asesor"
  base = baseFalsa({
    profiles: [
      { id: YO, agency_id: AGENCIA, full_name: "Leo", role: "asesor", estado: "activo" },
      { id: JUAN, agency_id: AGENCIA, full_name: "Juan Pérez", role: "asesor", estado: "activo" },
      { id: DIRECTOR, agency_id: AGENCIA, full_name: "Dire", role: "director", estado: "activo" },
      { id: "u-otra-agencia", agency_id: "ag-2", full_name: "Ajeno", role: "asesor", estado: "activo" },
    ],
    farming_zonas: [
      { id: "z-juan", agency_id: AGENCIA, owner_user_id: JUAN, nombre: "Belgrano C", geojson: cuadrado(-58.46, -34.56), area_km2: 1.02, estado: "activa", origen_mapa_zona_id: null, trazo_editado_en: null, created_at: "2026-09-12T10:00:00Z" },
      { id: "z-otra-agencia", agency_id: "ag-2", owner_user_id: "u-otra-agencia", nombre: "De otra agencia", geojson: cuadrado(-58.46, -34.56), area_km2: 1, estado: "activa", origen_mapa_zona_id: null, trazo_editado_en: null, created_at: "2026-09-12T10:00:00Z" },
    ],
    farming_zonas_compartidas: [],
  })
})

describe("GET /api/farming/zonas", () => {
  it("separa mías, compartidas conmigo y ajenas; nunca mezcla otra agencia", async () => {
    base.tablas.farming_zonas.push({ id: "z-mia", agency_id: AGENCIA, owner_user_id: YO, nombre: "Mía", geojson: cuadrado(-58.40, -34.56), area_km2: 1, estado: "activa", origen_mapa_zona_id: null, trazo_editado_en: null, created_at: "2026-09-12T11:00:00Z" })
    const r = await GET()
    const d = await r.json()
    expect(r.status).toBe(200)
    expect(d.mias.map((z: any) => z.id)).toEqual(["z-mia"])
    expect(d.ajenas.map((z: any) => z.id)).toEqual(["z-juan"])
    expect(d.ajenas[0].owner_nombre).toBe("Juan Pérez")
    expect(d.colegas).toEqual([{ id: JUAN, nombre: "Juan Pérez" }])
    expect(JSON.stringify(d)).not.toContain("z-otra-agencia")
  })
})

describe("POST /api/farming/zonas", () => {
  it("guarda una zona válida con el dueño y la agencia de la sesión, no del body", async () => {
    const r = await post({ nombre: "Núñez", geojson: cuadrado(-58.40, -34.56), owner_user_id: JUAN, agency_id: "ag-2" })
    const d = await r.json()
    expect(r.status).toBe(201)
    expect(d.zona.owner_user_id).toBe(YO)
    expect(d.zona.pedazos).toBe(1)
    expect(d.zona.area_km2).toBeGreaterThan(0.9)
    const fila = base.tablas.farming_zonas.find((z) => z.id === d.zona.id)!
    expect(fila.agency_id).toBe(AGENCIA)
    expect(fila.estado).toBe("activa")
  })

  it("sin nombre: 400", async () => {
    const r = await post({ nombre: "  ", geojson: cuadrado(-58.40, -34.56) })
    expect(r.status).toBe(400)
  })

  it("dibujo roto: 400 con el motivo", async () => {
    const r = await post({ nombre: "X", geojson: { type: "Point", coordinates: [0, 0] } })
    expect(r.status).toBe(400)
    expect((await r.json()).error).toMatch(/zona/)
  })

  it("más de 5 km²: 400", async () => {
    const r = await post({ nombre: "Medio barrio", geojson: cuadrado(-58.40, -34.56, 0.03) })
    expect(r.status).toBe(400)
    expect((await r.json()).error).toMatch(/5 km/)
  })

  it("la cuarta zona activa: 400; las liberadas no cuentan", async () => {
    for (let i = 0; i < 3; i++) {
      base.tablas.farming_zonas.push({ id: `z-mia-${i}`, agency_id: AGENCIA, owner_user_id: YO, nombre: `Mía ${i}`, geojson: cuadrado(-58.30 + i * 0.05, -34.56), area_km2: 1, estado: "activa", origen_mapa_zona_id: null, trazo_editado_en: null, created_at: "" })
    }
    base.tablas.farming_zonas.push({ id: "z-liberada", agency_id: AGENCIA, owner_user_id: YO, nombre: "Vieja", geojson: cuadrado(-58.20, -34.56), area_km2: 1, estado: "liberada", origen_mapa_zona_id: null, trazo_editado_en: null, created_at: "" })
    const r = await post({ nombre: "Cuarta", geojson: cuadrado(-58.10, -34.56) })
    expect(r.status).toBe(400)
    expect((await r.json()).error).toMatch(/3 zonas/)
  })

  it("pisa la de Juan: 409 con el recorte y NO guarda", async () => {
    const antes = base.tablas.farming_zonas.length
    const r = await post({ nombre: "Encima", geojson: cuadrado(-58.455, -34.56) })
    const d = await r.json()
    expect(r.status).toBe(409)
    expect(d.choques).toHaveLength(1)
    expect(d.choques[0].owner_nombre).toBe("Juan Pérez")
    expect(d.choques[0].recorte.type).toBe("Polygon")
    expect(base.tablas.farming_zonas).toHaveLength(antes)
  })

  it("una zona liberada ya no bloquea", async () => {
    base.tablas.farming_zonas.find((z) => z.id === "z-juan")!.estado = "liberada"
    const r = await post({ nombre: "Encima", geojson: cuadrado(-58.455, -34.56) })
    expect(r.status).toBe(201)
  })

  it("el director no crea zonas: 403", async () => {
    sesion.userId = DIRECTOR
    sesion.role = "director"
    const r = await post({ nombre: "X", geojson: cuadrado(-58.40, -34.56) })
    expect(r.status).toBe(403)
  })
})
