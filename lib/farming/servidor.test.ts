import { describe, it, expect } from "vitest"
import { baseFalsa } from "./base-falsa"
import { direccionAccesible, zonaAccesible } from "./servidor"

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
const Z_ARCHIVADA = "10000000-0000-0000-0000-000000000003"
const Z_LIBERADA = "10000000-0000-0000-0000-000000000004"

const D_MIA = "20000000-0000-0000-0000-000000000001"
const D_JUAN = "20000000-0000-0000-0000-000000000002"
const D_AJENA = "20000000-0000-0000-0000-000000000003"
const D_ARCHIVADA = "20000000-0000-0000-0000-000000000004"

function nuevaBase() {
  return baseFalsa({
    farming_zonas: [
      { id: Z_MIA, agency_id: AGENCIA, owner_user_id: YO, nombre: "Mia", geojson: cuadrado, estado: "activa" },
      { id: Z_JUAN, agency_id: AGENCIA, owner_user_id: JUAN, nombre: "De Juan", geojson: cuadrado, estado: "activa" },
      { id: Z_ARCHIVADA, agency_id: AGENCIA, owner_user_id: YO, nombre: "Vieja", geojson: cuadrado, estado: "archivada" },
      { id: Z_LIBERADA, agency_id: AGENCIA, owner_user_id: YO, nombre: "Liberada", geojson: cuadrado, estado: "liberada" },
    ],
    farming_zonas_compartidas: [],
    farming_direcciones: [
      { id: D_MIA, zona_id: Z_MIA, agency_id: AGENCIA, calle: "Mia 1", tipo: "casa" },
      { id: D_JUAN, zona_id: Z_JUAN, agency_id: AGENCIA, calle: "De Juan 1", tipo: "casa" },
      // Agencia distinta a la de quien pregunta: el filtro `.eq("agency_id", agencyId)` la tiene
      // que sacar de la consulta ANTES de mirar la zona, sin importar de qué zona sea.
      { id: D_AJENA, zona_id: Z_MIA, agency_id: OTRA_AGENCIA, calle: "Ajena 1", tipo: "casa" },
      { id: D_ARCHIVADA, zona_id: Z_ARCHIVADA, agency_id: AGENCIA, calle: "Vieja 1", tipo: "casa" },
    ],
  })
}

describe("direccionAccesible", () => {
  it("mi tarjeta (mi zona): puede = true", async () => {
    const base = nuevaBase()
    const r = await direccionAccesible(base as any, D_MIA, AGENCIA, YO, "escribir")
    expect(r.puede).toBe(true)
    expect(r.direccion?.id).toBe(D_MIA)
  })

  it("una tarjeta en la zona de un colega que no comparte conmigo: existe, pero puede = false (403)", async () => {
    const base = nuevaBase()
    const r = await direccionAccesible(base as any, D_JUAN, AGENCIA, YO, "escribir")
    expect(r.puede).toBe(false)
    expect(r.direccion).not.toBeNull()
    expect(r.direccion?.id).toBe(D_JUAN)
  })

  it("una tarjeta de otra agencia: no existe para mí (404), no solo 403", async () => {
    const base = nuevaBase()
    const r = await direccionAccesible(base as any, D_AJENA, AGENCIA, YO, "escribir")
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

    const r = await direccionAccesible(base as any, "no-es-un-uuid", AGENCIA, YO, "escribir")
    expect(r.direccion).toBeNull()
    expect(r.puede).toBe(false)
    expect(consulto).toBe(false)
  })
})

/**
 * UNA ZONA ARCHIVADA SE MIRA, NO SE TRABAJA.
 *
 * Es la regla entera de este bloque, y la que sostiene la promesa del cartel al archivar («tus
 * tarjetas, tus propietarios y su historial quedan guardados»): si `zonaAccesible` volviera a
 * exigir `estado = 'activa'` para todo, esa promesa sería falsa —la zona desaparecía de la
 * lista, del selector de Relevamiento y de TODOS los endpoints de direcciones— y estas pruebas
 * mueren. Si, al revés, alguien dejara pasar la escritura, también mueren.
 */
describe("zonaAccesible: archivada se lee, no se escribe", () => {
  it("leer una zona archivada: se puede", async () => {
    const r = await zonaAccesible(nuevaBase() as any, Z_ARCHIVADA, AGENCIA, YO, "leer")
    expect(r.puede).toBe(true)
    expect(r.motivo).toBeNull()
    expect(r.zona?.estado).toBe("archivada")
  })

  it("escribir en una zona archivada: NO se puede, y el motivo lo dice (no es 'no existe' ni 'es de un colega')", async () => {
    const r = await zonaAccesible(nuevaBase() as any, Z_ARCHIVADA, AGENCIA, YO, "escribir")
    expect(r.puede).toBe(false)
    expect(r.motivo).toBe("archivada")
    // La zona igual vuelve: el endpoint tiene que poder decir de cuál está hablando.
    expect(r.zona?.id).toBe(Z_ARCHIVADA)
  })

  it("una zona LIBERADA por el director no entra ni para leer", async () => {
    const r = await zonaAccesible(nuevaBase() as any, Z_LIBERADA, AGENCIA, YO, "leer")
    expect(r.zona).toBeNull()
    expect(r.motivo).toBe("no_existe")
  })

  it("la zona archivada de un colega sigue siendo 'ajena': no se le cuenta a nadie en qué estado está la zona de otro", async () => {
    const base = nuevaBase()
    base.tablas.farming_zonas.push({ id: "10000000-0000-0000-0000-000000000005", agency_id: AGENCIA, owner_user_id: JUAN, nombre: "De Juan, vieja", geojson: cuadrado, estado: "archivada" })
    const r = await zonaAccesible(base as any, "10000000-0000-0000-0000-000000000005", AGENCIA, YO, "leer")
    expect(r.puede).toBe(false)
    expect(r.motivo).toBe("ajena")
  })

  it("una zona activa se sigue pudiendo escribir (el candado nuevo no rompe lo de siempre)", async () => {
    const r = await zonaAccesible(nuevaBase() as any, Z_MIA, AGENCIA, YO, "escribir")
    expect(r.puede).toBe(true)
    expect(r.motivo).toBeNull()
  })
})

describe("direccionAccesible: hereda el candado de archivada de su zona", () => {
  it("una tarjeta de zona archivada se LEE", async () => {
    const r = await direccionAccesible(nuevaBase() as any, D_ARCHIVADA, AGENCIA, YO, "leer")
    expect(r.puede).toBe(true)
    expect(r.motivo).toBeNull()
    expect(r.direccion?.id).toBe(D_ARCHIVADA)
  })

  it("una tarjeta de zona archivada NO se escribe", async () => {
    const r = await direccionAccesible(nuevaBase() as any, D_ARCHIVADA, AGENCIA, YO, "escribir")
    expect(r.puede).toBe(false)
    expect(r.motivo).toBe("archivada")
  })
})
