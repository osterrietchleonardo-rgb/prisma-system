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
// ─────────────────────────────────────────────────────────────────────────────

/** Tope duro de lo que se guarda. El prompt pide 400-600; esto es el techo. */
export const MAX_DESC_IA = 700

/**
 * Párrafos que son andamiaje del prompt (el paso de razonamiento), no la
 * descripción en sí. Nota: "observación/observaciones" NO está acá a propósito
 * — es una forma legítima de arrancar un dato real de la propiedad (ej.
 * "Observaciones: apto profesional, sin cochera."), no una palabra reservada.
 */
const RE_ANDAMIAJE = /^\s*(an[áa]lisis|paso\s*1|razonamiento)\b/i

/**
 * Etiqueta de "acá empieza lo final" (Descripción, Descripción final, Texto
 * final, Resultado), buscada en CUALQUIER punto del texto, no solo al arranque
 * de un párrafo. El modelo suele mezclar el análisis y la descripción en la
 * misma prosa corrida —sin línea en blanco que las separe—, así que buscar la
 * etiqueta solo al inicio del string no alcanza para cortar el razonamiento
 * previo. Con flag global para poder tomar la ÚLTIMA aparición.
 */
const RE_ETIQUETA_FINAL = /\b(descripci[óo]n(?:\s+final)?|texto\s*final|resultado)\s*:\s*/gi

export function sanearDescripcionIA(texto: string): string {
  if (!texto) return ""

  // 1) Cercos de markdown y énfasis (```, **, __) en cualquier posición del
  // texto, no solo pegados al borde: el modelo a veces le mete markdown a la
  // etiqueta ("**Análisis:**") aunque el prompt pide texto plano, y un cerco
  // que no arranca en la primera línea (por texto previo) igual hay que sacarlo.
  let t = texto.replace(/```[a-z]*\n?/gi, "").replace(/\*+/g, "").replace(/__/g, "")

  // 2) Si en algún punto aparece una etiqueta de cierre, nos quedamos con todo
  // lo que viene DESPUÉS de la ÚLTIMA: así se descarta el análisis previo esté
  // en su propio párrafo o mezclado en la misma prosa que la descripción real.
  const etiquetas = [...t.matchAll(RE_ETIQUETA_FINAL)]
  if (etiquetas.length) {
    const ultima = etiquetas[etiquetas.length - 1]
    t = t.slice((ultima.index ?? 0) + ultima[0].length)
  }

  // 3) Red de seguridad estructural para cuando NO hubo etiqueta explícita:
  // descartar los párrafos que arrancan con vocabulario de razonamiento.
  const parrafos = t.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  const utiles = parrafos.filter((p) => !RE_ANDAMIAJE.test(p))

  // Si TODO parecía andamiaje, nos quedamos con el último párrafo: es preferible
  // devolver algo editable a devolver vacío.
  t = (utiles.length ? utiles : parrafos.slice(-1)).join(" ")

  // 4) Aplastar saltos de línea y espacios repetidos.
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
