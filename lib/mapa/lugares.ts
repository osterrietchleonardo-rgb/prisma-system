// Mapa · buscador de lugares: barrios, zonas guardadas y direcciones.
//
// Logica pura, sin red ni base: se testea sola. Lo que sale de aca es una lista de
// sugerencias ya ordenada y sin repetidos, lista para pintar.
import type { BBox } from "./tipos.ts"

/** De donde salio la sugerencia. Cambia el icono, el texto y que pasa al elegirla. */
export type TipoLugar = "barrio" | "cartera" | "zona" | "direccion"

export interface Lugar {
  /** Estable dentro de una tanda de resultados: sirve de key en React. */
  id: string
  tipo: TipoLugar
  nombre: string
  /** La linea chica de abajo: "6.428 propiedades", "guardada por vos", el domicilio. */
  detalle: string
  /** Adonde vuela el mapa. Las direcciones traen un recuadro chico alrededor del punto. */
  bbox: BBox
  /**
   * El punto exacto, cuando el lugar ES un punto (una direccion). Con esto se clava el
   * marcador rojo en la puerta buscada: el recuadro solo dice "por aca cerca", y el
   * asesor necesita ver DONDE esta parado para leer el entorno y las comparables.
   *
   * Un barrio no lo trae a proposito: su centro geometrico no significa nada y un pin
   * en el medio de Palermo se leeria como una propiedad mas.
   */
  punto?: { lat: number; lng: number }
  /** Solo las zonas guardadas: ademas de volar, recortan por el trazo. */
  geojson?: unknown
}

/**
 * Texto comparable: sin acentos, sin mayusculas, sin espacios de mas.
 *
 * Tiene que dar lo MISMO que `lower(unaccent(btrim(...)))` de Postgres, porque con esto
 * se descartan los repetidos que vienen de las dos consultas. "Núñez" y "Nuñez" son el
 * mismo barrio escrito por dos inmobiliarias distintas.
 */
export function normalizarTexto(s: string): string {
  return s
    .normalize("NFD")
    // El rango escrito con codigos y no con los caracteres: son signos que se combinan
    // con la letra anterior y, sueltos en el codigo, cualquier editor los desarma.
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
}

/** Un recuadro chiquito alrededor de un punto, para poder volar a una direccion. */
export function recuadroDePunto(lat: number, lng: number, gradosDeLado = 0.0045): BBox {
  // 0,0045 grados son unos 500 m: la manzana y sus vecinas, que es lo que uno quiere ver
  // al buscar una direccion. Mas cerrado deja el mapa sin contexto.
  return {
    sur: lat - gradosDeLado,
    norte: lat + gradosDeLado,
    oeste: lng - gradosDeLado,
    este: lng + gradosDeLado,
  }
}

function plural(n: number, singular: string, plural_: string) {
  return `${n.toLocaleString("es-AR")} ${n === 1 ? singular : plural_}`
}

export function detalleDeBarrio(cantidad: number): string {
  return plural(cantidad, "propiedad", "propiedades")
}

export function detalleDeCartera(cantidad: number): string {
  return `${plural(cantidad, "propiedad", "propiedades")} de tu cartera`
}

/**
 * Junta las listas y saca los repetidos, respetando la prioridad de quien llama.
 *
 * El orden de entrada MANDA: lo que viene primero gana. Se llama con las zonas propias
 * antes que los barrios porque una zona que el usuario nombro "Palermo" es mas suya que
 * el barrio Palermo del catalogo, y verlo dos veces confunde.
 *
 * Los repetidos se detectan por tipo + nombre normalizado: dos lugares distintos pueden
 * llamarse igual (la zona "Belgrano" y el barrio Belgrano) y ahi no hay nada que unir,
 * pero el barrio Belgrano no puede aparecer dos veces.
 */
export function unirLugares(...listas: Lugar[][]): Lugar[] {
  const vistos = new Set<string>()
  const salida: Lugar[] = []

  for (const lista of listas) {
    for (const lugar of lista) {
      const clave = `${lugar.tipo}|${normalizarTexto(lugar.nombre)}`
      if (vistos.has(clave)) continue
      vistos.add(clave)
      salida.push(lugar)
    }
  }

  return salida
}

/**
 * Saca de los barrios de la red los que ya aparecen en la cartera propia.
 *
 * Si el asesor tiene propiedades en Palermo, la fila que le sirve es la suya: dice
 * cuantas tiene el. Mostrar las dos, una arriba de la otra y con numeros distintos, se
 * lee como un error.
 */
export function sacarBarriosRepetidos(deLaRed: Lugar[], deLaCartera: Lugar[]): Lugar[] {
  const mios = new Set(deLaCartera.map((l) => normalizarTexto(l.nombre)))
  return deLaRed.filter((l) => !mios.has(normalizarTexto(l.nombre)))
}

// ───────────────────────────── precios que no son precios ─────────────────────────────

/**
 * Si el numero que trae la propiedad se puede mostrar como precio.
 *
 * La red de colaboracion recibe cargas de muchas inmobiliarias y algunas ponen un valor
 * de relleno. Contado sobre las 79.014 en venta y dolares el 2026-08-10:
 *
 *   price = 1        63      "US$ 1 · Departamento 370 m² · Arribeños 1500"
 *   price < 100      76
 *   100 a 1.000     112
 *   1.000 o mas  78.826   (el 99,76%)
 *
 * No son propiedades falsas: existen y hay que mostrarlas. Lo falso es el numero, y
 * mostrarlo hace que el asesor le pase a un cliente un precio que no existe. Van como
 * "Consultar", igual que las que directamente no traen precio.
 *
 * El corte depende de la operacion: en VENTA nada real cuesta menos de 1.000, pero un
 * ALQUILER de 500 dolares es de lo mas comun. Por eso ahi solo se descarta el 1 pelado.
 */
export function precioCreible(p: { price: number | null; status: string | null }): boolean {
  if (!p.price || p.price <= 1) return false
  if (p.status === "Venta" && p.price < 1000) return false
  return true
}
