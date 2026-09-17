// app/api/farming/direcciones/[id]/mover/route.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { baseFalsa } from "@/lib/farming/base-falsa"

/**
 * Mover una tarjeta y escribir su historial son UNA operación. Las reglas que sostiene este
 * archivo:
 *  1. `direccionAccesible(..., "escribir")` corre ANTES de cualquier escritura: 403 la tarjeta
 *     de la zona de un colega, 404 la que no existe o es de otra agencia, 409 si la zona está
 *     archivada (se mira, no se trabaja).
 *  2. `validarMovimiento` corre antes de tocar la base: si hay errores, 400 y NADA se escribe.
 *  3. `etapa_desde` se guarda ANTES de tocar nada.
 *  4. El UPDATE de farming_direcciones escribe etapa, orden:0, proxima_accion,
 *     proxima_accion_en, updated_at. Nunca unidades_totales, zona_id ni agency_id.
 *  5. El INSERT en farming_contactos toma direccion_id/agency_id/user_id de la SESIÓN y de la
 *     tarjeta ya validada, nunca del body.
 *  6. Si el INSERT falla, la etapa vuelve a etapa_desde y contesta 500 diciéndolo.
 *  7. Mover a la MISMA etapa se permite y también escribe historial.
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

const sesion = { userId: YO, agencyId: AGENCIA, role: "asesor" }
vi.mock("@/lib/auth/tenant-validation", () => ({ requireTenant: vi.fn(async () => ({ ...sesion })) }))
import { requireTenant } from "@/lib/auth/tenant-validation"

let base = baseFalsa({})
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => base }))

const { POST } = await import("./route")

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
  orden: 5,
  proxima_accion: null,
  proxima_accion_en: null,
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
    farming_contactos: [],
    ...extra,
  })
}

beforeEach(() => {
  vi.mocked(requireTenant).mockImplementation(async () => ({ ...sesion }))
  nuevaBase()
})

const movimientoValido = {
  etapa_hasta: "presentado",
  tipo: "carta_1",
  proxima_accion: "Llamar de nuevo",
  proxima_accion_en: "2026-09-20",
  cartas_entregadas: 1,
  nota: "Dejé la carta 1 en el buzón",
}

const mover = (id: string, body: any) =>
  POST(
    new Request(`http://localhost/api/farming/direcciones/${id}/mover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: { id } },
  )

const hoyEnBuenosAires = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })

describe("POST /api/farming/direcciones/[id]/mover", () => {
  it("mueve y escribe la fila del historial con etapa_desde y etapa_hasta correctos", async () => {
    const r = await mover(D_MIA, movimientoValido)
    const d = await r.json()
    expect(r.status).toBe(200)
    expect(d.direccion.etapa).toBe("presentado")
    expect(d.direccion.orden).toBe(0)
    expect(d.contacto.etapa_desde).toBe("relevado")
    expect(d.contacto.etapa_hasta).toBe("presentado")

    const fila = base.tablas.farming_direcciones.find((x: any) => x.id === D_MIA)!
    expect(fila.etapa).toBe("presentado")
    expect(fila.orden).toBe(0)
    expect(fila.proxima_accion).toBe("Llamar de nuevo")
    expect(fila.proxima_accion_en).toBe("2026-09-20")
    // Muere si se saca `updated_at` de la lista blanca: sin este assert, borrar esa línea del
    // update no rompía ningún test.
    expect(fila.updated_at).not.toBe("2026-09-16T10:00:00.000Z")

    expect(base.tablas.farming_contactos).toHaveLength(1)
    const contacto = base.tablas.farming_contactos[0]
    expect(contacto.direccion_id).toBe(D_MIA)
    expect(contacto.etapa_desde).toBe("relevado")
    expect(contacto.etapa_hasta).toBe("presentado")
    expect(contacto.tipo).toBe("carta_1")
    expect(contacto.cartas_entregadas).toBe(1)
    expect(contacto.nota).toBe("Dejé la carta 1 en el buzón")
    expect(contacto.fecha).toBe(hoyEnBuenosAires())
  })

  // Regla del método: sin fecha del próximo paso no hay movimiento. Si se borra el chequeo de
  // `validarMovimiento` (o se lo llama después de escribir), esta prueba muere.
  it("sin fecha del próximo paso: 400, y ni la etapa ni el historial se tocan", async () => {
    const { proxima_accion_en, ...sinFecha } = movimientoValido
    const r = await mover(D_MIA, sinFecha)
    const d = await r.json()
    expect(r.status).toBe(400)
    expect(typeof d.error).toBe("string")
    const fila = base.tablas.farming_direcciones.find((x: any) => x.id === D_MIA)!
    expect(fila.etapa).toBe("relevado")
    expect(base.tablas.farming_contactos).toHaveLength(0)
  })

  // Si se saca `direccionAccesible(..., "escribir")` de adelante, esto pasa a dar 200: la
  // prueba muere apenas se borra ese candado.
  it("la tarjeta de la zona de un colega que no comparte: 403 y no escribe", async () => {
    const r = await mover(D_JUAN, movimientoValido)
    expect(r.status).toBe(403)
    const fila = base.tablas.farming_direcciones.find((x: any) => x.id === D_JUAN)!
    expect(fila.etapa).toBe("relevado")
    expect(base.tablas.farming_contactos).toHaveLength(0)
  })

  it("una tarjeta de otra agencia: 404 y no escribe", async () => {
    const r = await mover(D_AJENA, movimientoValido)
    expect(r.status).toBe(404)
    expect(base.tablas.farming_contactos).toHaveLength(0)
  })

  // «Una zona archivada se mira, no se trabaja»: si se borra la rama de "archivada" en
  // `direccionAccesible`/`zonaAccesible`, esto pasa a dar 200 y la prueba muere.
  it("una zona archivada: 409 y no escribe", async () => {
    const r = await mover(D_ARCHIVADA, movimientoValido)
    const d = await r.json()
    expect(r.status).toBe(409)
    expect(d.error).toMatch(/archivada/i)
    const fila = base.tablas.farming_direcciones.find((x: any) => x.id === D_ARCHIVADA)!
    expect(fila.etapa).toBe("relevado")
    expect(base.tablas.farming_contactos).toHaveLength(0)
  })

  // Si el insert dejara de armarse campo por campo (por ejemplo, `...body` directo), un
  // `user_id`/`agency_id` ajeno en el body quedaría pegado en el historial. Esta prueba muere
  // ante ese cambio.
  it("user_id y agency_id salen de la sesión aunque el body mande otros", async () => {
    const r = await mover(D_MIA, {
      ...movimientoValido,
      user_id: "u-ajeno",
      agency_id: OTRA_AGENCIA,
      direccion_id: "d-ajena",
    })
    expect(r.status).toBe(200)
    const contacto = base.tablas.farming_contactos[0]
    expect(contacto.user_id).toBe(YO)
    expect(contacto.agency_id).toBe(AGENCIA)
    expect(contacto.direccion_id).toBe(D_MIA)
  })

  function sabotearInsertDeHistorial() {
    const fromOriginal = base.from
    base.from = ((tabla: string) => {
      const q: any = fromOriginal(tabla)
      if (tabla === "farming_contactos") {
        const insertOriginal = q.insert
        q.insert = (payload: any) => {
          const encadenado = insertOriginal(payload)
          encadenado.then = (resolve: any) => resolve({ data: null, error: { message: "boom, se cayó el insert" } })
          return encadenado
        }
      }
      return q
    }) as typeof base.from
  }

  // EL MÁS IMPORTANTE: si se borra la línea que revierte la tarjeta cuando el insert falla,
  // esta prueba muere (la tarjeta se queda movida con el historial roto). Revierte los CINCO
  // campos que el update tocó, no solo `etapa`: si la compensación solo devolviera la etapa,
  // la tarjeta quedaría en su columna vieja pero con la próxima acción, la fecha y el orden de
  // un movimiento que nunca quedó anotado.
  it("si el insert del historial falla, la tarjeta vuelve TAL COMO ESTABA (los cinco campos, no solo la etapa)", async () => {
    sabotearInsertDeHistorial()

    const r = await mover(D_MIA, movimientoValido)
    const d = await r.json()
    expect(r.status).toBe(500)
    expect(d.error).toBe("No pudimos anotar el movimiento, así que dejamos la tarjeta donde estaba.")

    const fila = base.tablas.farming_direcciones.find((x: any) => x.id === D_MIA)!
    expect(fila.etapa).toBe("relevado")
    expect(fila.orden).toBe(5) // el orden original del fixture, no el 0 que puso el update
    expect(fila.proxima_accion).toBeNull() // el fixture no tenía próxima acción cargada
    expect(fila.proxima_accion_en).toBeNull()
    expect(fila.updated_at).toBe("2026-09-16T10:00:00.000Z") // el updated_at original, no el del intento fallido
    expect(base.tablas.farming_contactos).toHaveLength(0)
  })

  // La doble falla es la que este endpoint existe para evitar: si también falla el UPDATE que
  // revierte, la tarjeta SÍ quedó movida sin historial, y el mensaje tiene que decir eso —no
  // «la dejamos donde estaba», que sería mentirle al asesor sobre el estado real.
  it("si TAMBIÉN falla la reversión, el mensaje avisa que la tarjeta pudo haber quedado movida", async () => {
    sabotearInsertDeHistorial()

    // El update de avance y el de reversión mandan la MISMA forma de payload (los cinco
    // campos), así que se distinguen por orden de llamada: el primero mueve, el segundo
    // revierte. Solo el segundo se sabotea.
    let llamadasUpdate = 0
    const fromOriginal = base.from
    base.from = ((tabla: string) => {
      const q: any = fromOriginal(tabla)
      if (tabla === "farming_direcciones") {
        const updateOriginal = q.update
        q.update = (payload: any) => {
          llamadasUpdate++
          const encadenado = updateOriginal(payload)
          if (llamadasUpdate === 2) {
            encadenado.then = (resolve: any) =>
              resolve({ data: null, error: { message: "boom, también se cayó la reversión" } })
          }
          return encadenado
        }
      }
      return q
    }) as typeof base.from

    const r = await mover(D_MIA, movimientoValido)
    const d = await r.json()
    expect(r.status).toBe(500)
    expect(d.error).not.toBe("No pudimos anotar el movimiento, así que dejamos la tarjeta donde estaba.")
    expect(d.error).toMatch(/tampoco/i)
  })

  // «Pasé otra carta» sin cambiar de columna: se permite y se anota igual.
  it("mover a la misma etapa escribe historial y no rompe", async () => {
    const r = await mover(D_MIA, { ...movimientoValido, etapa_hasta: "relevado", tipo: "carta_2" })
    const d = await r.json()
    expect(r.status).toBe(200)
    expect(d.direccion.etapa).toBe("relevado")
    expect(d.contacto.etapa_desde).toBe("relevado")
    expect(d.contacto.etapa_hasta).toBe("relevado")
    expect(base.tablas.farming_contactos).toHaveLength(1)
  })

  it("una etapa que no existe: 400, y no escribe", async () => {
    const r = await mover(D_MIA, { ...movimientoValido, etapa_hasta: "ganada" })
    const d = await r.json()
    expect(r.status).toBe(400)
    expect(typeof d.error).toBe("string")
    const fila = base.tablas.farming_direcciones.find((x: any) => x.id === D_MIA)!
    expect(fila.etapa).toBe("relevado")
    expect(base.tablas.farming_contactos).toHaveLength(0)
  })

  // Nunca `unidades_totales` (generada): si el update la mandara, sería un 428C9 en producción.
  // El doble no simula el 428C9, así que esto solo protege contra volver a mandar el body
  // entero al update.
  it("no manda zona_id ni agency_id ajenos aunque el body los incluya en el update", async () => {
    const r = await mover(D_MIA, { ...movimientoValido, zona_id: Z_JUAN, agency_id: OTRA_AGENCIA, unidades_totales: 999 })
    expect(r.status).toBe(200)
    const fila = base.tablas.farming_direcciones.find((x: any) => x.id === D_MIA)!
    expect(fila.zona_id).toBe(Z_MIA)
    expect(fila.agency_id).toBe(AGENCIA)
    expect(fila.unidades_totales).toBeNull()
  })
})

// La prueba de arriba (`contacto.fecha === hoyEnBuenosAires()`) calcula el valor esperado con
// la MISMA fórmula que el código de producción usa: si alguien reemplazara la línea de
// producción por `new Date().toISOString().slice(0, 10)` (el bug de UTC que el brief nombra),
// esa prueba seguiría pasando de 00:00 a 21:00 hora local — solo fallaría de noche. Acá se fija
// un instante conocido, de madrugada UTC / noche en Buenos Aires, para que la diferencia entre
// las dos fórmulas sea inevitable.
describe("POST /api/farming/direcciones/[id]/mover: la fecha es la de Buenos Aires, no la de UTC", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("una visita a las 22:30 de Buenos Aires se anota el día que fue, no el de UTC", async () => {
    // 2026-09-21T01:30:00Z es, en America/Argentina/Buenos_Aires (UTC-3), 2026-09-20 22:30.
    // current_date/toISOString() en UTC daría "2026-09-21": el día siguiente al real.
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-21T01:30:00Z"))

    const r = await mover(D_MIA, movimientoValido)
    const d = await r.json()
    expect(r.status).toBe(200)
    expect(d.contacto.fecha).toBe("2026-09-20")
    expect(base.tablas.farming_contactos[0].fecha).toBe("2026-09-20")
  })
})
