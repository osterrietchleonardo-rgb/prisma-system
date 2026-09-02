/**
 * Qué archivo se acepta cuando el asesor sube una foto propia para retocar.
 *
 * El caso es la propiedad que todavía NO está en Tokko: se mejora la foto acá y
 * después se sube la corregida a la ficha, una sola vez.
 *
 * La lista es más corta que la del proxy de fotos de la red
 * (`lib/acm/fotos-url.ts`): allá se trata de **servir** una imagen que ya existe,
 * acá de **editarla** con sharp. GIF y AVIF quedan afuera a propósito.
 */

/** Los tres que sharp lee sin binarios extra. */
const TIPOS_OK = new Set(["image/jpeg", "image/png", "image/webp"])

/** 15 MB. El navegador achica antes de subir, así que sobra: es una red, no el caso normal. */
export const TOPE_BYTES = 15 * 1024 * 1024

/**
 * Devuelve el mensaje de error, o `null` si el archivo sirve.
 *
 * Mensaje y no booleano porque el asesor tiene que entender qué hacer: "no se
 * puede" a secas lo deja tocando el botón de vuelta con el mismo archivo.
 */
export function validarFotoSubida({ tipo, bytes }: { tipo: string; bytes: number }): string | null {
  // Ojo: no alcanza con `startsWith("image/")`. `image/svg+xml` lo cumple y es
  // un vector con scripts adentro; `image/jpeg-evil` también. Va comparación
  // exacta contra la lista, después de sacarle los parámetros del tipo.
  const limpio = (tipo || "").split(";")[0].trim().toLowerCase()

  if (limpio === "image/heic" || limpio === "image/heif") {
    return "Esa foto está en formato HEIC (el del iPhone) y no la podemos abrir. Mandala como JPG."
  }
  if (!TIPOS_OK.has(limpio)) {
    return "Solo se pueden subir fotos JPG, PNG o WEBP."
  }
  if (bytes <= 0) {
    return "El archivo llegó vacío. Probá de nuevo."
  }
  if (bytes > TOPE_BYTES) {
    return `La foto pesa demasiado. El máximo es ${Math.round(TOPE_BYTES / 1024 / 1024)} MB.`
  }
  return null
}

/**
 * Dónde va la foto dentro del bucket `marketing-images`.
 *
 * Carpeta `subidas` aparte de las que salen de una ficha (esas van bajo el id de
 * Tokko): son las que no tienen propiedad todavía.
 */
export function nombreDeArchivo(userId: string): string {
  const unico = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return `fotos-ia/${userId}/subidas/${unico}.jpg`
}
