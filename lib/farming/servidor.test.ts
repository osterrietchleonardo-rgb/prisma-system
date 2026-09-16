import { describe, it, expect } from "vitest"
import { baseFalsa } from "./base-falsa"
import { direccionAccesible } from "./servidor"

/**
 * `direccionAccesible`: el portero de 403/404 sobre el que las tareas 4 y 5 (editar/borrar una
 * tarjeta, cargar propietarios) construyen sus escrituras. Se resuelve por la zona de la
 * tarjeta —la tarjeta no tiene una regla de acceso propia—, así que estos tests prueban
 * exactamente eso: que delega en `zonaAccesible` y que devuelve la tarjeta aunque no se pueda
 * tocar (para poder distinguir 403 de 404 en el endpoint que lo llama).
 */

const AGENCIA = "ag-1"
const OTRA_AGENCIA = "ag-2"
const YO = "u-yo"
const JUAN = "u-juan"

const cuadrado = { type: "Polygon", coordinates: [[[-58.46, -34.56], [-58.45, -34.56], [-58.45, -34.55], [-58.46, -34.55], [-58.46, -34.56]]] }

const Z_MIA = "10000000-0000-0000-0000-000000000001"
const Z_JUAN = "10000000-0000-0000-0000-000000000002"

const D_MIA = "20000000-0000-0000-0000-000000000001"
const D_JUAN = "20000000-0000-0000-0000-000000000002"
const D_AJENA = "20000000-0000-0000-0000-000000000003"

function nuevaBase() {
  return baseFalsa({
    farming_zonas: [
      { id: Z_MIA, agency_id: AGENCIA, owner_user_id: YO, nombre: "Mia", geojson: cuadrado, estado: "activa" },
      { id: Z_JUAN, agency_id: AGENCIA, owner_user_id: JUAN, nombre: "De Juan", geojson: cuadrado, estado: "activa" },
    ],
    farming_zonas_compartidas: [],
    farming_direcciones: [
      { id: D_MIA, zona_id: Z_MIA, agency_id: AGENCIA, calle: "Mia 1", tipo: "casa" },
      { id: D_JUAN, zona_id: Z_JUAN, agency_id: AGENCIA, calle: "De Juan 1", tipo: "casa" },
      // Agencia distinta a la de quien pregunta: el filtro `.eq("agency_id", agencyId)` la tiene
      // que sacar de la consulta ANTES de mirar la zona, sin importar de qué zona sea.
      { id: D_AJENA, zona_id: Z_MIA, agency_id: OTRA_AGENCIA, calle: "Ajena 1", tipo: "casa" },
    ],
  })
}

describe("direccionAccesible", () => {
  it("mi tarjeta (mi zona): puede = true", async () => {
    const base = nuevaBase()
    const r = await direccionAccesible(base as any, D_MIA, AGENCIA, YO)
    expect(r.puede).toBe(true)
    expect(r.direccion?.id).toBe(D_MIA)
  })

  it("una tarjeta en la zona de un colega que no comparte conmigo: existe, pero puede = false (403)", async () => {
    const base = nuevaBase()
    const r = await direccionAccesible(base as any, D_JUAN, AGENCIA, YO)
    expect(r.puede).toBe(false)
    expect(r.direccion).not.toBeNull()
    expect(r.direccion?.id).toBe(D_JUAN)
  })

  it("una tarjeta de otra agencia: no existe para mí (404), no solo 403", async () => {
    const base = nuevaBase()
    const r = await direccionAccesible(base as any, D_AJENA, AGENCIA, YO)
    expect(r.direccion).toBeNull()
    expect(r.puede).toBe(false)
  })

  it("un id sin forma de uuid: 404 sin consultar la base", async () => {
    const base = nuevaBase()
    let consulto = false
    const fromOriginal = base.from
    base.from = ((tabla: string) => {
      consulto = true
      return fromOriginal(tabla)
    }) as typeof base.from

    const r = await direccionAccesible(base as any, "no-es-un-uuid", AGENCIA, YO)
    expect(r.direccion).toBeNull()
    expect(r.puede).toBe(false)
    expect(consulto).toBe(false)
  })
})
