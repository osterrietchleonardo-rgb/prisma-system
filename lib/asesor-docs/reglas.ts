/**
 * Las reglas de los documentos de un asesor, en funciones puras.
 *
 * Viven acá y no adentro de la pantalla porque las usan los dos lados —el panel
 * del director y la vista del asesor— y porque son exactamente el tipo de regla
 * que se escribe distinto en cada lugar si se deja suelta.
 */

export type Seccion = "plantilla" | "info"

export type ArchivoAceptado = { ok: true; extension: string }
export type ArchivoRechazado = { ok: false; error: string }

/** 25 MB, el mismo tope que ya usa el módulo de contratos. */
export const MAX_BYTES = 25 * 1024 * 1024

/**
 * Qué entra en cada sección.
 *
 * En "plantilla" solo `.docx`: son los documentos que la Etapa C va a rellenar
 * solos, y para eso hay que poder abrir el archivo por dentro. El `.doc` viejo
 * es un formato binario cerrado y no sirve.
 *
 * En "info" entra `.doc` también, porque ahí no se rellena nada: se sube y se baja.
 */
const EXTENSIONES: Record<Seccion, string[]> = {
  plantilla: ["docx"],
  info: ["docx", "doc", "pdf"],
}

function extensionDe(nombre: string): string | null {
  const limpio = nombre.trim()
  const i = limpio.lastIndexOf(".")
  if (i <= 0 || i === limpio.length - 1) return null
  return limpio.slice(i + 1).toLowerCase()
}

function formatearMB(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(0)
}

export function validarArchivo(
  nombre: string,
  tamanoBytes: number,
  seccion: Seccion
): ArchivoAceptado | ArchivoRechazado {
  if (tamanoBytes <= 0) {
    return { ok: false, error: "El archivo está vacío" }
  }
  if (tamanoBytes > MAX_BYTES) {
    return {
      ok: false,
      error: `El archivo pesa más de ${formatearMB(MAX_BYTES)} MB, que es el máximo`,
    }
  }

  const ext = extensionDe(nombre)
  if (!ext) {
    return { ok: false, error: "El archivo no tiene extensión, así que no se puede saber qué es" }
  }

  if (EXTENSIONES[seccion].includes(ext)) {
    return { ok: true, extension: ext }
  }

  // El .doc en plantillas es el caso frecuente y merece decir qué hacer.
  if (seccion === "plantilla" && ext === "doc") {
    return {
      ok: false,
      error:
        "Los archivos .doc son de una versión vieja de Word y no se pueden completar solos. " +
        "Abrilo en Word y usá Guardar como → Documento de Word (.docx).",
    }
  }

  if (seccion === "plantilla") {
    return { ok: false, error: "En esta sección solo entran documentos de Word (.docx)" }
  }
  return { ok: false, error: "Acá solo entran documentos de Word (.docx, .doc) o PDF" }
}

/**
 * Dónde vive el archivo dentro del bucket.
 *
 * La ruta se arma con el id de la fila, NUNCA con el nombre que puso el usuario:
 * ese nombre puede traer acentos, espacios, barras, o repetirse entre asesores.
 * El nombre lindo se guarda aparte, en la base, para mostrarlo y para la descarga.
 */
export function rutaDeArchivo(
  agencyId: string,
  advisorId: string,
  seccion: Seccion,
  id: string,
  extension: string
): string {
  const carpeta = seccion === "plantilla" ? "plantillas" : "info"
  return `asesores/${agencyId}/${advisorId}/${carpeta}/${id}.${extension}`
}

/** El nombre del archivo sin la extensión, para mostrar en pantalla. */
export function nombreVisible(nombreArchivo: string): string {
  const limpio = nombreArchivo.trim()
  const i = limpio.lastIndexOf(".")
  return i > 0 ? limpio.slice(0, i) : limpio
}
