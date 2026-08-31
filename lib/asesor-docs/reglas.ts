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

/** Lo que se sabe del archivo nuevo cuando el director reemplaza uno viejo. */
export type ArchivoDeReemplazo = {
  nombreArchivo: string
  /** La ruta dentro del bucket, la que devuelve `rutaDeArchivo`. */
  path: string
  sizeBytes: number
  /** El momento del reemplazo, en ISO. Entra por parámetro para poder probarlo. */
  ahora: string
}

/**
 * Qué se escribe en `advisor_documents` cuando el director REEMPLAZA el .docx
 * de un asesor por otro.
 *
 * Vive acá, y no adentro de la pantalla, por el motivo de siempre: ningún test
 * del repo mira los `.tsx`. Y esto no es cosmético — es la constancia de que el
 * documento se comparó contra la plantilla.
 *
 * LAS CUATRO EN NULL, que es todo el asunto de esta función:
 *
 *  · `version_id` es contra qué versión se comparó,
 *  · `form_data` son los datos que se le sacaron al archivo,
 *  · `estado` es si dio bien o hay que revisarlo,
 *  · `observacion` es por qué.
 *
 * Las cuatro hablan del archivo VIEJO. Si se dejan pegadas al archivo nuevo, la
 * fila queda diciendo `estado='ok'` contra la versión vigente —o sea:
 * "comprobado, todo bien"— sobre un archivo que nadie miró nunca. La solapa lo
 * lee así y la explicación del estado dice "Está en uso: es la versión
 * confirmada", sin un solo aviso. Eso es peor que no tener constancia: es una
 * constancia falsa, y el resto de la red de esta etapa se apoya en que
 * `version_id` distinto de la vigente sea la señal de "a este no lo comparó
 * nadie". Este camino, sin las cuatro en null, las desincroniza.
 *
 * Con las cuatro en null el asesor vuelve al balde de "sin comparar", que es la
 * verdad: su documento nuevo no se comparó contra nada.
 *
 * (Lo dejó anticipado por escrito la Etapa B, en el `UPDATE` de
 * `DocumentosDelAsesor.tsx`: "apenas la C empiece a llenarlos con datos
 * extraídos del archivo, este UPDATE tiene que limpiarlos también".)
 *
 * El `INSERT` de la primera subida NO necesita nada de esto: no escribe esas
 * cuatro columnas y la tabla las crea en null (`20260826120000_documentos_por_
 * asesor.sql` las declara sin DEFAULT).
 */
export function camposDelReemplazo(nuevo: ArchivoDeReemplazo): {
  nombre_archivo: string
  archivo_original_path: string
  size_bytes: number
  updated_at: string
  version_id: null
  form_data: null
  estado: null
  observacion: null
} {
  return {
    nombre_archivo: nuevo.nombreArchivo,
    archivo_original_path: nuevo.path,
    size_bytes: nuevo.sizeBytes,
    updated_at: nuevo.ahora,
    version_id: null,
    form_data: null,
    estado: null,
    observacion: null,
  }
}

/** El nombre del archivo sin la extensión, para mostrar en pantalla. */
export function nombreVisible(nombreArchivo: string): string {
  const limpio = nombreArchivo.trim()
  const i = limpio.lastIndexOf(".")
  return i > 0 ? limpio.slice(0, i) : limpio
}

/**
 * Escapa un texto para usarlo dentro de un patrón `ilike` de Postgres.
 *
 * `%` y `_` son comodines de LIKE/ILIKE (cualquier cadena, y un carácter
 * cualquiera). Si el nombre de un tipo de documento los trae tal cual —
 * "Contrato_2026" es un nombre perfectamente normal—, la búsqueda deja de
 * ser "busco ese texto" y pasa a ser "busco ese patrón": "Contrato_2026"
 * podría matchear "ContratoX2026" y devolver el id de un tipo distinto, con
 * el documento archivándose bajo el tipo equivocado.
 *
 * Postgres usa `\` como carácter de escape por defecto en LIKE/ILIKE (no
 * hace falta pasar `ESCAPE`), así que anteponer `\` a `\`, `%` y `_` alcanza
 * para que el texto se busque literal. Es reemplazo de caracteres, igual
 * que el saneo de `urlDeDescarga` en `url.ts` — mismo motivo: se está
 * escapando para un lenguaje de patrones, no codificando para una URL.
 */
export function escaparComodinesIlike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`)
}
