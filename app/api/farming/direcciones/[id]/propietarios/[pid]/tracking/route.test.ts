// app/api/farming/direcciones/[id]/propietarios/[pid]/tracking/route.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest"
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
})
