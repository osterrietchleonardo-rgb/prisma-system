// Que tipos de propiedad se pueden elegir en el mapa, y a que valores REALES
// corresponden en cada una de las dos fuentes.
//
// POR QUE HACE FALTA TRADUCIR
// Las dos tablas tienen taxonomias distintas, y ninguna coincide con las etiquetas que
// tenia el desplegable antes ("PH", "Local Comercial", "Cochera" y "Galpon" no existen
// en ninguna de las dos). Contado en la base el 2026-08-06:
//
//   cartera (properties, 459 activas)
//     Departamento 278 · Casa 84 · Lote 49 · Condo 19 · Bussiness Premises 11 ·
//     Oficina 7 · Hotel 3 · Weekend House 3 · Garage 3 · Warehouse 1 ·
//     Commercial Building 1
//
//   colaboracion (roomix_properties, 74.413 activas)
//     Apartment 51.343 · House 11.357 · Accommodation 11.193
//
// POR QUE LAS OPCIONES SON GRUESAS
// La red de colaboracion solo distingue TRES canastas, y "Accommodation" es el cajon
// de sastre: promedia 0,8 ambientes y sus titulos hablan de locales, oficinas y
// galpones. Ofrecer "Cochera" cuando la red no sabe que es una cochera seria prometer
// en pantalla algo que la base no puede cumplir. Estas cuatro opciones son la
// granularidad real que se puede comparar entre cartera y colaboracion.
//
// "Casa / PH" incluye los PH a proposito: la red los mete adentro de House (hay
// titulos como "PH 3 Ambientes + Quincho" clasificados asi).

export interface TipoMapa {
  /** Lo que viaja por la URL y se guarda en las zonas. Estable, no cambia con el texto. */
  valor: string
  /** Lo que ve el usuario. */
  etiqueta: string
  /** Valores de properties.property_type. Vacio = la cartera no distingue este tipo. */
  cartera: string[]
  /** Valores de roomix_properties.property_type. Vacio = la red no distingue este tipo. */
  colaboracion: string[]
}

export const TIPOS_MAPA: TipoMapa[] = [
  {
    valor: "departamento",
    etiqueta: "Departamento",
    cartera: ["Departamento", "Condo"],
    colaboracion: ["Apartment"],
  },
  {
    valor: "casa",
    etiqueta: "Casa / PH",
    cartera: ["Casa", "Weekend House"],
    colaboracion: ["House"],
  },
  {
    valor: "comercial",
    etiqueta: "Comercial y otros",
    cartera: ["Bussiness Premises", "Commercial Building", "Oficina", "Warehouse", "Garage", "Hotel"],
    colaboracion: ["Accommodation"],
  },
  {
    // La red no tiene canasta para los lotes: solo aparecen los de la cartera propia.
    valor: "lote",
    etiqueta: "Lote / Terreno",
    cartera: ["Lote"],
    colaboracion: [],
  },
]

/**
 * Como se dice en castellano un valor crudo de la base.
 *
 * Las dos tablas guardan los tipos en ingles a medias ("Apartment", "Accommodation",
 * "Bussiness Premises" con doble s, tal como los manda Tokko). En la lista del mapa
 * eso se leia literal y quedaba "Apartment · 1 amb. · 50 m2".
 */
const EN_CASTELLANO: Record<string, string> = {
  // red de colaboracion
  Apartment: "Departamento",
  House: "Casa / PH",
  Accommodation: "Comercial y otros",
  // cartera propia
  Condo: "Departamento",
  "Weekend House": "Casa de fin de semana",
  "Bussiness Premises": "Local comercial",
  "Commercial Building": "Edificio comercial",
  Warehouse: "Galpón",
  Garage: "Cochera",
  Lote: "Lote / Terreno",
}

export function tipoEnCastellano(valorDeLaBase: string | null | undefined): string {
  if (!valorDeLaBase) return ""
  // Los que ya vienen en castellano (Departamento, Casa, Oficina, Hotel) pasan derecho.
  return EN_CASTELLANO[valorDeLaBase] ?? valorDeLaBase
}

export function esTipoValido(v: string): boolean {
  return TIPOS_MAPA.some((t) => t.valor === v)
}

export function etiquetaDeTipo(valor: string | null): string | null {
  return TIPOS_MAPA.find((t) => t.valor === valor)?.etiqueta ?? null
}

/**
 * Los valores de base que le corresponden a una fuente.
 *
 *   null  = no hay filtro de tipo, se trae todo.
 *   []    = la fuente NO distingue el tipo elegido. Quien llama tiene que saltear la
 *           consulta: pedirla obligaria a la base a recorrer el rectangulo entero para
 *           terminar devolviendo cero (medido: 16.439 ms y statement timeout).
 */
export function valoresDeTipo(
  valor: string | null,
  fuente: "cartera" | "colaboracion",
): string[] | null {
  if (!valor) return null
  const tipo = TIPOS_MAPA.find((t) => t.valor === valor)
  // Un valor inventado en la URL se trata como "sin filtro", no como "sin resultados":
  // dejar el mapa vacio sin explicacion es peor que ignorar el parametro.
  if (!tipo) return null
  return tipo[fuente]
}
