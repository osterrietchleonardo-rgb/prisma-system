// Los tests de lib/mapa corren con `node --test`, no con vitest (asi esta puesto en
// vitest.config.ts y en el script `test`). Por eso el import lleva la extension .ts.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { fusionarFiltrosDeZona, type CriteriosDelChat } from './filtros-de-zona.ts'

/** Lo que el chat extrajo cuando el asesor no dijo ningún criterio. */
const VACIO: CriteriosDelChat = {
  operation: 'ambas',
  typeKeywords: [],
  roomsFilter: null,
  bedroomsFilter: null,
  priceMax: null,
  priceMin: null,
  priceCurrency: null,
}

/** Los filtros reales de la zona "BUSQUEDA MAXI" de Central, tal cual están en la base. */
const ZONA_DE_CENTRAL = {
  tipo: 'departamento',
  barrio: null,
  moneda: 'USD' as const,
  fuentes: ['own', 'agency', 'roomix'],
  ambientes: [4],
  operacion: 'Venta' as const,
  precio_max: 180000,
  precio_min: null,
}

/** Los de una zona vieja de Leonardo: otra forma del campo de ambientes. */
const ZONA_VIEJA = {
  tipo: null,
  barrio: null,
  moneda: 'USD' as const,
  fuentes: ['own', 'agency', 'roomix'],
  operacion: 'Venta' as const,
  precio_max: null,
  precio_min: null,
  ambientes_min: 3,
}

describe('los filtros guardados con la zona rellenan lo que el asesor no dijo', () => {
  it('toma operación, tipo, ambientes y presupuesto cuando no dijo ninguno', () => {
    const { criterios, tomadoDeLaZona } = fusionarFiltrosDeZona(VACIO, ZONA_DE_CENTRAL)
    assert.equal(criterios.operation, 'venta')
    assert.deepEqual(criterios.typeKeywords, ['departamento'])
    assert.equal(criterios.roomsFilter, 4)
    assert.equal(criterios.priceMax, 180000)
    assert.equal(criterios.priceCurrency, 'USD')
    // Y queda registrado qué se tomó, para poder decírselo.
    assert.equal(tomadoDeLaZona.length, 4)
  })

  it('NO pisa lo que el asesor pidió hoy: manda la conversación', () => {
    const dijoOtraCosa: CriteriosDelChat = {
      ...VACIO,
      operation: 'alquiler',
      typeKeywords: ['casa'],
      roomsFilter: 2,
      priceMax: 90000,
      priceCurrency: 'USD',
    }
    const { criterios, tomadoDeLaZona } = fusionarFiltrosDeZona(dijoOtraCosa, ZONA_DE_CENTRAL)
    assert.equal(criterios.operation, 'alquiler')
    assert.deepEqual(criterios.typeKeywords, ['casa'])
    assert.equal(criterios.roomsFilter, 2)
    assert.equal(criterios.priceMax, 90000)
    assert.deepEqual(tomadoDeLaZona, [])
  })

  it('rellena solo los huecos: si dijo los ambientes, toma el resto', () => {
    const { criterios } = fusionarFiltrosDeZona({ ...VACIO, roomsFilter: 2 }, ZONA_DE_CENTRAL)
    assert.equal(criterios.roomsFilter, 2)      // lo suyo
    assert.equal(criterios.operation, 'venta')  // de la zona
    assert.equal(criterios.priceMax, 180000)    // de la zona
  })

  it('entiende la forma vieja del campo de ambientes', () => {
    const { criterios } = fusionarFiltrosDeZona(VACIO, ZONA_VIEJA)
    assert.equal(criterios.roomsFilter, 3)
  })

  it('con varios ambientes guardados no elige uno al azar: los deja sin filtrar', () => {
    const { criterios } = fusionarFiltrosDeZona(VACIO, { ...ZONA_DE_CENTRAL, ambientes: [2, 3] })
    assert.equal(criterios.roomsFilter, null)
  })

  it('el precio nunca viaja sin su moneda', () => {
    const { criterios } = fusionarFiltrosDeZona(VACIO, { ...ZONA_DE_CENTRAL, moneda: 'ARS' })
    assert.equal(criterios.priceMax, 180000)
    assert.equal(criterios.priceCurrency, 'ARS')
  })

  it('no toma el barrio guardado: el dibujo lo reemplaza y es más preciso', () => {
    const { tomadoDeLaZona } = fusionarFiltrosDeZona(VACIO, { ...ZONA_DE_CENTRAL, barrio: 'Palermo' })
    assert.ok(!(tomadoDeLaZona.join(' ')).includes('Palermo'))
  })

  it('no toma las fuentes: esconder la cartera o la red sin avisar sería lo peor', () => {
    const { criterios, tomadoDeLaZona } = fusionarFiltrosDeZona(VACIO, { ...ZONA_DE_CENTRAL, fuentes: ['own'] })
    assert.ok(!(tomadoDeLaZona.join(' ')).includes('own'))
    assert.ok(!('fuentes' in (criterios as any)))
  })

  it('una zona sin filtros guardados no rompe nada', () => {
    for (const vacia of [null, undefined, {}, 'no es un objeto' as any]) {
      const { criterios, tomadoDeLaZona } = fusionarFiltrosDeZona(VACIO, vacia)
      assert.deepEqual(criterios, VACIO)
      assert.deepEqual(tomadoDeLaZona, [])
    }
  })

  it('ignora valores basura en vez de filtrar por ellos', () => {
    const { criterios } = fusionarFiltrosDeZona(VACIO, {
      ...ZONA_DE_CENTRAL,
      ambientes: [0],
      precio_max: -5 as any,
      tipo: '   ',
    })
    assert.equal(criterios.roomsFilter, null)
    assert.equal(criterios.priceMax, null)
    assert.deepEqual(criterios.typeKeywords, [])
  })
})
