// Un pin por ubicacion, no por aviso.
//
// Medido sobre la base real el 2026-08-05 (70.809 propiedades activas de colaboracion):
//  - 572 grupos son la MISMA propiedad publicada por inmobiliarias distintas.
//    Verificado: una casa en Barrancas de San Benito publicada por LAMS y por Pernice,
//    mismo precio y superficie, una dice "4 ambientes" y la otra "6".
//  - 5.153 grupos son de UNA SOLA inmobiliaria y en general NO son duplicados:
//    verificado, 3 departamentos de Fuschetto en Convencion 1400, mismo precio y m2,
//    pisos 1, 2 y 3. Son unidades distintas.
//  - El campo `floor`, el unico que las distinguiria, solo esta cargado en el 45%.
//
// Por eso NO se esconde ninguna propiedad. Se agrupa el dibujo (un pin) y se marca
// lo que parece repetido para que lo decida el asesor.
import type { FuenteMapa, GrupoUbicacion, PropiedadMapa } from "./tipos.ts"

/** ~11 cm de precision: suficiente para juntar el mismo punto sin pegar vecinos. */
const DECIMALES = 6

/** La cartera propia manda sobre la de la agencia, y esta sobre la colaboracion. */
const PRIORIDAD: Record<FuenteMapa, number> = { own: 3, agency: 2, roomix: 1 }

function nombreDeLaFuente(p: PropiedadMapa): string {
  return p.source === "roomix" ? p.roomix_agency_name || "" : "__cartera__"
}

/** Dos avisos parecen la misma propiedad si coinciden precio, superficie y tipo. */
function firmaDeLaPropiedad(p: PropiedadMapa): string {
  return `${p.price}|${p.total_area}|${p.property_type}`
}

/**
 * Marca los conjuntos de avisos que parecen ser la misma propiedad publicada por
 * inmobiliarias DISTINTAS. Los de una misma inmobiliaria no se marcan: son unidades
 * distintas del mismo edificio.
 */
function detectarRepetidas(propiedades: PropiedadMapa[]): string[][] {
  const porFirma = new Map<string, PropiedadMapa[]>()
  for (const p of propiedades) {
    const firma = firmaDeLaPropiedad(p)
    const lista = porFirma.get(firma)
    if (lista) lista.push(p)
    else porFirma.set(firma, [p])
  }

  const repetidas: string[][] = []
  for (const grupo of porFirma.values()) {
    if (grupo.length < 2) continue
    const inmobiliarias = new Set(grupo.map(nombreDeLaFuente))
    if (inmobiliarias.size < 2) continue // misma inmobiliaria: unidades distintas
    repetidas.push(grupo.map((p) => p.id))
  }
  return repetidas
}

/**
 * Agrupa las propiedades por coordenada. Las que no tienen ubicacion no arman pin
 * (el panel de resultados las lista aparte, marcadas "sin ubicacion").
 *
 * Garantia: ninguna propiedad con coordenadas se pierde. La suma de las propiedades
 * de todos los grupos es igual a la cantidad de entrada con coordenadas.
 */
export function agruparPorUbicacion(propiedades: PropiedadMapa[]): GrupoUbicacion[] {
  const porClave = new Map<string, PropiedadMapa[]>()

  for (const p of propiedades) {
    if (typeof p.lat !== "number" || typeof p.lng !== "number") continue
    const clave = `${p.lat.toFixed(DECIMALES)},${p.lng.toFixed(DECIMALES)}`
    const lista = porClave.get(clave)
    if (lista) lista.push(p)
    else porClave.set(clave, [p])
  }

  const grupos: GrupoUbicacion[] = []
  for (const [clave, lista] of porClave) {
    const fuente_del_pin = lista.reduce<FuenteMapa>(
      (mejor, p) => (PRIORIDAD[p.source] > PRIORIDAD[mejor] ? p.source : mejor),
      lista[0].source,
    )
    grupos.push({
      clave,
      lat: lista[0].lat as number,
      lng: lista[0].lng as number,
      propiedades: lista,
      fuente_del_pin,
      posibles_repetidas: detectarRepetidas(lista),
    })
  }
  return grupos
}
