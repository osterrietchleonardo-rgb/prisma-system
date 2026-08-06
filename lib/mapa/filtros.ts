// Lee los filtros del mapa desde la URL. Todo valor raro cae en un default sano:
// el mapa nunca tiene que romperse ni quedar vacio por un parametro mal escrito.
import { esTipoValido } from "./tipos-propiedad.ts"
import type { FiltrosMapa, FuenteMapa } from "./tipos.ts"

const FUENTES_VALIDAS: FuenteMapa[] = ["own", "agency", "roomix"]

/** Number("") es 0 y Number("hola") es NaN: los dos tienen que dar null, no un filtro fantasma. */
function numeroOpcional(v: string | null): number | null {
  if (v === null || v.trim() === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
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

  return {
    operacion,
    moneda,
    tipo: tipo && esTipoValido(tipo) ? tipo : null,
    precio_min: numeroOpcional(sp.get("precio_min")),
    precio_max: numeroOpcional(sp.get("precio_max")),
    ambientes_min: numeroOpcional(sp.get("ambientes_min")),
    // Sin fuentes el mapa quedaria vacio sin explicacion: se vuelve a las tres.
    fuentes: pedidas.length > 0 ? pedidas : [...FUENTES_VALIDAS],
  }
}
