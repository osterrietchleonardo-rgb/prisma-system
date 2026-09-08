import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * BUSCAR COMPARABLES DENTRO DE LAS ZONAS DIBUJADAS.
 *
 * Las cuatro reglas que sostiene este archivo:
 *  1. Las zonas se leen SIEMPRE filtrando por user_id. createAdminClient saltea RLS: sin ese
 *     filtro, mandando un id ajeno se podria buscar dentro del dibujo de otra persona, y las
 *     zonas son privadas hasta del director.
 *  2. El navegador manda IDS, nunca un poligono. Un poligono en el body se ignora.
 *  3. Si el pedido trae zonas pero ninguna resuelve, NO se busca: se avisa. Buscar por barrio
 *     ahi seria devolver una busqueda distinta de la que el asesor pidio, sin que se note.
 *  4. Sin zona_ids, a las RPC les llega p_poligonos = null y todo sigue como antes.
 *
 * Los testigos son de CONDUCTA: que le llego a cada RPC y que se guardo en el historial.
 */

const AGENCIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const USUARIO = "11111111-1111-4111-8111-111111111111"

const anillo = [[-58.45, -34.56], [-58.44, -34.56], [-58.44, -34.55], [-58.45, -34.55], [-58.45, -34.56]]

const zonasEnBase = [
  { id: "z1", nombre: "Belgrano bajo", geojson: { type: "Polygon", coordinates: [anillo] }, user_id: USUARIO },
  { id: "z2", nombre: "Rota", geojson: { type: "Point", coordinates: [-58.4, -34.5] }, user_id: USUARIO },
  { id: "zAjena", nombre: "De otro", geojson: { type: "Polygon", coordinates: [anillo] }, user_id: "otro-usuario" },
]

const espia = {
  rpc: [] as { fn: string; args: any }[],
  filtrosZonas: [] as Record<string, any>[],
  guardado: null as any,
}

vi.mock("@/lib/auth/tenant-validation", () => ({
  requireTenant: async () => ({ userId: USUARIO, agencyId: AGENCIA }),
}))

vi.mock("@/lib/gemini", () => ({ generateEmbedding: async () => [] }))

// Constructor de consultas minimo: registra los filtros y devuelve las filas que matcheen.
function tablaZonas() {
  const filtros: Record<string, any> = {}
  const q: any = {
    select: () => q,
    eq: (col: string, val: any) => { filtros[col] = val; return q },
    in: (col: string, vals: any[]) => { filtros[col] = vals; return q },
    then: (resolve: any) => {
      espia.filtrosZonas.push({ ...filtros })
      const filas = zonasEnBase
        .filter((z) => (filtros.id ? filtros.id.includes(z.id) : true))
        .filter((z) => (filtros.user_id ? z.user_id === filtros.user_id : true))
        .map(({ user_id, ...resto }) => resto)
      return resolve({ data: filas, error: null })
    },
  }
  return q
}

function tablaGenerica(tabla: string) {
  const q: any = {
    select: () => q,
    in: () => q,
    insert: (fila: any) => { if (tabla === "acm_searches") espia.guardado = fila; return q },
    single: async () => ({ data: { id: "search-1" }, error: null }),
    then: (resolve: any) => resolve({ data: [], error: null }),
  }
  return q
}

const clienteFalso = {
  rpc: async (fn: string, args: any) => {
    espia.rpc.push({ fn, args })
    return { data: [], error: null }
  },
  from: (tabla: string) => (tabla === "mapa_zonas" ? tablaZonas() : tablaGenerica(tabla)),
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => clienteFalso }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => clienteFalso }))

const { POST } = await import("./route")

const pedido = (body: any) =>
  new Request("http://localhost/api/acm/comparables", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sujeto: { barrio: "Belgrano", m2_cubiertos: 100 }, operacion: "venta", ...body }),
  })

beforeEach(() => {
  espia.rpc = []
  espia.filtrosZonas = []
  espia.guardado = null
})

describe("POST /api/acm/comparables · zonas dibujadas", () => {
  it("sin zona_ids, a las dos RPC les llega p_poligonos null", async () => {
    const res = await POST(pedido({}))

    expect(res.status).toBe(200)
    expect(espia.rpc).toHaveLength(2)
    for (const llamada of espia.rpc) expect(llamada.args.p_poligonos).toBeNull()
  })

  it("con una zona valida, a las dos RPC les llega su poligono", async () => {
    const res = await POST(pedido({ zona_ids: ["z1"] }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(espia.rpc).toHaveLength(2)
    for (const llamada of espia.rpc) {
      expect(llamada.args.p_poligonos).toHaveLength(1)
      expect(llamada.args.p_poligonos[0]).toContain("(-58.45,-34.56)")
    }
    expect(data.meta.zonas_usadas).toEqual(["Belgrano bajo"])
  })

  it("SIEMPRE filtra las zonas por user_id: una zona ajena no existe", async () => {
    const res = await POST(pedido({ zona_ids: ["zAjena"] }))

    expect(espia.filtrosZonas[0].user_id).toBe(USUARIO)
    expect(res.status).toBe(400)
    expect(espia.rpc).toHaveLength(0)
  })

  it("ignora un poligono mandado a mano desde el navegador", async () => {
    await POST(pedido({ p_poligonos: ["((0,0),(1,0),(1,1))"], poligonos: ["((0,0),(1,0),(1,1))"] }))

    expect(espia.rpc).toHaveLength(2)
    for (const llamada of espia.rpc) expect(llamada.args.p_poligonos).toBeNull()
  })

  it("si pidio zonas y ninguna resuelve, NO busca: avisa", async () => {
    const res = await POST(pedido({ zona_ids: ["z2"] }))
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(espia.rpc).toHaveLength(0)
    expect(data.error).toContain("Rota")
  })

  it("una rota entre dos buenas no cancela la busqueda, pero queda anotada", async () => {
    const res = await POST(pedido({ zona_ids: ["z1", "z2"] }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(espia.rpc[0].args.p_poligonos).toHaveLength(1)
    expect(data.meta.zonas_invalidas).toEqual(["Rota"])
  })

  it("guarda las zonas usadas dentro del sujeto, para poder reabrir el ACM", async () => {
    await POST(pedido({ zona_ids: ["z1"] }))

    expect(espia.guardado.sujeto.zonas).toEqual([{ id: "z1", nombre: "Belgrano bajo" }])
  })
})
