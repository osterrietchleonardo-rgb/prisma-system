// Los tests de lib/mapa corren con `node --test` (ver vitest.config.ts y el script `test`).
//
// El corte a mercado_avisos (2-sep-2026): la red dejó la taxonomía schema.org en inglés de
// roomix (Apartment / House / Accommodation) y pasó a los tipos REALES de ZonaProp en
// castellano. Verificado contra producción el 2-sep: Departamento 19.628 · Casa 234 ·
// Local comercial 211 · Terrenos 174 · PH 140 · Edificio 28 · Cochera 14 ·
// Oficina comercial 5 · Fondo de comercio 2. Estos tests fijan ese contrato: si el filtro
// del mapa pide valores que la tabla no tiene, el mapa filtrado devuelve CERO pins.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { valoresDeTipo } from './tipos-propiedad.ts'

describe('valoresDeTipo contra la red (mercado_avisos)', () => {
  it('departamento pide el tipo real de la tabla', () => {
    assert.ok(valoresDeTipo('departamento', 'colaboracion')!.includes('Departamento'))
  })

  it('casa incluye los PH: la etiqueta del desplegable es "Casa / PH" y mercado los separa', () => {
    const v = valoresDeTipo('casa', 'colaboracion')!
    assert.ok(v.includes('Casa'))
    assert.ok(v.includes('PH'))
  })

  it('lote ahora SÍ existe en la red: ZonaProp trae Terrenos (roomix no los distinguía)', () => {
    const v = valoresDeTipo('lote', 'colaboracion')
    assert.ok(v !== null && v.length > 0, 'la red ya distingue lotes; [] la haría saltearse la consulta')
    assert.ok(v!.includes('Terrenos'))
  })

  it('comercial junta todas las canastas comerciales reales', () => {
    const v = valoresDeTipo('comercial', 'colaboracion')!
    assert.ok(v.includes('Local comercial'))
    assert.ok(v.includes('Oficina comercial'))
  })

  it('ningún valor de la red quedó en la taxonomía vieja de roomix', () => {
    for (const tipo of ['departamento', 'casa', 'comercial', 'lote']) {
      for (const v of valoresDeTipo(tipo, 'colaboracion') ?? []) {
        assert.ok(!['Apartment', 'House', 'Accommodation'].includes(v),
          `"${v}" es taxonomía de roomix; mercado_avisos no la tiene`)
      }
    }
  })
})
