import { describe, it, expect, beforeEach, vi } from "vitest"
import { baseFalsa } from "@/lib/farming/base-falsa"

/**
 * Los avisos publicados dentro de una zona. Las reglas que sostiene este archivo:
 *  1. La zona se valida SIEMPRE: de otro asesor → 403; de otra agencia o liberada → 404.
 *     createAdminClient se saltea la RLS, así que el filtro explícito no es opcional.
 *  2. Lo ya descartado NI lo ya convertido en tarjeta vuelven: los dos estados viajan a la
 *     función como p_excluir, para que la página no quede corta y los conteos no mientan. El
 *     filtro es POR zona (una marca de otra zona no cuenta), no por estado dentro de la
 *     agencia — cualquiera de los dos estados excluye.
 *     (Cambiado el 16-sep-2026, Task 6: antes "convertido" no existía como estado; ahora un
 *     aviso que el asesor ya pasó a Relevamiento no tiene sentido que siga apareciendo en la
 *     lista para "convertir" de nuevo — si volviera, «crear tarjeta» chocaría con un 409 contra
 *     la puerta que él mismo ya cargó. Antes de este cambio, este archivo probaba lo contrario
 *     a propósito: no es una regresión, es que el estado "convertido" recién existe.)
 *  3. Los atajos que se devuelven son solo los que tienen datos.
 *  4. Una señal desconocida es 400, no una consulta sin filtro.
 *  5. La 61ª fila es una sonda para saber si hay más: nunca llega al cliente.
 *  6. Una sesión rota (401) o una función SQL caída (500) no devuelven una lista a medias.
 *  7. Un zona_id o un desde con forma rara no llegan a Postgres ni rompen el endpoint.
 *  8. El offset (`p_offset`) es el `desde` que manda el cliente tal cual (saneado), NUNCA
 *     página×60: la lista de excluidos cambia con cada descarte, así que un offset fijo por
 *     página se corre y saltea avisos (bug real, confirmado en producción).
 *
 * Los ids de zona son UUIDs de mentira (con forma real) porque la columna en producción es
 * `uuid`: un id sin esa forma se corta ANTES de consultar (ver el test de zona_id malformado).
 */

const AGENCIA = "ag-1"
const YO = "u-yo", JUAN = "u-juan"
const cuadrado = { type: "Polygon", coordinates: [[[-58.46, -34.56], [-58.45, -34.56], [-58.45, -34.55], [-58.46, -34.55], [-58.46, -34.56]]] }

const Z_MIA = "10000000-0000-0000-0000-000000000001"
const Z_JUAN = "10000000-0000-0000-0000-000000000002"
const Z_LIBERADA = "10000000-0000-0000-0000-000000000003"
const Z_AJENA = "10000000-0000-0000-0000-000000000004"
const Z_SIN_MARCAS = "10000000-0000-0000-0000-000000000005"

const sesion = { userId: YO, agencyId: AGENCIA, role: "asesor" }
vi.mock("@/lib/auth/tenant-validation", () => ({ requireTenant: vi.fn(async () => ({ ...sesion })) }))
import { requireTenant } from "@/lib/auth/tenant-validation"

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
        { id: Z_MIA, agency_id: AGENCIA, owner_user_id: YO, nombre: "Colegiales", geojson: cuadrado, estado: "activa" },
        { id: Z_JUAN, agency_id: AGENCIA, owner_user_id: JUAN, nombre: "De Juan", geojson: cuadrado, estado: "activa" },
        { id: Z_LIBERADA, agency_id: AGENCIA, owner_user_id: YO, nombre: "Vieja", geojson: cuadrado, estado: "liberada" },
        { id: Z_AJENA, agency_id: "ag-2", owner_user_id: "u-x", nombre: "Otra agencia", geojson: cuadrado, estado: "activa" },
        { id: Z_SIN_MARCAS, agency_id: AGENCIA, owner_user_id: YO, nombre: "Sin marcas", geojson: cuadrado, estado: "activa" },
      ],
      farming_zonas_compartidas: [{ zona_id: Z_JUAN, user_id: YO, agregado_por: JUAN, created_at: "" }],
      farming_avisos_marca: [
        { zona_id: Z_MIA, aviso_id: 7, aviso_es_dueno_directo: false, user_id: YO, estado: "descartado", created_at: "" },
        // Una marca de OTRA zona: si el filtro por zona_id se rompe, se cuela en el excluir de Z_MIA.
        { zona_id: Z_JUAN, aviso_id: 99, aviso_es_dueno_directo: false, user_id: YO, estado: "descartado", created_at: "" },
        // Una marca de la MISMA zona pero YA convertida: TAMBIÉN tiene que excluir (task 6).
        { zona_id: Z_MIA, aviso_id: 55, aviso_es_dueno_directo: false, user_id: YO, estado: "convertido", created_at: "" },
      ],
    },
    {
      farming_avisos_en_zona: (args: any) => { espia.rpc.push({ fn: "farming_avisos_en_zona", args }); return [fila(1), fila(2, { es_dueno_directo: true })] },
      farming_avisos_conteos: (args: any) => { espia.rpc.push({ fn: "farming_avisos_conteos", args }); return [{ total: 170, duenos: 1, caidos: 0, viejos: 30, bajaron: 0 }] },
    },
  )
})

