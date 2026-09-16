// Pruebas del plan de gasto de mercado-sync. Todo acá es función pura: no toca
// red, ni Apify, ni la base.
import { describe, it, expect } from 'vitest'
import {
  ZONAS_POR_TURNO, ZONAS_EXTRA,
  matrizDelMes, ventanaDescubrimiento, hayPresupuesto, barriosDeZona, slugDeBarrio,
} from './plan.mjs'

// Las 48 zonas de CABA que el refresco venía recorriendo TODAS cada mes. Si alguna
// desaparece de los grupos, deja de refrescarse y nadie se entera: por eso está escrita.
const LAS_48 = [
  'recoleta', 'caballito', 'almagro', 'balvanera', 'villa-crespo', 'barracas', 'flores',
  'retiro', 'villa-devoto', 'villa-del-parque', 'monserrat', 'san-nicolas', 'constitucion',
  'san-telmo', 'chacarita', 'villa-ortuzar', 'villa-pueyrredon', 'boedo', 'parque-patricios',
  'villa-luro', 'floresta', 'san-cristobal', 'parque-chacabuco', 'monte-castro',
  'puerto-madero', 'agronomia', 'la-paternal', 'villa-general-mitre', 'villa-santa-rita',
  'villa-real', 'versalles', 'velez-sarsfield', 'mataderos', 'liniers', 'parque-avellaneda',
  'villa-lugano', 'nueva-pompeya', 'villa-soldati', 'villa-riachuelo', 'parque-chas',
  'la-boca', 'belgrano', 'palermo', 'nunez', 'villa-urquiza', 'colegiales', 'saavedra',
  'coghlan',
]

describe('grupos de zonas', () => {
  it('los turnos juntos cubren las 48 zonas, sin repetir ninguna', () => {
    const todas = ZONAS_POR_TURNO.flat()
    expect(new Set(todas).size).toBe(todas.length)   // sin repetidas
    expect([...todas].sort()).toEqual([...LAS_48].sort())
  })

  it('los turnos tienen un tamaño parecido', () => {
    // Si un turno fuera mucho más grande, el mes que le toca se pasaría de presupuesto.
    const tam = ZONAS_POR_TURNO.map((g) => g.length)
    expect(Math.max(...tam) - Math.min(...tam)).toBeLessThanOrEqual(2)
  })

  it('son dos turnos: TODA la ciudad se relee cada 2 meses, ningún barrio queda afuera', () => {
    expect(ZONAS_POR_TURNO.length).toBe(2)
  })
})

describe('matrizDelMes', () => {
  const zonasDe = (m) => m.filter((e) => e.refrescar).map((e) => e.zona)

  it('a cada mes le toca un turno, y el otro no corre', () => {
    const m = matrizDelMes(new Date('2026-09-03T06:00:00Z'))   // septiembre = 9 → turno (9-1)%2 = 0
    const turno = ZONAS_POR_TURNO[(9 - 1) % 2]
    expect(zonasDe(m)).toEqual(expect.arrayContaining([...turno]))
    for (const otro of ZONAS_POR_TURNO.filter((g) => g !== turno)) {
      for (const z of otro) expect(zonasDe(m)).not.toContain(z)
    }
  })

  it('en dos meses seguidos se refrescan las 48 zonas, ni una queda afuera', () => {
    const vistas = new Set()
    for (const mes of ['2026-10-03', '2026-11-03']) {
      for (const z of zonasDe(matrizDelMes(new Date(`${mes}T06:00:00Z`)))) vistas.add(z)
    }
    for (const z of LAS_48) expect([...vistas]).toContain(z)
  })

  it('ningún mes se lleva más de la mitad de la ciudad', () => {
    // El costo del mes es proporcional a las zonas que corren: si un mes se
    // llevara las 48, serían US$ 67 de una y el presupuesto no entra.
    for (const mes of ['2026-09-03', '2026-10-03', '2026-11-03', '2026-12-03']) {
      const zonas = zonasDe(matrizDelMes(new Date(`${mes}T06:00:00Z`)))
      expect(zonas.filter((z) => LAS_48.includes(z)).length).toBeLessThanOrEqual(25)
    }
  })

  it('las zonas de afuera de CABA son chicas y corren todos los meses', () => {
    for (const mes of ['2026-09-03', '2026-10-03']) {
      const zonas = zonasDe(matrizDelMes(new Date(`${mes}T06:00:00Z`)))
      for (const e of ZONAS_EXTRA) expect(zonas).toContain(e.zona)
    }
  })

  it('cada zona de afuera de CABA lleva su propio slug de búsqueda y su tope de páginas', () => {
    const m = matrizDelMes(new Date('2026-10-03T06:00:00Z'))
    const dt = m.find((e) => e.zona === 'don-torcuato')
    expect(dt).toMatchObject({ base: 'terrenos-venta-don-torcuato', hasta: 60, refrescar: true })
  })

  it('las zonas de CABA usan el slug de departamentos y el techo de paginación', () => {
    // Sin atarse a un barrio: cuál corre depende del mes.
    for (const mes of ['2026-09-03', '2026-10-03']) {
      const deCaba = matrizDelMes(new Date(`${mes}T06:00:00Z`)).filter((e) => LAS_48.includes(e.zona))
      expect(deCaba.length).toBeGreaterThan(20)
      for (const e of deCaba) expect(e).toMatchObject({ base: `departamentos-venta-${e.zona}`, hasta: 220 })
    }
  })

  it('los barrios sin zona propia se verifican todos los meses, pero no se refrescan', () => {
    // Barrio Norte, Once, Congreso, Centro… son 608 avisos que hoy no verifica nadie.
    for (const fecha of ['2026-09-03T06:00:00Z', '2026-10-03T06:00:00Z']) {
      const otros = matrizDelMes(new Date(fecha)).find((e) => e.zona === 'otros-sin-zona')
      expect(otros).toMatchObject({ refrescar: false, verificar: true })
    }
  })

  it('todo lo que entra en la matriz se verifica', () => {
    const m = matrizDelMes(new Date('2026-10-03T06:00:00Z'))
    expect(m.every((e) => e.verificar)).toBe(true)
  })
})

