// ─────────────────────────────────────────────────────────────────────────────
// ACM · Saneado de la descripción que devuelve la IA de visión.
//
// El prompt real (app/api/acm/foto-ia/route.ts) le pide EXPLÍCITAMENTE al modelo
// un "Análisis visual previo" como paso interno antes de redactar, y recién
// después le pide que devuelva SOLO el párrafo final, sin encabezados ni
// prefijos como "Análisis:" o "Descripción:". O sea: el modelo va a razonar en
// su propia salida por diseño del prompt, y todo depende de que obedezca esa
// instrucción de formato — cosa que no hace siempre. Este texto va al cuadro
// que edita el asesor y de ahí a la ficha que se le imprime al cliente: este
// módulo es la única barrera entre ese razonamiento filtrado y lo que se ve.
//
// Estrategia (reescrita después de dos rondas de revisión que rompieron un
// enfoque de "enumerar marcadores de markdown" y de "etiqueta en cualquier
// parte del texto" — ninguno de los dos escala):
//   1) Normalizar el markdown ANTES de decidir nada, en una sola pasada: sacar
//      cercos/énfasis en cualquier posición y la decoración de arranque de
//      CADA línea (#, >, -, backtick, espacios), sea cual sea la combinación.
//      Un marcador nuevo que no se nos ocurrió deja de ser un agujero.
//   2) Una etiqueta (de andamiaje o de cierre) solo cuenta si arranca la línea
//      o el párrafo, nunca en medio de una oración — "...buena luz. Como
//      resultado: apto para invertir." es prosa real y no se toca.
//   3) Si un párrafo arranca con vocabulario de razonamiento, se descarta SOLO
//      la oración que lo contiene (hasta su punto de cierre) y se conserva lo
//      que sigue. Si no queda nada después de esa oración, el párrafo entero
//      era andamiaje: se descarta sin rescatar nada. Nunca se devuelve el
//      razonamiento como si fuera la descripción — vacío es una salida válida
//      (el ACM no se bloquea por esto; Task 6 lo trata como análisis fallido).
// ─────────────────────────────────────────────────────────────────────────────

/** Tope duro de lo que se guarda. El prompt pide 400-600; esto es el techo. */
export const MAX_DESC_IA = 700

/**
 * Vocabulario de razonamiento cuando arranca un párrafo (después de
 * normalizado el markdown). Nota: "observación/observaciones" NO está acá a
 * propósito — es una forma legítima de arrancar un dato real de la propiedad
 * (ej. "Observaciones: apto profesional, sin cochera."), no una palabra
 * reservada del prompt.
 */
const RE_ANDAMIAJE_INICIO = /^\s*(an[áa]lisis|paso\s*1|razonamiento)\b\s*:?\s*/i

/** Etiqueta de "acá empieza lo final", válida solo si arranca el párrafo. */
const RE_ETIQUETA_INICIO = /^\s*(descripci[óo]n(?:\s+final)?|texto\s*final|resultado)\b\s*:?\s*/i

/**
 * Deja el texto en una forma canónica antes de evaluar nada: saca cercos de
 * markdown y énfasis (```, *, _) en cualquier posición, y la decoración de
 * arranque de cada línea (encabezados #, citas >, viñetas -, backticks
 * sueltos, espacios), sea cual sea la combinación. Normalizar así —en vez de
 * enumerar "## ", "**" o "_" como casos separados— es lo que evita que un
 * marcador nuevo rompa el saneado en la próxima vuelta.
 */
function normalizarMarkdown(texto: string): string {
  const sinCercosNiEnfasis = texto.replace(/```[a-z]*\n?/gi, "").replace(/[*_]/g, "")

  return sinCercosNiEnfasis
    .split("\n")
    .map((linea) => linea.replace(/^[\s#>`-]+/, ""))
    .join("\n")
}

/**
 * Un párrafo que arranca con vocabulario de razonamiento puede seguir, en la
 * misma oración o en las siguientes, con la descripción real: el modelo no
 * siempre la separa con una segunda etiqueta (el prompt le prohíbe imprimir
 * cualquier prefijo, así que la forma más común de desobedecer es filtrar el
 * "Análisis:" y seguir derecho, sin rotular nada más). Se descarta únicamente
 * la primera oración —la que contiene el andamiaje— y se conserva lo que
 * sigue. Si no queda nada después de esa oración, todo el párrafo era
 * razonamiento: se devuelve vacío, nunca el razonamiento tal cual.
 */
function sacarClausulaAndamiaje(parrafo: string): string {
  const marcador = RE_ANDAMIAJE_INICIO.exec(parrafo)
  if (!marcador) return parrafo

  const resto = parrafo.slice(marcador[0].length)
  const finOracion = resto.search(/[.!?](\s+|$)/)
  if (finOracion === -1) return "" // era una sola oración de andamiaje, sin nada más

  const puntuacion = resto.slice(finOracion).match(/^[.!?]\s*/)
  const avance = finOracion + (puntuacion ? puntuacion[0].length : 1)
  return resto.slice(avance).trim()
}

export function sanearDescripcionIA(texto: string): string {
  if (!texto) return ""

  const normalizado = normalizarMarkdown(texto)

  const parrafos = normalizado.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  const limpios = parrafos
    .map((p) => (RE_ANDAMIAJE_INICIO.test(p) ? sacarClausulaAndamiaje(p) : p))
    .map((p) => p.replace(RE_ETIQUETA_INICIO, "").trim())
    .filter(Boolean)

  const t = limpios.join(" ")

  return t.replace(/\s*\n\s*/g, " ").replace(/\s{2,}/g, " ").trim()
}

/** Recorta sin cortar palabras. Si no hay espacio antes del tope, corta duro. */
export function recortarAPalabra(texto: string, max: number = MAX_DESC_IA): string {
  if (!texto || texto.length <= max) return texto
  const cortado = texto.slice(0, max)
  const ultimo = cortado.lastIndexOf(" ")
  const recortado = ultimo > 0 ? cortado.slice(0, ultimo) : cortado
  // Si el corte deja colgando una coma, un guion o dos puntos (el texto seguía
  // y acá se cortó a la fuerza), sacarlo: "...amplio," queda roto en la hoja.
  return recortado.replace(/[,;:\-–—\s]+$/, "")
}
