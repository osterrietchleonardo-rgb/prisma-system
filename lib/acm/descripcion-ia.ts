// ─────────────────────────────────────────────────────────────────────────────
// ACM · Descripción que devuelve la IA de visión: extraerla del JSON estructurado
// que pide la Task 6, sanearle el formato y recortarla al tope de la ficha.
//
// El prompt real (app/api/acm/analizar-fotos/route.ts) le pide a Gemini un paso
// interno de "análisis visual previo" antes de redactar, y usa salida estructurada
// (responseMimeType: "application/json" + responseSchema con dos campos: `analisis`
// y `descripcion`) para que ese razonamiento tenga su propio lugar en vez de tener
// que colarse en el párrafo final. Este módulo YA NO adivina qué parte de un texto
// corrido es razonamiento y cuál es contenido: eso se intentó dos veces con regex
// sobre texto libre y falló en las dos direcciones a la vez (seguía filtrando
// andamiaje real —listas numeradas enteras, 2-3 oraciones de análisis cuando el
// modelo analiza más de una cosa— y borraba descripciones legítimas que arrancaban
// con palabras normales de un aviso inmobiliario como "análisis" o "como
// resultado"). La causa era estructural, no de implementación: mirando texto
// suelto hay que adivinar, y no hay punto medio entre "más agresivo" y "más
// suave". Con el campo `analisis` separado del `descripcion`, ya no hace falta
// adivinar nada acá — ver docs/superpowers/plans/2026-08-06-acm-zona-estricta-y-
// fotos-ia.md, bloque REDISEÑADO de la Task 4.
// ─────────────────────────────────────────────────────────────────────────────

/** Tope duro de lo que se guarda. El prompt pide 400-600; esto es el techo. */
export const MAX_DESC_IA = 700

/**
 * Parsea la respuesta JSON de Gemini (`{ analisis, descripcion }`) y devuelve
 * únicamente el campo `descripcion`. Si el JSON no parsea, si falta el campo o
 * si no es un string, devuelve "". A propósito NO intenta rescatar texto con
 * heurísticas (leer `analisis`, buscar algo que "parezca" la descripción,
 * etc.): ese rescate es exactamente el adivinar que este diseño elimina, y
 * volver a intentarlo llevaría de nuevo a las dos rondas de regex fallidas.
 * Vacío es una salida segura: el ACM nunca se bloquea por esto — el endpoint
 * lo trata como análisis fallido y "Buscar comparables" sigue funcionando.
 */
export function extraerDescripcion(crudo: string): string {
  if (!crudo) return ""
  try {
    // Gemini a veces envuelve el JSON en un cerco de markdown (```json ... ```)
    // aunque se pida responseMimeType: "application/json" — es una rareza conocida
    // del modelo. Esto es desenvolver un contenedor (estructural), no adivinar
    // contenido: si después de sacar el cerco sigue sin ser JSON válido, se
    // devuelve "" igual que siempre. No es el rescate baneado.
    const sinCerco = crudo.trim().replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "")
    const parseado = JSON.parse(sinCerco)
    return typeof parseado?.descripcion === "string" ? parseado.descripcion : ""
  } catch {
    return ""
  }
}

/**
 * Higiene de formato sobre un campo del que ya se sabe que es la descripción
 * (viene del campo `descripcion` del JSON estructurado, separado del
 * `analisis` por el propio prompt): saca restos de markdown y aplasta saltos
 * de línea y espacios repetidos en un solo párrafo. Sin reglas de andamiaje,
 * sin cortar por etiquetas, sin descartar párrafos — ya no hace falta
 * desconfiar del contenido, solo prolijarle el formato.
 */
export function sanearDescripcionIA(texto: string): string {
  if (!texto) return ""
  return texto
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/[*_]/g, "")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
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
