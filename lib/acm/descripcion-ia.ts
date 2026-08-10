// ─────────────────────────────────────────────────────────────────────────────
// ACM · Saneado de la descripción que devuelve la IA de visión.
//
// El prompt le pide al modelo que observe primero (luminosidad, conservación,
// distribución) y recién después redacte, pero que devuelva SOLO el párrafo final.
// Los modelos filtran ese andamiaje con bastante frecuencia, y este texto va al
// cuadro que edita el asesor y de ahí puede ir a la ficha del cliente. Esto es la
// red de seguridad: si el análisis previo sale impreso, se descarta acá.
// ─────────────────────────────────────────────────────────────────────────────

/** Tope duro de lo que se guarda. El prompt pide 400-600; esto es el techo. */
export const MAX_DESC_IA = 700

/** Párrafos que son andamiaje del prompt, no la descripción. */
const RE_ANDAMIAJE = /^\s*(an[áa]lisis|observaci[óo]n(es)?|paso\s*1|razonamiento)\b/i
/** Etiqueta que a veces precede al texto bueno. */
const RE_ETIQUETA = /^\s*(descripci[óo]n|texto\s*final|resultado)\s*:\s*/i

export function sanearDescripcionIA(texto: string): string {
  if (!texto) return ""

  // 1) Cercos de markdown (```...``` o ```md ... ```).
  let t = texto.replace(/^\s*```[a-z]*\s*/i, "").replace(/\s*```\s*$/, "")

  // 2) Descartar los párrafos que son el análisis previo.
  const parrafos = t.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  const utiles = parrafos.filter((p) => !RE_ANDAMIAJE.test(p))

  // Si TODO parecía andamiaje, nos quedamos con el último párrafo: es preferible
  // devolver algo editable a devolver vacío.
  t = (utiles.length ? utiles : parrafos.slice(-1)).join(" ")

  // 3) Sacar la etiqueta del texto bueno, y aplastar saltos y espacios repetidos.
  return t.replace(RE_ETIQUETA, "").replace(/\s*\n\s*/g, " ").replace(/\s{2,}/g, " ").trim()
}

/** Recorta sin cortar palabras. Si no hay espacio antes del tope, corta duro. */
export function recortarAPalabra(texto: string, max: number = MAX_DESC_IA): string {
  if (!texto || texto.length <= max) return texto
  const cortado = texto.slice(0, max)
  const ultimo = cortado.lastIndexOf(" ")
  return (ultimo > 0 ? cortado.slice(0, ultimo) : cortado).trimEnd()
}