describe("GET /api/farming/avisos", () => {
  it("devuelve los avisos de mi zona con los conteos y solo los atajos con datos", async () => {
    const r = await pedir(`zona_id=${Z_MIA}`)
    const d = await r.json()
    expect(r.status).toBe(200)
    expect(d.zona).toEqual({ id: Z_MIA, nombre: "Colegiales" })
    expect(d.conteos.total).toBe(170)
    expect(d.atajos).toEqual(["duenos", "viejos"])
    expect(d.avisos).toHaveLength(2)
    expect(d.avisos[0].titulo).toBe("Aviso 1")
  })

  it("los descartados Y los convertidos viajan como p_excluir a las DOS funciones", async () => {
    await pedir(`zona_id=${Z_MIA}`)
    expect(espia.rpc).toHaveLength(2)
    for (const llamada of espia.rpc) expect(llamada.args.p_excluir).toEqual([7, 55])
  })

  // Antes (etapa 2) este test probaba que una marca "convertido" NO excluía — porque ese
  // estado no existía todavía. Task 6 (16-sep-2026) lo cambia a propósito: ahora SÍ excluye
  // (ver el comentario de la regla 2, arriba). Lo que se sigue probando sin cambios es que la
  // zona filtra: la marca de Z_JUAN (mismo aviso_id 99 que no aparece acá) no se cuela en Z_MIA.
  it("una marca de otra zona no ensucia el p_excluir; una convertida de MI zona SÍ excluye", async () => {
    await pedir(`zona_id=${Z_MIA}`)
    for (const llamada of espia.rpc) expect(llamada.args.p_excluir).toEqual([7, 55])
  })

  it("una zona sin marcas manda p_excluir: [] a las dos funciones", async () => {
    await pedir(`zona_id=${Z_SIN_MARCAS}`)
    expect(espia.rpc).toHaveLength(2)
    for (const llamada of espia.rpc) expect(llamada.args.p_excluir).toEqual([])
  })

  it("una zona compartida conmigo también se puede ver", async () => {
    expect((await pedir(`zona_id=${Z_JUAN}`)).status).toBe(200)
  })

  it("la zona de otro asesor que NO comparte conmigo: 403", async () => {
    base.tablas.farming_zonas_compartidas = []
    expect((await pedir(`zona_id=${Z_JUAN}`)).status).toBe(403)
  })

  it("una zona de otra agencia: 404", async () => {
    expect((await pedir(`zona_id=${Z_AJENA}`)).status).toBe(404)
  })

  it("una zona liberada: 404", async () => {
    expect((await pedir(`zona_id=${Z_LIBERADA}`)).status).toBe(404)
  })

  it("sin zona_id: 400", async () => {
    expect((await pedir("")).status).toBe(400)
  })

  it("un zona_id sin forma de uuid: 404, y ni se consulta la base (Postgres tiraría un error crudo)", async () => {
    // El doble no valida tipos de columna como Postgres, así que la única forma de probar que
    // el corte pasa ANTES de la consulta es espiar si `farming_zonas` llegó a tocarse.
    let consultoZonas = false
    const fromOriginal = base.from
    base.from = ((tabla: string) => {
      if (tabla === "farming_zonas") consultoZonas = true
      return fromOriginal(tabla)
    }) as typeof base.from

    const r = await pedir("zona_id=abc")
    expect(r.status).toBe(404)
    expect(consultoZonas).toBe(false)
  })

  it("una señal que no existe: 400 y no se consulta nada", async () => {
    const r = await pedir(`zona_id=${Z_MIA}&senal=cualquiera`)
    expect(r.status).toBe(400)
    expect(espia.rpc).toEqual([])
  })

  it("una señal válida viaja tal cual, y desde pasa DIRECTO a p_offset (no ×60)", async () => {
    await pedir(`zona_id=${Z_MIA}&senal=duenos&desde=120`)
    const lista = espia.rpc.find((x) => x.fn === "farming_avisos_en_zona")!
    expect(lista.args.p_senal).toBe("duenos")
    expect(lista.args.p_offset).toBe(120)
    expect(lista.args.p_limit).toBe(61)
  })

  it("con avisos ya excluidos, la tanda siguiente arranca en cuántas tarjetas hay en PANTALLA, no en página×60 (regresión del bug real)", async () => {
    // Bug real confirmado en producción: se trajo la página 0 (60 avisos), se descartaron 2
    // (quedan 58 tarjetas en pantalla) y al pedir "ver más" con el offset VIEJO (pagina×60 =
    // 60) los dos avisos que estaban al tope de la tanda siguiente (57734006 y 57736451) se
    // saltearon para siempre: la lista de excluidos creció en 2, así que todo lo que venía
    // después del offset 60 en la numeración SIN excluir se corrió 2 lugares hacia atrás en
    // la numeración YA excluida que arma el RPC. Mandar `desde=avisos.length` (58, no 60) es
    // lo que evita el salto: si algún día el endpoint vuelve a multiplicar por POR_PAGINA en
    // vez de usar `desde` tal cual, este test lo detecta.
    await pedir(`zona_id=${Z_MIA}&desde=58`)
    const lista = espia.rpc.find((x) => x.fn === "farming_avisos_en_zona")!
    expect(lista.args.p_offset).toBe(58)
  })

  it("hay_mas es true solo si vino una fila de más", async () => {
    const d = await (await pedir(`zona_id=${Z_MIA}`)).json()
    expect(d.hay_mas).toBe(false)
    expect(d.pagina).toBe(0)
  })

  it("hay_mas es true y la lista se corta en 60 cuando llegan 61 filas (la 61ª es la sonda)", async () => {
    const filas61 = Array.from({ length: 61 }, (_, i) => fila(i + 1))
    base = baseFalsa(
      {
        farming_zonas: base.tablas.farming_zonas,
        farming_zonas_compartidas: base.tablas.farming_zonas_compartidas,
        farming_avisos_marca: base.tablas.farming_avisos_marca,
      },
      {
        farming_avisos_en_zona: (args: any) => { espia.rpc.push({ fn: "farming_avisos_en_zona", args }); return filas61 },
        farming_avisos_conteos: (args: any) => { espia.rpc.push({ fn: "farming_avisos_conteos", args }); return [{ total: 170, duenos: 1, caidos: 0, viejos: 30, bajaron: 0 }] },
      },
    )
    const d = await (await pedir(`zona_id=${Z_MIA}`)).json()
    expect(d.hay_mas).toBe(true)
    expect(d.avisos).toHaveLength(60)
  })

  it("si una función SQL devuelve error, la respuesta es 500 y no hay avisos a medias", async () => {
    // No se registra farming_avisos_conteos: el doble responde { error: "rpc desconocida" }.
    base = baseFalsa(
      {
        farming_zonas: base.tablas.farming_zonas,
        farming_zonas_compartidas: base.tablas.farming_zonas_compartidas,
        farming_avisos_marca: base.tablas.farming_avisos_marca,
      },
      {
        farming_avisos_en_zona: (args: any) => { espia.rpc.push({ fn: "farming_avisos_en_zona", args }); return [fila(1)] },
      },
    )
    const r = await pedir(`zona_id=${Z_MIA}`)
    const d = await r.json()
    expect(r.status).toBe(500)
    expect(d.avisos).toBeUndefined()
  })

  it("si requireTenant revienta con Unauthorized: 401, no 500", async () => {
    vi.mocked(requireTenant).mockRejectedValueOnce(new Error("Unauthorized"))
    const r = await pedir(`zona_id=${Z_MIA}`)
    expect(r.status).toBe(401)
  })

  it("un desde con forma rara (Infinity o no entero) se toma como 0, no rompe ni miente", async () => {
    const d1 = await (await pedir(`zona_id=${Z_MIA}&desde=1e400`)).json()
    expect(d1.pagina).toBe(0)
    expect(espia.rpc.find((x) => x.fn === "farming_avisos_en_zona")!.args.p_offset).toBe(0)

    espia.rpc = []
    const d2 = await (await pedir(`zona_id=${Z_MIA}&desde=0.01`)).json()
    expect(d2.pagina).toBe(0)
    expect(espia.rpc.find((x) => x.fn === "farming_avisos_en_zona")!.args.p_offset).toBe(0)
  })
})
