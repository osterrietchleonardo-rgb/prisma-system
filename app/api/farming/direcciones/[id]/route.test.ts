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
 *     `fuera_de_zona` y `fuera_de_zona_desde` NUNCA se tocan desde acá. Tampoco `etapa` (desde la
 *     revisión final de la 3-B): cambiar de columna es trabajo de `/mover`, el único que firma
 *     el movimiento con su historial — un PATCH que la manda simplemente la ignora.
 *  3. `updated_at` lo pisa el servidor siempre.
 *  4. `DELETE` borra de verdad.
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
const Z_ARCHIVADA = "10000000-0000-0000-0000-000000000005"

const D_MIA = "20000000-0000-0000-0000-000000000001"
const D_JUAN = "20000000-0000-0000-0000-000000000002"
const D_AJENA = "20000000-0000-0000-0000-000000000003"
const D_ARCHIVADA = "20000000-0000-0000-0000-000000000004"
const D_VECINA = "20000000-0000-0000-0000-000000000005"

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
  { id: Z_ARCHIVADA, agency_id: AGENCIA, owner_user_id: YO, nombre: "Vieja", geojson: cuadrado, estado: "archivada" },
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
      direccionFixture(D_ARCHIVADA, Z_ARCHIVADA, AGENCIA),
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

  // Revisión final de la 3-B (FIX 2): cambiar de columna es trabajo de /mover, y solo de
  // /mover — es el único endpoint que firma el movimiento con su fila de historial. Si este
  // PATCH todavía moviera `etapa`, esta prueba muere: una tarjeta podría saltar de columna sin
  // dejar ningún rastro de qué se hizo, cuál es el próximo paso ni para cuándo.
  it("un PATCH con etapa (válida o no) NO la cambia: se ignora como cualquier campo fuera de la lista blanca", async () => {
    const r = await patch(D_MIA, { etapa: "presentado", encargado_nombre: "Doña Rosa" })
    const d = await r.json()
    expect(r.status).toBe(200)
    // Ni siquiera avisa que la ignoró: es una clave más, como zona_id o id.
    expect(d.direccion.etapa).toBe("relevado")
    const fila = base.tablas.farming_direcciones.find((x: any) => x.id === D_MIA)!
    expect(fila.etapa).toBe("relevado")
    // El resto del PATCH sí se aplica: ignorar `etapa` no tira abajo el resto del body.
    expect(fila.encargado_nombre).toBe("Doña Rosa")
  })

  // Una etapa que ni siquiera existe entre las siete tampoco revienta: se ignora igual, sin
  // 400 — ya no hay ningún chequeo de `etapa` en este endpoint, para bien o para mal.
  it("un PATCH con una etapa que no existe entre las siete: no da 400, se ignora igual", async () => {
    const r = await patch(D_MIA, { etapa: "ganada" })
    const d = await r.json()
    expect(r.status).toBe(200)
    expect(d.direccion.etapa).toBe("relevado")
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

/**
 * CORREGIR UNA TARJETA TAMBIÉN PUEDE CREAR UN DUPLICADO. `calle` y `altura` se editan, así que
 * el mismo choque que el alta frena desde el primer día llega también por acá — y llegaba sin
 * chequeo previo ni traducción del 23505: el asesor veía el texto crudo del índice único, en
 * inglés, adentro del diálogo, mientras estaba ARREGLANDO algo.
 */
describe("PATCH: la misma puerta dos veces en la misma zona", () => {
  beforeEach(() => {
    nuevaBase({
      farming_direcciones: [
        direccionFixture(D_MIA, Z_MIA, AGENCIA, { calle: "Peron", altura: "100" }),
        direccionFixture(D_VECINA, Z_MIA, AGENCIA, { calle: "Av. Ejemplo", altura: "1200" }),
      ],
    })
  })

  it("editar la altura hasta pisar a la vecina: 409 en criollo, con el nombre de la puerta, y no escribe", async () => {
    const r = await patch(D_MIA, { calle: "av ejemplo", altura: "1200" })
    const d = await r.json()
    expect(r.status).toBe(409)
    expect(d.error).toContain("Av. Ejemplo")
    expect(d.error).toContain("1200")
    expect(d.error).not.toMatch(/duplicate key|constraint/i)
    const fila = base.tablas.farming_direcciones.find((x: any) => x.id === D_MIA)!
    expect(fila.calle).toBe("Peron")
  })

  it("una tarjeta NO es su propio duplicado: guardar la misma calle y altura que ya tiene es 200", async () => {
    const r = await patch(D_MIA, { calle: "Peron", altura: "100", observaciones: "toco otra cosa" })
    expect(r.status).toBe(200)
  })

  it("sin altura comparable (s/n) no hay choque posible, igual que el índice parcial", async () => {
    base.tablas.farming_direcciones.find((x: any) => x.id === D_VECINA)!.altura = "s/n"
    const r = await patch(D_MIA, { calle: "Av. Ejemplo", altura: "S/N" })
    expect(r.status).toBe(200)
  })

  it("la MISMA puerta en OTRA zona no choca: el índice es por zona", async () => {
    base.tablas.farming_direcciones.find((x: any) => x.id === D_VECINA)!.zona_id = Z_JUAN
    const r = await patch(D_MIA, { calle: "Av. Ejemplo", altura: "1200" })
    expect(r.status).toBe(200)
  })

  it("un PATCH que no toca ni calle ni altura no gasta la consulta de duplicados", async () => {
    const tocadas: string[] = []
    const fromOriginal = base.from
    base.from = ((tabla: string) => { tocadas.push(tabla); return fromOriginal(tabla) }) as typeof base.from
    const r = await patch(D_MIA, { encargado_nombre: "Doña Rosa" })
    expect(r.status).toBe(200)
    // farming_direcciones: una vez el candado, una vez el update. Ni una tercera para duplicados.
    expect(tocadas.filter((t) => t === "farming_direcciones")).toHaveLength(2)
  })

  // Mismo caso que el POST: dos ediciones concurrentes pueden pasar las dos el chequeo en JS, y
  // el candado de verdad es el índice de Postgres. Ese 23505 tampoco puede salir en inglés.
  it("un 23505 real de Postgres en el UPDATE también da 409, no un 500 con el texto crudo", async () => {
    const fromOriginal = base.from
    base.from = ((tabla: string) => {
      const q: any = fromOriginal(tabla)
      if (tabla === "farming_direcciones") {
        const updateReal = q.update
        q.update = (payload: any) => {
          const encadenado = updateReal(payload) // es el mismo `q`, con op="update" ya seteado
          encadenado.then = (resolve: any) =>
            resolve({ data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } })
          return encadenado
        }
      }
      return q
    }) as typeof base.from

    const r = await patch(D_MIA, { calle: "Otra", altura: "9" })
    const d = await r.json()
    expect(r.status).toBe(409)
    expect(d.error).toContain("ya está cargada")
    expect(d.error).not.toMatch(/duplicate key|constraint/i)
  })
})

/**
 * LA FORMA DEL BODY, no solo el valor. El alta ya casteaba `calle`/`altura` con String() y
 * exigía `Number.isFinite` en lat/lng; el PATCH no hacía ni una cosa ni la otra, así que
 * `calle: 1200`, `lat: "abc"` y `orden: "x"` llegaban crudos a Postgres y volvían como un 500
 * en inglés. Las dos puertas de la tarjeta tienen que tratar el body igual.
 */
describe("PATCH: la forma de los campos", () => {
  it("calle numérica (1200 sin comillas) no revienta: se guarda como string, igual que en el alta", async () => {
    const r = await patch(D_MIA, { calle: 1200 })
    const d = await r.json()
    expect(r.status).toBe(200)
    expect(d.direccion.calle).toBe("1200")
  })

  it("una altura numérica también se guarda como string", async () => {
    const r = await patch(D_MIA, { altura: 1200 })
    expect((await r.json()).direccion.altura).toBe("1200")
  })

  it("lat que no es un número: 400, y no escribe", async () => {
    const r = await patch(D_MIA, { lat: "abc" })
    expect(r.status).toBe(400)
    expect(base.tablas.farming_direcciones.find((x: any) => x.id === D_MIA)!.lat).toBeNull()
  })

  it("orden que no es un número: 400, y no escribe", async () => {
    const r = await patch(D_MIA, { orden: "x" })
    expect(r.status).toBe(400)
    expect(base.tablas.farming_direcciones.find((x: any) => x.id === D_MIA)!.orden).toBe(0)
  })

  it("un precio que no es un número: 400", async () => {
    expect((await patch(D_MIA, { precio_pedido: "mucha plata" })).status).toBe(400)
  })

  it("lat y lng de verdad sí se guardan", async () => {
    const r = await patch(D_MIA, { lat: -34.555, lng: -58.455 })
    expect(r.status).toBe(200)
    expect((await r.json()).direccion.lat).toBe(-34.555)
  })
})

// Trampa 2 de la 3-A: `calle` y `tipo` son `not null` en la base. Mandarlas explícitamente en
// `null` (no simplemente omitirlas, que es un PATCH parcial legítimo) hoy revienta como un 500
// crudo de Postgres. `valoresImposibles` no las mira (un PATCH sin calle es válido: se está
// corrigiendo otro campo), así que el candado tiene que estar ACÁ, antes de tocar la base, y
// reusar el mismo mensaje que ya usa el alta (`validarDireccion`) — no inventar uno nuevo.
describe("PATCH: calle o tipo null explícitos", () => {
  it("calle: null explícito: 400 con «Falta la calle.», no un 500 crudo, y no escribe", async () => {
    const r = await patch(D_MIA, { calle: null })
    const d = await r.json()
    expect(r.status).toBe(400)
    expect(d.error).toContain("Falta la calle.")
    expect(base.tablas.farming_direcciones.find((x: any) => x.id === D_MIA)!.calle).toBe("Peron")
  })

  it("tipo: null explícito: 400 con «Elegí qué tipo de propiedad es.», y no escribe", async () => {
    const r = await patch(D_MIA, { tipo: null })
    const d = await r.json()
    expect(r.status).toBe(400)
    expect(d.error).toContain("Elegí qué tipo de propiedad es.")
    expect(base.tablas.farming_direcciones.find((x: any) => x.id === D_MIA)!.tipo).toBe("casa")
  })

  // Omitir el campo (no mandarlo) sigue siendo un PATCH parcial legítimo: el candado es para el
  // `null` EXPLÍCITO, no para "no vino". Sin esta prueba, alguien podría "arreglar" el punto de
  // arriba prohibiendo cualquier ausencia de calle/tipo, lo que rompería la edición parcial que
  // ya prueba "un PATCH parcial sin calle ni tipo se guarda igual" más arriba.
  it("calle: '' (string vacío explícito) no dispara este candado — es otro caso, no lo tapa", async () => {
    const r = await patch(D_MIA, { calle: "" })
    expect(r.status).toBe(200)
  })
})

// Trampa 1 y 3 de la 3-A: cuando el PATCH corrige `lat` o `lng`, el cartel "fuera de zona" tiene
// que recalcularse con el MISMO criterio que el alta (`calculaFueraDeZona`, en servidor.ts).
// `fuera_de_zona_desde` CON FECHA = la tarjeta estaba adentro y el asesor la corrigió (o
// redibujó el trazo) hasta dejarla afuera. En NULL = nació afuera. Esa diferencia es la que
// separa «se te cayó afuera» de «la cargaste afuera», y estos tests mueren si se la invierte.
describe("PATCH: recalcular fuera_de_zona al corregir la ubicación", () => {
  it("una tarjeta que estaba ADENTRO y se corrige hacia AFUERA: fuera_de_zona=true y se estampa fuera_de_zona_desde", async () => {
    nuevaBase({
      farming_direcciones: [
        direccionFixture(D_MIA, Z_MIA, AGENCIA, {
          lat: -34.555,
          lng: -58.455, // adentro del cuadrado
          fuera_de_zona: false,
          fuera_de_zona_desde: null,
        }),
      ],
    })
    const r = await patch(D_MIA, { lat: -34.4, lng: -58.3 }) // afuera del cuadrado
    const d = await r.json()
    expect(r.status).toBe(200)
    expect(d.direccion.fuera_de_zona).toBe(true)
    expect(d.direccion.fuera_de_zona_desde).not.toBeNull()
    const fila = base.tablas.farming_direcciones.find((x: any) => x.id === D_MIA)!
    expect(fila.fuera_de_zona).toBe(true)
    expect(fila.fuera_de_zona_desde).not.toBeNull()
  })

  it("una tarjeta que estaba AFUERA y se corrige hacia ADENTRO: fuera_de_zona=false y fuera_de_zona_desde se limpia a null", async () => {
    nuevaBase({
      farming_direcciones: [
        direccionFixture(D_MIA, Z_MIA, AGENCIA, {
          lat: -34.4,
          lng: -58.3, // afuera del cuadrado
          fuera_de_zona: true,
          fuera_de_zona_desde: "2020-01-01T00:00:00.000Z",
        }),
      ],
    })
    const r = await patch(D_MIA, { lat: -34.555, lng: -58.455 }) // adentro del cuadrado
    const d = await r.json()
    expect(r.status).toBe(200)
    expect(d.direccion.fuera_de_zona).toBe(false)
    expect(d.direccion.fuera_de_zona_desde).toBeNull()
    const fila = base.tablas.farming_direcciones.find((x: any) => x.id === D_MIA)!
    expect(fila.fuera_de_zona).toBe(false)
    expect(fila.fuera_de_zona_desde).toBeNull()
  })

  it("una tarjeta que YA estaba afuera y sigue afuera: no pisa la fecha vieja de fuera_de_zona_desde con la de hoy", async () => {
    nuevaBase({
      farming_direcciones: [
        direccionFixture(D_MIA, Z_MIA, AGENCIA, {
          lat: -34.4,
          lng: -58.3, // afuera del cuadrado
          fuera_de_zona: true,
          fuera_de_zona_desde: "2020-01-01T00:00:00.000Z",
        }),
      ],
    })
    // Otro punto, TAMBIÉN afuera del cuadrado: sigue afuera, no "vuelve a caerse".
    const r = await patch(D_MIA, { lat: -34.41, lng: -58.31 })
    const d = await r.json()
    expect(r.status).toBe(200)
    expect(d.direccion.fuera_de_zona).toBe(true)
    expect(d.direccion.fuera_de_zona_desde).toBe("2020-01-01T00:00:00.000Z")
  })

  // El fixture es INCONSISTENTE a propósito: las coordenadas guardadas caen AFUERA, pero la
  // fila dice `fuera_de_zona: false`. Así, si alguien borrara el `if (tocaUbicacion)` y el
  // bloque corriera siempre, el recálculo daría `true` y esta prueba moriría. Con un fixture
  // coherente, la prueba pasaría igual recalculando o no, y no probaría nada.
  it("un PATCH que no toca lat ni lng no recalcula fuera_de_zona ni fuera_de_zona_desde", async () => {
    nuevaBase({
      farming_direcciones: [
        direccionFixture(D_MIA, Z_MIA, AGENCIA, {
          lat: -34.4,
          lng: -58.3, // afuera del cuadrado...
          fuera_de_zona: false, // ...pero la fila dice que no. Nadie tiene que "corregirlo" acá.
          fuera_de_zona_desde: null,
        }),
      ],
    })
    const r = await patch(D_MIA, { encargado_nombre: "Doña Rosa" })
    const d = await r.json()
    expect(r.status).toBe(200)
    expect(d.direccion.fuera_de_zona).toBe(false)
    expect(d.direccion.fuera_de_zona_desde).toBeNull()
  })

  // LA PANTALLA MANDA ESTO DE VERDAD: `direccion-dialog.tsx` borra `lat`/`lng` cuando el asesor
  // reescribe la calle después de haber elegido una sugerencia. No es un cliente roto ni un
  // ataque: es el camino normal. Sin punto no hay adentro ni afuera, así que no va cartel — y
  // la historia de "se cayó afuera" se limpia con él, porque ya no hay ninguna posición que
  // contar.
  it("un PATCH con lat y lng en null (la pantalla borró el punto): sin cartel y sin fecha colgada", async () => {
    nuevaBase({
      farming_direcciones: [
        direccionFixture(D_MIA, Z_MIA, AGENCIA, {
          lat: -34.4,
          lng: -58.3, // afuera del cuadrado
          fuera_de_zona: true,
          fuera_de_zona_desde: "2020-01-01T00:00:00.000Z",
        }),
      ],
    })
    const r = await patch(D_MIA, { lat: null, lng: null })
    const d = await r.json()
    expect(r.status).toBe(200)
    expect(d.direccion.fuera_de_zona).toBe(false)
    expect(d.direccion.fuera_de_zona_desde).toBeNull()
  })

  // EL CASO QUE BORRABA HISTORIAL EN SILENCIO: si la zona no se puede leer, la cuenta no se
  // puede hacer. Antes se guardaba `fuera_de_zona: false` igual —un "adentro" que nadie
  // calculó— y de paso se borraba la fecha de cuándo se había caído. Ahora no se toca nada:
  // un dato viejo y verdadero es mejor que uno nuevo e inventado.
  it("si no se puede leer el geojson de la zona: no se toca ni el cartel ni la fecha", async () => {
    nuevaBase({
      farming_direcciones: [
        direccionFixture(D_MIA, Z_MIA, AGENCIA, {
          lat: -34.4,
          lng: -58.3, // afuera del cuadrado
          fuera_de_zona: true,
          fuera_de_zona_desde: "2020-01-01T00:00:00.000Z",
        }),
      ],
      // La misma zona de siempre, pero SIN geojson: no hay contra qué comparar el punto.
      farming_zonas: zonasFixture().map((z: any) => (z.id === Z_MIA ? { ...z, geojson: null } : z)),
    })
    // Un punto que cae ADENTRO del cuadrado: si el código igual "calculara", diría false.
    const r = await patch(D_MIA, { lat: -34.555, lng: -58.455 })
    const d = await r.json()
    expect(r.status).toBe(200)
    expect(d.direccion.fuera_de_zona).toBe(true)
    expect(d.direccion.fuera_de_zona_desde).toBe("2020-01-01T00:00:00.000Z")
  })
})

// La otra mitad de «se mira, no se trabaja»: la tarjeta de una zona archivada se lista (ver el
// GET de /api/farming/direcciones) pero no se cambia ni se borra desde ningún lado.
describe("una tarjeta de zona archivada no se escribe", () => {
  it("PATCH: se rechaza y no escribe", async () => {
    const r = await patch(D_ARCHIVADA, { encargado_nombre: "Doña Rosa" })
    const d = await r.json()
    expect(r.status).toBe(409)
    expect(d.error).toMatch(/archivada/i)
    expect(base.tablas.farming_direcciones.find((x: any) => x.id === D_ARCHIVADA)!.encargado_nombre).toBeNull()
  })

  it("DELETE: se rechaza y no borra", async () => {
    const r = await borrar(D_ARCHIVADA)
    expect(r.status).toBe(409)
    expect(base.tablas.farming_direcciones.find((x: any) => x.id === D_ARCHIVADA)).toBeDefined()
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

  // El ORDEN es la regla, no un detalle: no hay transacción, así que los dos borrados pueden
  // partirse al medio. Al revés —tarjeta primero— si el segundo fallara, la tarjeta ya no
  // existe, el reintento del asesor da 404, y la marca se queda en "convertido" apuntando a la
  // nada: el aviso desaparece de «A la venta en mi zona» PARA SIEMPRE. En este orden la misma
  // falla deja el aviso visible otra vez, con su tarjeta todavía en el tablero, y se arregla
  // sola al volver a tocar «borrar». Sin esta prueba, un refactor que reordene las dos líneas
  // no rompe nada visible y el agujero vuelve.
  it("borra la marca ANTES que la tarjeta: una falla en el medio deja el aviso visible, no escondido para siempre", async () => {
    nuevaBase({
      farming_direcciones: [direccionFixture(D_MIA, Z_MIA, AGENCIA, { aviso_id: 42, origen: "aviso" })],
      farming_avisos_marca: [
        { zona_id: Z_MIA, aviso_id: 42, aviso_es_dueno_directo: false, user_id: YO, estado: "convertido", direccion_id: D_MIA, created_at: "" },
      ],
    })

    const borrados: string[] = []
    const fromOriginal = base.from
    base.from = ((tabla: string) => {
      const q: any = fromOriginal(tabla)
      const deleteOriginal = q.delete
      q.delete = (...args: any[]) => {
        borrados.push(tabla)
        return deleteOriginal.apply(q, args)
      }
      return q
    }) as typeof base.from

    const r = await borrar(D_MIA)
    expect(r.status).toBe(200)
    expect(borrados).toEqual(["farming_avisos_marca", "farming_direcciones"])
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
