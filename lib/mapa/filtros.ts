// Lee los filtros del mapa desde la URL. Todo valor raro cae en un default sano:
// el mapa nunca tiene que romperse ni quedar vacio por un parametro mal escrito.
import { esTipoValido } from "./tipos-propiedad.ts"
import type { FiltrosMapa, FuenteMapa } from "./tipos.ts"

const FUENTES_VALIDAS: FuenteMapa[] = ["own", "agency", "roomix"]

/**
 * El ultimo boton de ambientes, que ademas significa "o mas".
 *
 * Cinco y no diez: sobre las 178.351 propiedades ubicadas de la red, arriba de 5 ambientes
 * queda el 8,1%, repartido en una cola larga de 6, 7, 8… (medido el 2026-08-14). Un boton
 * por numero hasta el 10 llenaria la barra de botones que casi nunca traen nada; juntarlos
 * en un "5+" deja ese 8,1% junto con el 8,3% que tiene exactamente 5.
 */
export const AMBIENTES_TOPE = 5

/** Number("") es 0 y Number("hola") es NaN: los dos tienen que dar null, no un filtro fantasma. */
function numeroOpcional(v: string | null): number | null {
  if (v === null || v.trim() === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * "2,3" -> [2, 3]. Ordenados, sin repetidos y solo del 1 al AMBIENTES_TOPE: lo que no sea
 * un boton de la pantalla se tira. Un "0" o un "99" colados a mano no tienen que poder
 * dejar el mapa vacio ni hacer una consulta que no significa nada.
 */
function leerAmbientes(v: string | null): number[] {
  if (!v) return []
  const vistos = new Set<number>()
  for (const trozo of v.split(",")) {
    const n = Number(trozo.trim())
    if (Number.isInteger(n) && n >= 1 && n <= AMBIENTES_TOPE) vistos.add(n)
  }
  return [...vistos].sort((a, b) => a - b)
}

export function leerFiltros(sp: URLSearchParams): FiltrosMapa {
  const operacion = sp.get("operacion") === "Alquiler" ? "Alquiler" : "Venta"
  const moneda = sp.get("moneda") === "ARS" ? "ARS" : "USD"

  const pedidas = (sp.get("fuentes") || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is FuenteMapa => (FUENTES_VALIDAS as string[]).includes(s))

  // Un tipo que no esta en la lista se ignora en vez de filtrar por el: antes se pasaba
  // tal cual a la consulta y, al no coincidir con ningun valor de la base, el mapa
  // quedaba vacio despues de 16 segundos de espera (ver tipos-propiedad.ts).
  const tipo = sp.get("tipo")?.trim()
  const barrio = sp.get("barrio")?.trim()

  return {
    operacion,
    moneda,
    tipo: tipo && esTipoValido(tipo) ? tipo : null,
    precio_min: numeroOpcional(sp.get("precio_min")),
    precio_max: numeroOpcional(sp.get("precio_max")),
    ambientes: leerAmbientes(sp.get("ambientes")),
    // Sin fuentes el mapa quedaria vacio sin explicacion: se vuelve a las tres.
    fuentes: pedidas.length > 0 ? pedidas : [...FUENTES_VALIDAS],
    // A diferencia del tipo, aca no hay lista blanca posible: son 2.009 barrios y crecen
    // con cada sync. Un nombre inventado simplemente no coincide con ninguno y el mapa
    // queda vacio, que es la respuesta correcta a "mostrame Barrio Inexistente".
    barrio: barrio || null,
  }
}
