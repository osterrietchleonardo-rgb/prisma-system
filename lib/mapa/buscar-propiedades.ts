// Buscar dentro de una lista de propiedades YA traida (la del globito, la de un punto).
//
// Es un filtro de pantalla, no una consulta: no toca la base ni la red. Sirve para
// cuando el globito junta 90 propiedades y el asesor busca "juncal" o "3 amb" mientras
// el cliente espera del otro lado del telefono.
import { normalizarTexto } from "./lugares.ts"
import { tipoEnCastellano } from "./tipos-propiedad.ts"
import type { PropiedadMapa } from "./tipos.ts"

/**
 * Todo el texto por el que se puede encontrar una propiedad, junto y normalizado.
 *
 * Va el tipo EN CASTELLANO y no el crudo de la base: en pantalla dice "Departamento",
 * asi que buscar "departamento" tiene que encontrarlo, no "Apartment".
 *
 * El precio entra como numero pelado ("185000") y tambien con puntos ("185.000"), que es
 * como se ve en la lista: quien busca "185.000" copia lo que esta leyendo.
 */
function textoDe(p: PropiedadMapa): string {
  const partes = [
    p.title,
    p.address,
    p.city,
    tipoEnCastellano(p.property_type),
    (p as any).roomix_agency_name,
    p.agent_name,
    p.price ? String(p.price) : null,
    p.price ? p.price.toLocaleString("es-AR") : null,
    p.ambientes ? `${p.ambientes} amb ambientes` : null,
    p.bedrooms ? `${p.bedrooms} dorm dormitorios` : null,
    p.total_area ? `${p.total_area} m2 m²` : null,
  ]
  return normalizarTexto(partes.filter(Boolean).join(" "))
}

/**
 * Filtra por texto libre. Cada palabra tiene que aparecer en algun lado (Y, no O): con
 * "O" buscar "juncal 3" devolveria todo lo que tenga un 3 en cualquier parte, que es
 * casi todo.
 *
 * Sin busqueda devuelve la MISMA lista, no una copia: quien llama la compara por
 * identidad para saber si hace falta volver a dibujar.
 */
export function buscarEnPropiedades(propiedades: PropiedadMapa[], consulta: string): PropiedadMapa[] {
  const palabras = normalizarTexto(consulta).split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return propiedades

  return propiedades.filter((p) => {
    const texto = textoDe(p)
    return palabras.every((palabra) => texto.includes(palabra))
  })
}
