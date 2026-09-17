// app/api/farming/direcciones/[id]/propietarios/[pid]/tracking/route.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { baseFalsa } from "@/lib/farming/base-falsa"

/**
 * El botón que pasa un propietario al pipeline de Tracking. Las reglas que sostiene este
 * archivo:
 *  1. `direccionAccesible(..., "escribir")` corre ANTES de todo: 403 la tarjeta de un colega,
 *     404 la que no existe o es de otra agencia, 409 si la zona está archivada.
 *  2. El `pid` tiene que ser de ESA dirección: uno de otra da 404, igual que el resto de la
 *     familia de endpoints de propietarios.
 *  3. Si `tracking_log_id` ya está cargado, NO se llama a `savePerformanceLog` de nuevo: 409
 *     con el id que ya tiene. Nunca se infla el pipeline por un doble toque.
 *  4. `proceso` tiene que ser EXACTAMENTE "vendedor" o "locador": cualquier otra cosa es 400 y
 *     no se llama a `savePerformanceLog`. El servidor no elige un default por el asesor.
 *  5. `savePerformanceLog` se llama con `type: "prospeccion"`, el `proceso` del body y una
 *     `propiedad_ref` armada con la calle, la altura y el nombre de la zona.
 *  6. El id que devuelve se guarda en `farming_propietarios.tracking_log_id`. Si ESE guardado
 *     falla, la actividad YA EXISTE: 200 con un `aviso`, nunca un error que invite a apretar
 *     de nuevo y duplicar la actividad.
 *  7. Y si el asesor aprieta igual (recargó, cambió de pestaña), el servidor ENCUENTRA esa
 *     actividad colgada por el id de la persona que viaja en `metadata`: 409, repara el
 *     enlace y no crea una segunda.
 *  8. El enlace se escribe con condición («solo si sigue vacío»). Si dos apretones corren a la
 *     par, el que pierde BORRA su propia actividad; y si ni eso puede, lo dice con otras
 *     palabras en vez de mentirle al asesor.
 *  9. La fecha de la actividad es la de Buenos Aires, no la del servidor.
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
const Z_ARCHIVADA = "10000000-0000-0000-0000-000000000003"

const D_MIA = "20000000-0000-0000-0000-000000000001"
const D_MIA_2 = "20000000-0000-0000-0000-000000000002"
const D_JUAN = "20000000-0000-0000-0000-000000000003"
const D_AJENA = "20000000-0000-0000-0000-000000000004"
const D_ARCHIVADA = "20000000-0000-0000-0000-000000000005"

const P_DE_MIA = "30000000-0000-0000-0000-000000000001"
const P_DE_MIA_2 = "30000000-0000-0000-0000-000000000002"
const P_DE_JUAN = "30000000-0000-0000-0000-000000000003"
const P_YA_ENLAZADO = "30000000-0000-0000-0000-000000000004"
const P_ARCHIVADA = "30000000-0000-0000-0000-000000000005"

const sesion = { userId: YO, agencyId: AGENCIA, role: "asesor" }
vi.mock("@/lib/auth/tenant-validation", () => ({ requireTenant: vi.fn(async () => ({ ...sesion })) }))
import { requireTenant } from "@/lib/auth/tenant-validation"

let base = baseFalsa({})
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => base }))

// `savePerformanceLog` es un Server Action de Tracking, ajeno a Farming: se lo reemplaza
// entero. El doble por default resuelve con un id fijo; cada test que necesite otra cosa lo
// reprograma con `mockImplementation`/`mockRejectedValueOnce`.
const savePerformanceLogMock = vi.fn(async (_payload: any) => ({ id: "log-nuevo" }))
vi.mock("@/actions/tracking/savePerformanceLog", () => ({
  savePerformanceLog: (payload: any) => savePerformanceLogMock(payload),
}))

const { POST } = await import("./route")

const zonasFixture = () => [
  { id: Z_MIA, agency_id: AGENCIA, owner_user_id: YO, nombre: "Palermo", geojson: cuadrado, estado: "activa" },
  { id: Z_JUAN, agency_id: AGENCIA, owner_user_id: JUAN, nombre: "De Juan", geojson: cuadrado, estado: "activa" },
  { id: Z_ARCHIVADA, agency_id: AGENCIA, owner_user_id: YO, nombre: "Vieja", geojson: cuadrado, estado: "archivada" },
]

const direccionFixture = (id: string, zonaId: string, agencyId: string, extra: any = {}) => ({
  id,
  zona_id: zonaId,
  agency_id: agencyId,
  creada_por: YO,
  calle: "Av. Ejemplo",
  altura: "1200",
  tipo: "casa",
  etapa: "relevado",
  orden: 0,
  created_at: "2026-09-16T10:00:00.000Z",
  updated_at: "2026-09-16T10:00:00.000Z",
  ...extra,
})

const propietarioFixture = (id: string, direccionId: string, agencyId: string, extra: any = {}) => ({
  id,
  direccion_id: direccionId,
  agency_id: agencyId,
  piso: null,
  unidad: null,
  nombre: "Marta Gómez",
  vinculo: "propietario",
  telefono: "5491123456789",
  email: null,
  notas: null,
  tracking_log_id: null,
  creado_por: YO,
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
      direccionFixture(D_MIA_2, Z_MIA, AGENCIA),
      direccionFixture(D_JUAN, Z_JUAN, AGENCIA),
      direccionFixture(D_AJENA, Z_MIA, OTRA_AGENCIA),
      direccionFixture(D_ARCHIVADA, Z_ARCHIVADA, AGENCIA),
    ],
    farming_propietarios: [
      propietarioFixture(P_DE_MIA, D_MIA, AGENCIA),
      propietarioFixture(P_DE_MIA_2, D_MIA_2, AGENCIA),
      propietarioFixture(P_DE_JUAN, D_JUAN, AGENCIA),
      propietarioFixture(P_YA_ENLAZADO, D_MIA, AGENCIA, { tracking_log_id: "log-viejo" }),
      propietarioFixture(P_ARCHIVADA, D_ARCHIVADA, AGENCIA),
    ],
    ...extra,
  })
}

beforeEach(() => {
  vi.mocked(requireTenant).mockImplementation(async () => ({ ...sesion }))
  savePerformanceLogMock.mockReset()
  savePerformanceLogMock.mockImplementation(async (_payload: any) => ({ id: "log-nuevo" }))
  nuevaBase()
})

const pasar = (id: string, pid: string, body: any) =>
  POST(
    new Request(`http://localhost/api/farming/direcciones/${id}/propietarios/${pid}/tracking`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: { id, pid } },
  )

describe("POST /api/farming/direcciones/[id]/propietarios/[pid]/tracking", () => {
  it("pasa a la persona al pipeline: llama a savePerformanceLog y guarda el id devuelto", async () => {
    const r = await pasar(D_MIA, P_DE_MIA, { proceso: "vendedor" })
    const d = await r.json()
    expect(r.status).toBe(200)
    expect(d.tracking_log_id).toBe("log-nuevo")

    expect(savePerformanceLogMock).toHaveBeenCalledTimes(1)
    const payload = savePerformanceLogMock.mock.calls[0][0]
    expect(payload.type).toBe("prospeccion")
    expect(payload.proceso).toBe("vendedor")
    expect(payload.propiedad_ref).toBe("Av. Ejemplo 1200 · zona «Palermo»")

    const fila = base.tablas.farming_propietarios.find((p: any) => p.id === P_DE_MIA)!
    expect(fila.tracking_log_id).toBe("log-nuevo")
  })

  it("admite proceso locador", async () => {
    const r = await pasar(D_MIA, P_DE_MIA, { proceso: "locador" })
    expect(r.status).toBe(200)
    expect(savePerformanceLogMock.mock.calls[0][0].proceso).toBe("locador")
  })

  // Regla del método: nadie elige por el asesor. Si se agregara un default (por ejemplo,
  // "vendedor" cuando el body no manda nada), esta prueba muere.
  it("un proceso que no es vendedor ni locador: 400 y no llama a savePerformanceLog", async () => {
    const r = await pasar(D_MIA, P_DE_MIA, { proceso: "comprador" })
    const d = await r.json()
    expect(r.status).toBe(400)
    expect(typeof d.error).toBe("string")
    expect(savePerformanceLogMock).not.toHaveBeenCalled()
    const fila = base.tablas.farming_propietarios.find((p: any) => p.id === P_DE_MIA)!
    expect(fila.tracking_log_id).toBeNull()
  })

  it("sin proceso en el body: 400 y no llama a savePerformanceLog", async () => {
    const r = await pasar(D_MIA, P_DE_MIA, {})
    expect(r.status).toBe(400)
    expect(savePerformanceLogMock).not.toHaveBeenCalled()
  })

  // EL CANDADO CONTRA EL DOBLE TOQUE: si se borrara este chequeo, el segundo apretón del mismo
  // botón crearía una segunda actividad en el pipeline del equipo. Esta prueba muere ante eso.
  it("si tracking_log_id ya está cargado: 409 con el id que ya tiene, y no llama a savePerformanceLog", async () => {
    const r = await pasar(D_MIA, P_YA_ENLAZADO, { proceso: "vendedor" })
    const d = await r.json()
    expect(r.status).toBe(409)
    expect(d.tracking_log_id).toBe("log-viejo")
    expect(savePerformanceLogMock).not.toHaveBeenCalled()
  })

  it("la tarjeta de la zona de un colega que no comparte: 403 y no llama a savePerformanceLog", async () => {
    const r = await pasar(D_JUAN, P_DE_JUAN, { proceso: "vendedor" })
    expect(r.status).toBe(403)
    expect(savePerformanceLogMock).not.toHaveBeenCalled()
  })

  it("una tarjeta de otra agencia: 404 y no llama a savePerformanceLog", async () => {
    const r = await pasar(D_AJENA, "30000000-0000-0000-0000-000000000099", { proceso: "vendedor" })
    expect(r.status).toBe(404)
    expect(savePerformanceLogMock).not.toHaveBeenCalled()
  })

  // «Una zona archivada se mira, no se trabaja»: pasar a alguien al pipeline ES una escritura.
  it("una zona archivada: 409 y no llama a savePerformanceLog", async () => {
    const r = await pasar(D_ARCHIVADA, P_ARCHIVADA, { proceso: "vendedor" })
    const d = await r.json()
    expect(r.status).toBe(409)
    expect(d.error).toMatch(/archivada/i)
    expect(savePerformanceLogMock).not.toHaveBeenCalled()
  })

  it("un propietario de OTRA dirección: 404 aunque tenga acceso a las dos direcciones", async () => {
    const r = await pasar(D_MIA, P_DE_MIA_2, { proceso: "vendedor" })
    expect(r.status).toBe(404)
    expect(savePerformanceLogMock).not.toHaveBeenCalled()
  })

  it("un propietario que no existe: 404", async () => {
    const r = await pasar(D_MIA, "30000000-0000-0000-0000-000000000099", { proceso: "vendedor" })
    expect(r.status).toBe(404)
    expect(savePerformanceLogMock).not.toHaveBeenCalled()
  })

  // LA AMBIGÜEDAD RESUELTA: si el INSERT de savePerformanceLog ya pasó pero el UPDATE que
  // enlaza el id a farming_propietarios falla, la actividad YA EXISTE del lado de Tracking.
  // Contestar un error invitaría al asesor a apretar de nuevo y crear una SEGUNDA actividad
  // para la misma persona. Tiene que ser 200 con un aviso.
  it("si el enlace en farming_propietarios falla: 200 con aviso, no error (la actividad ya existe)", async () => {
    const fromOriginal = base.from
    base.from = ((tabla: string) => {
      const q: any = fromOriginal(tabla)
      if (tabla === "farming_propietarios") {
        const updateOriginal = q.update
        q.update = (payload: any) => {
          // Solo se sabotea el UPDATE que enlaza (el que manda tracking_log_id): el candado de
          // arriba también lee farming_propietarios con `select`, y ese tiene que seguir andando.
          if (payload && Object.prototype.hasOwnProperty.call(payload, "tracking_log_id")) {
            const encadenado = updateOriginal(payload)
            encadenado.then = (resolve: any) => resolve({ data: null, error: { message: "boom" } })
            return encadenado
          }
          return updateOriginal(payload)
        }
      }
      return q
    }) as typeof base.from

    const r = await pasar(D_MIA, P_DE_MIA, { proceso: "vendedor" })
    const d = await r.json()
    expect(r.status).toBe(200)
    expect(d.tracking_log_id).toBe("log-nuevo")
    expect(typeof d.aviso).toBe("string")
    expect(savePerformanceLogMock).toHaveBeenCalledTimes(1)

    // La fila NO quedó enlazada (el UPDATE saboteado no escribió), que es justo lo que el
    // aviso le está contando al asesor: la actividad existe en Tracking, pero acá no se ve.
    const fila = base.tablas.farming_propietarios.find((p: any) => p.id === P_DE_MIA)!
    expect(fila.tracking_log_id).toBeNull()
  })

  // EL DUPLICADO DE VERDAD, el que no necesita dos dedos a la vez: la actividad se creó, el
  // enlace no se guardó, el asesor recargó la página y el botón volvió a aparecer. Si el
  // servidor no buscara la actividad colgada antes de crear, este apretón haría la SEGUNDA
  // prospección de la misma persona en el pipeline del equipo.
  it("si la actividad ya existe aunque la tarjeta no la muestre: 409, repara el enlace y NO crea otra", async () => {
    base.tablas.performance_logs = [
      { id: "log-colgado", agency_id: AGENCIA, type: "prospeccion", metadata: { farming_propietario_id: P_DE_MIA } },
    ]

    const r = await pasar(D_MIA, P_DE_MIA, { proceso: "vendedor" })
    const d = await r.json()
    expect(r.status).toBe(409)
    expect(d.tracking_log_id).toBe("log-colgado")
    expect(savePerformanceLogMock).not.toHaveBeenCalled()

    // Y de paso deja la tarjeta arreglada, para que el botón no vuelva a aparecer.
    const fila = base.tablas.farming_propietarios.find((p: any) => p.id === P_DE_MIA)!
    expect(fila.tracking_log_id).toBe("log-colgado")
  })

  it("la actividad colgada de OTRA persona no cuenta: crea la suya normalmente", async () => {
    base.tablas.performance_logs = [
      { id: "log-de-otro", agency_id: AGENCIA, type: "prospeccion", metadata: { farming_propietario_id: P_DE_MIA_2 } },
    ]
    const r = await pasar(D_MIA, P_DE_MIA, { proceso: "vendedor" })
    expect(r.status).toBe(200)
    expect(savePerformanceLogMock).toHaveBeenCalledTimes(1)
  })

  it("una actividad colgada de OTRA agencia no se toca ni se devuelve", async () => {
    base.tablas.performance_logs = [
      { id: "log-ajeno", agency_id: OTRA_AGENCIA, type: "prospeccion", metadata: { farming_propietario_id: P_DE_MIA } },
    ]
    const r = await pasar(D_MIA, P_DE_MIA, { proceso: "vendedor" })
    const d = await r.json()
    expect(r.status).toBe(200)
    expect(d.tracking_log_id).toBe("log-nuevo")
  })

  // LA CARRERA: dos apretones casi juntos (dos pestañas, dos dispositivos). El segundo crea su
  // actividad y, al ir a enlazar, se encuentra con que el primero ya enlazó. La suya sobra.
  const carrera = () => {
    savePerformanceLogMock.mockImplementation(async () => {
      // Mientras esta actividad se creaba, el OTRO apretón enlazó a la persona.
      const fila = base.tablas.farming_propietarios.find((p: any) => p.id === P_DE_MIA)!
      fila.tracking_log_id = "log-del-otro"
      base.tablas.performance_logs = [
        ...(base.tablas.performance_logs ?? []),
        { id: "log-mio", agency_id: AGENCIA, type: "prospeccion", metadata: { farming_propietario_id: P_DE_MIA } },
      ]
      return { id: "log-mio" }
    })
  }

  it("si otro apretón ganó la carrera: 409 con el id del otro, y borra la actividad que sobró", async () => {
    carrera()
    const r = await pasar(D_MIA, P_DE_MIA, { proceso: "vendedor" })
    const d = await r.json()
    expect(r.status).toBe(409)
    expect(d.tracking_log_id).toBe("log-del-otro")

    // La actividad de más NO queda en el pipeline del equipo.
    expect(base.tablas.performance_logs.map((l: any) => l.id)).toEqual([])
    // El enlace que ya estaba no se pisó.
    const fila = base.tablas.farming_propietarios.find((p: any) => p.id === P_DE_MIA)!
    expect(fila.tracking_log_id).toBe("log-del-otro")
  })

  it("si además falla el borrado de la que sobró: 409 con OTRO mensaje, que no miente", async () => {
    carrera()
    const fromOriginal = base.from
    base.from = ((tabla: string) => {
      const q: any = fromOriginal(tabla)
      if (tabla === "performance_logs") {
        const deleteOriginal = q.delete
        q.delete = (...args: any[]) => {
          const encadenado = deleteOriginal(...args)
          encadenado.then = (resolve: any) => resolve({ data: null, count: null, error: { message: "boom" } })
          return encadenado
        }
      }
      return q
    }) as typeof base.from

    const r = await pasar(D_MIA, P_DE_MIA, { proceso: "vendedor" })
    const d = await r.json()
    expect(r.status).toBe(409)
    expect(d.error).not.toBe("Esta persona ya está en tu pipeline")
    expect(d.error).toMatch(/repetida/i)
    expect(d.tracking_log_id).toBe("log-del-otro")
  })

  it("manda el nombre de la persona en nombre_cliente, que es la única columna donde se ve", async () => {
    await pasar(D_MIA, P_DE_MIA, { proceso: "vendedor" })
    expect(savePerformanceLogMock.mock.calls[0][0].nombre_cliente).toBe("Marta Gómez")
  })
})

// El farming se hace a la tardecita: a las 22:30 de Buenos Aires ya es el día siguiente en
// UTC. La fecha de la actividad tiene que ser la del asesor, no la del servidor.
describe("la fecha de la actividad es la de Buenos Aires", () => {
  afterEach(() => { vi.useRealTimers() })

  it("a las 22:30 del 20 en Buenos Aires, fecha_actividad es el 20 (no el 21)", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-21T01:30:00Z"))

    await pasar(D_MIA, P_DE_MIA, { proceso: "vendedor" })
    expect(savePerformanceLogMock.mock.calls[0][0].fecha_actividad).toBe("2026-09-20")
  })
})
