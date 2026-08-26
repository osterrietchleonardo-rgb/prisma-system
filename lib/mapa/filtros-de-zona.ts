// Los filtros con los que el asesor guardó una zona del mapa, traducidos a lo que entiende el
// Buscador IA.
//
// Por qué existe: cuando alguien dibuja un área en el mapa, la guarda con los filtros que tenía
// puestos en ese momento — operación, tipo, ambientes, presupuesto. Si después la nombra en el
// chat, esos datos YA ESTÁN: preguntárselos de nuevo es hacerle repetir lo que ya definió.
//
// LA REGLA DE PRECEDENCIA: gana lo que dice en la conversación. La zona solo rellena los huecos.
// Si guardó la zona para 4 ambientes y hoy pide 2, se buscan 2.

/** Lo que guarda `mapa_zonas.filtros` (la forma de FiltrosMapa). */
export interface FiltrosGuardados {
  operacion?: 'Venta' | 'Alquiler' | null
  tipo?: string | null
  precio_min?: number | null
  precio_max?: number | null
  moneda?: 'USD' | 'ARS' | null
  /** Los botones 1·2·3·4·5+ del mapa. Se suman: [2,3] son los de 2 Y los de 3. */
  ambientes?: number[] | null
  /**
   * La forma VIEJA del mismo dato: un mínimo suelto. Las zonas guardadas antes del 25-ago-2026
   * lo tienen así. Se lee igual para no perder en silencio lo que el asesor había puesto.
   */
  ambientes_min?: number | null
  fuentes?: string[] | null
  barrio?: string | null
}

/** Lo que el Buscador ya extrajo de la conversación. Solo se completa lo que esté vacío. */
export interface CriteriosDelChat {
  operation: string
  typeKeywords: string[]
  roomsFilter: number | null
  bedroomsFilter: number | null
  priceMax: number | null
  priceMin: number | null
  priceCurrency: string | null
}

export interface ResultadoFusion {
  criterios: CriteriosDelChat
  /** Qué se tomó de la zona, en castellano, para poder decírselo al asesor. */
  tomadoDeLaZona: string[]
}

export function fusionarFiltrosDeZona(
  criterios: CriteriosDelChat,
  guardados: FiltrosGuardados | null | undefined,
): ResultadoFusion {
  const tomado: string[] = []
  if (!guardados || typeof guardados !== 'object') return { criterios, tomadoDeLaZona: tomado }

  const c: CriteriosDelChat = { ...criterios }

  // Operación. "ambas" significa que no la dijo.
  if (c.operation === 'ambas' && (guardados.operacion === 'Venta' || guardados.operacion === 'Alquiler')) {
    c.operation = guardados.operacion === 'Venta' ? 'venta' : 'alquiler'
    tomado.push(guardados.operacion === 'Venta' ? 'en venta' : 'en alquiler')
  }

  if (c.typeKeywords.length === 0 && typeof guardados.tipo === 'string' && guardados.tipo.trim()) {
    c.typeKeywords = [guardados.tipo.trim().toLowerCase()]
    tomado.push(guardados.tipo.trim().toLowerCase())
  }

  // Ambientes. El mapa guarda una lista porque sus botones se suman; el Buscador maneja UN
  // número con tolerancia de ±1. Con un solo valor se traduce directo; con varios se deja sin
  // filtrar en vez de elegir uno al azar — y no se pregunta, porque la zona ya acota.
  if (!c.roomsFilter && !c.bedroomsFilter) {
    const deLista = Array.isArray(guardados.ambientes) && guardados.ambientes.length === 1
      ? Number(guardados.ambientes[0])
      : null
    const amb = deLista ?? Number(guardados.ambientes_min)
    if (Number.isFinite(amb) && amb > 0) {
      c.roomsFilter = amb
      tomado.push(`${amb} ambientes`)
    }
  }

  // Presupuesto. La moneda viaja con el precio: un tope sin moneda no significa nada.
  const moneda = guardados.moneda === 'ARS' || guardados.moneda === 'USD' ? guardados.moneda : null
  if (c.priceMax == null && c.priceMin == null) {
    const max = Number(guardados.precio_max)
    const min = Number(guardados.precio_min)
    if (Number.isFinite(max) && max > 0) {
      c.priceMax = max
      c.priceCurrency = c.priceCurrency || moneda
      tomado.push(`hasta ${max.toLocaleString('es-AR')} ${moneda || ''}`.trim())
    }
    if (Number.isFinite(min) && min > 0) {
      c.priceMin = min
      c.priceCurrency = c.priceCurrency || moneda
      tomado.push(`desde ${min.toLocaleString('es-AR')} ${moneda || ''}`.trim())
    }
  }

  // `barrio` NO se toma: el dibujo lo reemplaza, y es más preciso.
  // `fuentes` tampoco: es el interruptor de qué capas se ven en el mapa. Aplicarlo acá podría
  // ESCONDER en silencio la cartera propia o la red de colaboración, y esconder resultados sin
  // avisar es exactamente el problema que nos trajo hasta acá.

  return { criterios: c, tomadoDeLaZona: tomado }
}
