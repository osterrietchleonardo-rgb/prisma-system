import { describe, it, expect, beforeEach, vi } from "vitest"
import { baseFalsa } from "@/lib/farming/base-falsa"

/**
 * Los avisos publicados dentro de una zona. Las reglas que sostiene este archivo:
 *  1. La zona se valida SIEMPRE: de otro asesor → 403; de otra agencia o liberada → 404.
 *     createAdminClient se saltea la RLS, así que el filtro explícito no es opcional.
 *  2. Los descartados NO vuelven: viajan a la función como p_excluir, para que la página
 *     no quede corta y los conteos no mientan.
 *  3. Los atajos que se devuelven son solo los que tienen datos.
 *  4. Una señal desconocida es 400, no una consulta sin filtro.
 */

const AGENCIA = "ag-1"
const YO = "u-yo", JUAN = "u-juan"
const cuadrado = { type: "Polygon", coordinates: [[[-58.46, -34.56], [-58.45, -34.56], [-58.45, -34.55], [-58.46, -34.55], [-58.46, -34.56]]] }

const sesion = { userId: YO, agencyId: AGENCIA, role: "asesor" }
vi.mock("@/lib/auth/tenant-validation", () => ({ requireTenant: async () => ({ ...sesion }) }))

const espia = { rpc: [] as { fn: string; args: any }[] }
let base = baseFalsa({})
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => base }))

const { GET } = await import("./route")

const fila = (id: number, extra: any = {}) => ({
  id, es_dueno_directo: false, titulo: `Aviso ${id}`, tipo: "Departamento", direccion: "Conde 900",
  barrio: "Colegiales", precio_usd: "185000", superficie_total_m2: "78", ambientes: 3,
  url_publica: `https://www.zonaprop.com.ar/x-${id}.html`, foto_portada: null,
  publicador_nombre: "Inmobiliaria X", estado: "activo", dias_publicado: 30,
  variacion_precio_pct: null, caido_en: null, ...extra,
})

const pedir = (qs: string) => GET(new Request(`http://localhost/api/farming/avisos?${qs}`))

beforeEach(() => {
  espia.rpc = []
  base = baseFalsa(
    {
      farming_zonas: [
        { id: "z-mia", agency_id: AGENCIA, owner_user_id: YO, nombre: "Colegiales", geojson: cuadrado, estado: "activa" },
        { id: "z-juan", agency_id: AGENCIA, owner_user_id: JUAN, nombre: "De Juan", geojson: cuadrado, estado: "activa" },
        { id: "z-liberada", agency_id: AGENCIA, owner_user_id: YO, nombre: "Vieja", geojson: cuadrado, estado: "liberada" },
        { id: "z-ajena", agency_id: "ag-2", owner_user_id: "u-x", nombre: "Otra agencia", geojson: cuadrado, estado: "activa" },
      ],
      farming_zonas_compartidas: [{ zona_id: "z-juan", user_id: YO, agregado_por: JUAN, created_at: "" }],
      farming_avisos_marca: [{ zona_id: "z-mia", aviso_id: 7, aviso_es_dueno_directo: false, user_id: YO, estado: "descartado", created_at: "" }],
    },
    {
      farming_avisos_en_zona: (args: any) => { espia.rpc.push({ fn: "farming_avisos_en_zona", args }); return [fila(1), fila(2, { es_dueno_directo: true })] },
      farming_avisos_conteos: (args: any) => { espia.rpc.push({ fn: "farming_avisos_conteos", args }); return [{ total: 170, duenos: 1, caidos: 0, viejos: 30, bajaron: 0 }] },
    },
  )
})

describe("GET /api/farming/avisos", () => {
  it("devuelve los avisos de mi zona con los conteos y solo los atajos con datos", async () => {
    const r = await pedir("zona_id=z-mia")
    const d = await r.json()
    expect(r.status).toBe(200)
    expect(d.zona).toEqual({ id: "z-mia", nombre: "Colegiales" })
    expect(d.conteos.total).toBe(170)
    expect(d.atajos).toEqual(["duenos", "viejos"])
    expect(d.avisos).toHaveLength(2)
    expect(d.avisos[0].titulo).toBe("Aviso 1")
  })

  it("los descartados viajan como p_excluir a las DOS funciones", async () => {
    await pedir("zona_id=z-mia")
    expect(espia.rpc).toHaveLength(2)
    for (const llamada of espia.rpc) expect(llamada.args.p_excluir).toEqual([7])
  })

  it("una zona compartida conmigo también se puede ver", async () => {
    expect((await pedir("zona_id=z-juan")).status).toBe(200)
  })

  it("la zona de otro asesor que NO comparte conmigo: 403", async () => {
    base.tablas.farming_zonas_compartidas = []
    expect((await pedir("zona_id=z-juan")).status).toBe(403)
  })

  it("una zona de otra agencia: 404", async () => {
    expect((await pedir("zona_id=z-ajena")).status).toBe(404)
  })

  it("una zona liberada: 404", async () => {
    expect((await pedir("zona_id=z-liberada")).status).toBe(404)
  })

  it("sin zona_id: 400", async () => {
    expect((await pedir("")).status).toBe(400)
  })

  it("una señal que no existe: 400 y no se consulta nada", async () => {
    const r = await pedir("zona_id=z-mia&senal=cualquiera")
    expect(r.status).toBe(400)
    expect(espia.rpc).toEqual([])
  })

  it("una señal válida viaja tal cual, y la página se traduce a offset", async () => {
    await pedir("zona_id=z-mia&senal=duenos&pagina=2")
    const lista = espia.rpc.find((x) => x.fn === "farming_avisos_en_zona")!
    expect(lista.args.p_senal).toBe("duenos")
    expect(lista.args.p_offset).toBe(120)
    expect(lista.args.p_limit).toBe(61)
  })

  it("hay_mas es true solo si vino una fila de más", async () => {
    const d = await (await pedir("zona_id=z-mia")).json()
    expect(d.hay_mas).toBe(false)
    expect(d.pagina).toBe(0)
  })
})
