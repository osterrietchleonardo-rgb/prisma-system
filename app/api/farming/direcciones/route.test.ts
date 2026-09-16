import { describe, it, expect, beforeEach, vi } from "vitest"
import { baseFalsa } from "@/lib/farming/base-falsa"

/**
 * La compuerta de la tarjeta de la caminata: lista y alta de `farming_direcciones`.
 *
 * Reglas que sostiene este archivo:
 *  1. La zona se valida SIEMPRE, antes de tocar farming_direcciones, en las dos operaciones:
 *     de un colega que no comparte → 403; de otra agencia, liberada o inexistente → 404.
 *  2. `agency_id`, `creada_por` y `origen` los decide el SERVIDOR, nunca el body.
 *  3. `validarDireccion` corre en el servidor aunque la pantalla ya haya validado: los
 *     `errores` bloquean (400, no se escribe nada); los `avisos` NO bloquean — la tarjeta se
 *     guarda igual y viajan en la respuesta para que la pantalla los muestre.
 *  4. El duplicado se busca con la MISMA condición que el índice parcial de la migración: una
 *     puerta sin altura comparable (vacía o "s/n"/"sn"/"s.n.") nunca choca con otra.
 *  5. Un aviso convertido en tarjeta queda "convertido" en farming_avisos_marca, CON UPDATE
 *     (o un insert si nunca se había marcado) — nunca con un upsert que pise en silencio.
 *
 * Ids de zona con forma de uuid real: zonaAccesible corta ANTES de consultar si no la tienen
 * (la columna es `uuid` en Postgres).
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
const Z_LIBERADA = "10000000-0000-0000-0000-000000000003"
const Z_AJENA = "10000000-0000-0000-0000-000000000004"

const sesion = { userId: YO, agencyId: AGENCIA, role: "asesor" }
vi.mock("@/lib/auth/tenant-validation", () => ({ requireTenant: vi.fn(async () => ({ ...sesion })) }))
import { requireTenant } from "@/lib/auth/tenant-validation"

let base = baseFalsa({})
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => base }))

const { GET, POST } = await import("./route")

const zonasFixture = () => [
  { id: Z_MIA, agency_id: AGENCIA, owner_user_id: YO, nombre: "Colegiales", geojson: cuadrado, estado: "activa" },
  { id: Z_JUAN, agency_id: AGENCIA, owner_user_id: JUAN, nombre: "De Juan", geojson: cuadrado, estado: "activa" },
  { id: Z_LIBERADA, agency_id: AGENCIA, owner_user_id: YO, nombre: "Vieja", geojson: cuadrado, estado: "liberada" },
  { id: Z_AJENA, agency_id: OTRA_AGENCIA, owner_user_id: "u-x", nombre: "Otra agencia", geojson: cuadrado, estado: "activa" },
]

function nuevaBase(extra: Record<string, any[]> = {}) {
  base = baseFalsa({
    farming_zonas: zonasFixture(),
    farming_zonas_compartidas: [],
    farming_direcciones: [],
    farming_avisos_marca: [],
    ...extra,
  })
}

beforeEach(() => {
  vi.mocked(requireTenant).mockImplementation(async () => ({ ...sesion }))
  nuevaBase()
})

const pedirGET = (qs: string) => GET(new Request(`http://localhost/api/farming/direcciones?${qs}`))
const pedirPOST = (body: any) =>
  POST(new Request("http://localhost/api/farming/direcciones", { method: "POST", body: JSON.stringify(body) }))

describe("GET /api/farming/direcciones", () => {
  it("devuelve las direcciones de mi zona ordenadas (por orden, dentro de la misma etapa)", async () => {
    // Insertadas fuera de orden a propósito: si se saca el .order() de producción esto falla.
    // El doble de prueba solo respeta el ÚLTIMO .order() de la cadena (ver el comentario en
    // route.ts), así que las tres filas comparten "etapa" para que ordenar por "orden" alcance
    // como prueba de que el orden se pide de verdad.
    nuevaBase({
      farming_direcciones: [
        { id: "d3", zona_id: Z_MIA, agency_id: AGENCIA, calle: "Tercera", altura: "3", tipo: "casa", etapa: "relevado", orden: 3, creada_por: YO },
        { id: "d1", zona_id: Z_MIA, agency_id: AGENCIA, calle: "Primera", altura: "1", tipo: "casa", etapa: "relevado", orden: 1, creada_por: YO },
        { id: "d2", zona_id: Z_MIA, agency_id: AGENCIA, calle: "Segunda", altura: "2", tipo: "casa", etapa: "relevado", orden: 2, creada_por: YO },
      ],
    })
    const r = await pedirGET(`zona_id=${Z_MIA}`)
    const d = await r.json()
    expect(r.status).toBe(200)
    expect(d.zona).toEqual({ id: Z_MIA, nombre: "Colegiales" })
    expect(d.direcciones.map((x: any) => x.id)).toEqual(["d1", "d2", "d3"])
  })

  it("la zona de un colega que no comparte conmigo: 403", async () => {
    expect((await pedirGET(`zona_id=${Z_JUAN}`)).status).toBe(403)
  })

  it("una zona compartida conmigo sí se puede ver", async () => {
    base.tablas.farming_zonas_compartidas.push({ zona_id: Z_JUAN, user_id: YO, agregado_por: JUAN, created_at: "" })
    expect((await pedirGET(`zona_id=${Z_JUAN}`)).status).toBe(200)
  })

  it("una zona de otra agencia: 404", async () => {
    expect((await pedirGET(`zona_id=${Z_AJENA}`)).status).toBe(404)
  })

  it("una zona liberada: 404", async () => {
    expect((await pedirGET(`zona_id=${Z_LIBERADA}`)).status).toBe(404)
  })

  it("sin zona_id: 400", async () => {
    expect((await pedirGET("")).status).toBe(400)
  })
})

describe("POST /api/farming/direcciones", () => {
  it("guarda con el agency_id y el creada_por DE LA SESIÓN, nunca del body", async () => {
    // Manda un agency_id y un creada_por ajenos: si se borra `agency_id: agencyId` en
    // producción y se lo reemplaza por `agency_id: body.agency_id`, esto pasa a fallar.
    const r = await pedirPOST({
      zona_id: Z_MIA, calle: "Peron", tipo: "casa",
      agency_id: "ag-ajena", creada_por: "u-ajeno",
    })
    const d = await r.json()
    expect(r.status).toBe(201)
    expect(base.tablas.farming_direcciones).toHaveLength(1)
    const fila = base.tablas.farming_direcciones[0]
    expect(fila.agency_id).toBe(AGENCIA)
    expect(fila.creada_por).toBe(YO)
    expect(d.direccion.agency_id).toBe(AGENCIA)
    expect(d.direccion.creada_por).toBe(YO)
  })

  it("sin calle: 400 con el texto de validarDireccion, y no escribe nada", async () => {
    const r = await pedirPOST({ zona_id: Z_MIA, tipo: "casa" })
    const d = await r.json()
    expect(r.status).toBe(400)
    expect(d.error).toContain("Falta la calle.")
    expect(base.tablas.farming_direcciones).toHaveLength(0)
  })

  it("en la zona de un colega: 403 y no escribe", async () => {
    const r = await pedirPOST({ zona_id: Z_JUAN, calle: "Peron", tipo: "casa" })
    expect(r.status).toBe(403)
    expect(base.tablas.farming_direcciones).toHaveLength(0)
  })

  it("un aviso (pisos sin unidades_por_piso) NO bloquea: se guarda (201) y viaja en la respuesta", async () => {
    // Este es el test que habría atrapado el bug real: un asesor parado en la vereda que
    // tipeó "pisos: 8" pensando terminar después no puede quedar bloqueado.
    const r = await pedirPOST({ zona_id: Z_MIA, calle: "Peron", tipo: "edificio", pisos: 8 })
    const d = await r.json()
    expect(r.status).toBe(201)
    expect(d.avisos).toEqual(["Pusiste los pisos: falta cuántas unidades hay por piso."])
    expect(base.tablas.farming_direcciones).toHaveLength(1)
  })

  it("sin avisos, la respuesta trae avisos: [] (no se omite el campo)", async () => {
    const r = await pedirPOST({ zona_id: Z_MIA, calle: "Peron", tipo: "casa" })
    const d = await r.json()
    expect(d.avisos).toEqual([])
  })

  it("el origen lo decide el servidor, no el body", async () => {
    // origen:"aviso" en el body pero SIN aviso_id: tiene que quedar "caminata".
    const r1 = await pedirPOST({ zona_id: Z_MIA, calle: "Uno", tipo: "casa", origen: "aviso" })
    expect((await r1.json()).direccion.origen).toBe("caminata")

    // origen:"caminata" en el body pero CON aviso_id: tiene que quedar "aviso".
    const r2 = await pedirPOST({ zona_id: Z_MIA, calle: "Dos", tipo: "casa", origen: "caminata", aviso_id: 555 })
    expect((await r2.json()).direccion.origen).toBe("aviso")
  })

  it("una puerta que ya existe en la zona (misma calle y altura escrita distinto): 409 con el nombre de la puerta", async () => {
    nuevaBase({
      farming_direcciones: [
        { id: "existente", zona_id: Z_MIA, agency_id: AGENCIA, calle: "Av. Ejemplo", altura: "1200", tipo: "casa", etapa: "relevado", orden: 0, creada_por: YO },
      ],
    })
    const r = await pedirPOST({ zona_id: Z_MIA, calle: "av ejemplo", altura: "1200", tipo: "casa" })
    const d = await r.json()
    expect(r.status).toBe(409)
    expect(d.error).toContain("Av. Ejemplo")
    expect(d.error).toContain("1200")
    expect(base.tablas.farming_direcciones).toHaveLength(1)
  })

  it("una puerta sin número (s/n) NUNCA es un duplicado, igual que el índice parcial", async () => {
    nuevaBase({
      farming_direcciones: [
        { id: "existente", zona_id: Z_MIA, agency_id: AGENCIA, calle: "Camino Rural", altura: "s/n", tipo: "lote", etapa: "relevado", orden: 0, creada_por: YO },
      ],
    })
    const r = await pedirPOST({ zona_id: Z_MIA, calle: "Camino Rural", altura: "S/N", tipo: "lote" })
    expect(r.status).toBe(201)
    expect(base.tablas.farming_direcciones).toHaveLength(2)
  })

  it("con aviso_id, marca la marca existente (descartado) como convertido con el direccion_id nuevo", async () => {
    nuevaBase({
      farming_avisos_marca: [
        { zona_id: Z_MIA, aviso_id: 42, aviso_es_dueno_directo: false, user_id: YO, estado: "descartado", direccion_id: null, created_at: "" },
      ],
    })
    const r = await pedirPOST({ zona_id: Z_MIA, calle: "Peron", tipo: "casa", aviso_id: 42, aviso_es_dueno_directo: false })
    const d = await r.json()
    expect(r.status).toBe(201)
    // UPDATE, no un upsert con ignoreDuplicates: si alguien lo cambia por eso, esto muere
    // porque la marca se queda en "descartado" en vez de pasar a "convertido".
    expect(base.tablas.farming_avisos_marca).toHaveLength(1)
    const marca = base.tablas.farming_avisos_marca[0]
    expect(marca.estado).toBe("convertido")
    expect(marca.direccion_id).toBe(d.direccion.id)
  })

  it("con aviso_id y SIN marca previa, la inserta ya como convertido", async () => {
    const r = await pedirPOST({ zona_id: Z_MIA, calle: "Peron", tipo: "casa", aviso_id: 99, aviso_es_dueno_directo: true })
    const d = await r.json()
    expect(r.status).toBe(201)
    expect(base.tablas.farming_avisos_marca).toHaveLength(1)
    const marca = base.tablas.farming_avisos_marca[0]
    expect(marca.estado).toBe("convertido")
    expect(marca.direccion_id).toBe(d.direccion.id)
    expect(marca.aviso_es_dueno_directo).toBe(true)
  })

  it("lat/lng afuera del polígono: se guarda igual y la respuesta avisa fuera_de_zona", async () => {
    const r = await pedirPOST({ zona_id: Z_MIA, calle: "Lejos", tipo: "casa", lat: -34.40, lng: -58.30 })
    const d = await r.json()
    expect(r.status).toBe(201)
    expect(d.fuera_de_zona).toBe(true)
    expect(base.tablas.farming_direcciones[0].fuera_de_zona).toBe(true)
  })

  it("lat/lng adentro del polígono: no avisa fuera_de_zona", async () => {
    const r = await pedirPOST({ zona_id: Z_MIA, calle: "Cerca", tipo: "casa", lat: -34.555, lng: -58.455 })
    const d = await r.json()
    expect(r.status).toBe(201)
    expect(d.fuera_de_zona).toBeUndefined()
  })
})