describe('ventanaDescubrimiento', () => {
  // Medido el 8-sep: una corrida con ventana 2 trajo 1.182 avisos publicados el día
  // anterior + 315 del propio día. O sea que la ventana es "el día anterior entero
  // + lo que va de hoy": con 1 se perdería todo lo que se publique después de la
  // corrida, así que 2 es el PISO. Lo que sube a 3 es que falte una corrida.
  const ahora = new Date('2026-09-16T04:00:00Z')   // 01:00 en Argentina

  it('con la corrida de ayer hecha, pide dos días (el día de ayer entero)', () => {
    expect(ventanaDescubrimiento(new Date('2026-09-15T04:10:00Z'), ahora)).toBe(2)
  })

  it('nunca baja de dos, aunque acabe de correr', () => {
    expect(ventanaDescubrimiento(new Date('2026-09-16T03:00:00Z'), ahora)).toBe(2)
  })

  it('si ayer falló, pide tres para tapar el día que faltó', () => {
    expect(ventanaDescubrimiento(new Date('2026-09-14T04:00:00Z'), ahora)).toBe(3)
  })

  it('si hace mucho que no corre, pide tres y no más (el resto lo levanta el refresco)', () => {
    expect(ventanaDescubrimiento(new Date('2026-09-01T09:00:00Z'), ahora)).toBe(3)
  })

  it('si nunca corrió, pide tres', () => {
    expect(ventanaDescubrimiento(null, ahora)).toBe(3)
  })

  it('acepta la fecha como texto, que es como viene de la base', () => {
    expect(ventanaDescubrimiento('2026-09-15T04:10:00+00:00', ahora)).toBe(2)
  })

  it('una fecha rota no lo deja sin ventana', () => {
    expect(ventanaDescubrimiento('cualquier cosa', ahora)).toBe(3)
  })
})

describe('hayPresupuesto', () => {
  it('deja correr por debajo del tope', () => {
    expect(hayPresupuesto(89.99, 90)).toBe(true)
  })

  it('frena al llegar al tope', () => {
    expect(hayPresupuesto(90, 90)).toBe(false)
    expect(hayPresupuesto(102.43, 90)).toBe(false)
  })

  it('si no se pudo leer el uso, deja correr (no es la guardia la que rompe el día)', () => {
    expect(hayPresupuesto(null, 90)).toBe(true)
  })
})

describe('barriosDeZona', () => {
  // Los nombres tal como están escritos en la base, con acentos y todo.
  const BARRIOS_BASE = [
    'Palermo', 'Belgrano', 'Núñez', 'Villa Urquiza', 'San Cristobal', 'Pompeya',
    'Villa Lugano', 'Barrio Norte', 'Once', 'Congreso', 'Centro / Microcentro',
    'Don Torcuato', 'Villa Gral. Mitre',
  ]

  it('resuelve el barrio aunque el slug no tenga los acentos', () => {
    expect(barriosDeZona('nunez', BARRIOS_BASE)).toEqual(['Núñez'])
    expect(barriosDeZona('villa-urquiza', BARRIOS_BASE)).toEqual(['Villa Urquiza'])
  })

  it('resuelve las zonas que la verificación vieja NO tenía mapeadas', () => {
    // Con el mapa escrito a mano (7 barrios), estas cortaban con error y las bajas
    // no se marcaban en casi toda CABA.
    expect(barriosDeZona('villa-lugano', BARRIOS_BASE)).toEqual(['Villa Lugano'])
    expect(barriosDeZona('san-cristobal', BARRIOS_BASE)).toEqual(['San Cristobal'])
  })

  it('usa los alias cuando el barrio de la base se llama distinto que la zona', () => {
    expect(barriosDeZona('nueva-pompeya', BARRIOS_BASE)).toEqual(['Pompeya'])
    expect(barriosDeZona('villa-general-mitre', BARRIOS_BASE)).toEqual(['Villa Gral. Mitre'])
  })

  it('otros-sin-zona junta lo que no es de ninguna zona', () => {
    const otros = barriosDeZona('otros-sin-zona', BARRIOS_BASE)
    expect(otros).toEqual(expect.arrayContaining(['Barrio Norte', 'Once', 'Congreso', 'Centro / Microcentro']))
    expect(otros).not.toContain('Palermo')
    expect(otros).not.toContain('Don Torcuato')   // tiene zona propia
    expect(otros).not.toContain('Pompeya')        // resuelve por alias
  })

  it('una zona que la base todavía no conoce devuelve lista vacía, no rompe', () => {
    expect(barriosDeZona('coghlan', BARRIOS_BASE)).toEqual([])
  })

  it('una zona que no existe en ningún grupo es un error, no un silencio', () => {
    expect(() => barriosDeZona('zona-inventada', BARRIOS_BASE)).toThrow(/zona-inventada/)
  })
})

describe('slugDeBarrio', () => {
  it('saca acentos, mayúsculas y puntuación', () => {
    expect(slugDeBarrio('Núñez')).toBe('nunez')
    expect(slugDeBarrio('Villa Gral. Mitre')).toBe('villa-gral-mitre')
    expect(slugDeBarrio('Centro / Microcentro')).toBe('centro-microcentro')
  })

  it('aguanta vacío y nulo', () => {
    expect(slugDeBarrio(null)).toBe('')
    expect(slugDeBarrio('')).toBe('')
  })
})
