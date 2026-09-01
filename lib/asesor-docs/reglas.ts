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

/**
 * Dónde vive el `.docx` que PRISMA le GENERA a un asesor con una versión de la
 * plantilla (spec §8.4, columna `docx_path`).
 *
 * ═══ Por qué esto NO puede pisar `archivo_original_path` ═══
 *
 * `archivo_original_path` es el `.docx` que subió el director, y es la única
 * fuente de verdad contra la que compara toda la verificación de esta etapa. Si
 * el generado lo pisara, la próxima comprobación compararía la plantilla contra
 * un archivo que salió de la plantilla misma: **daría verde siempre, contra
 * cualquier error**. Es exactamente la razón por la que la columna `docx_path`
 * existe aparte.
 *
 * Por eso el generado vive en su propia carpeta —`plantillas/generados/`— y no
 * en `plantillas/`, que es la que devuelve `rutaDeArchivo`. Con la carpeta de
 * por medio, pisarlo es imposible aunque los ids coincidan; hay un test que lo
 * mide comparando las dos rutas con los MISMOS argumentos.
 *
 * El número de versión va en el nombre a propósito: una versión anterior no se
 * borra nunca (spec §7.4), así que su documento generado tampoco. Y hace que
 * reintentar la misma aplicación escriba encima del mismo archivo en vez de
 * dejar un huérfano nuevo por intento.
 */
export function rutaDelDocumentoGenerado(
  agencyId: string,
  advisorId: string,
  documentId: string,
  version: number,
): string {
  return `asesores/${agencyId}/${advisorId}/plantillas/generados/${documentId}-v${version}.docx`
}

// ---------------------------------------------------------------------------
// EL .docx DE UNA VERSIÓN NUEVA DE PLANTILLA, Y SU GUARDA
// ---------------------------------------------------------------------------

/**
 * La carpeta donde el navegador deja el .docx de una versión nueva antes de
 * pedirle al servidor que la lea (spec §7.4).
 *
 * ═══ Por qué es una carpeta aparte y no cualquier ruta de la agencia ═══
 *
 * Acá la ruta la manda el CLIENTE, y eso no es lo que hace el resto de la
 * Etapa C: `detectar-plantilla` baja rutas que salen **de la base**, ya
 * filtradas por agencia. Una ruta que llega por HTTP la escribe cualquiera.
 *
 * Y el bucket `documents` es **público**. Sin guarda, una ruta
 * `asesores/{otra_agencia}/…` se bajaría igual y el contrato ajeno saldría en
 * texto plano adentro de la vista previa: una fuga entre inmobiliarias, con el
 * cliente real en el mismo bucket.
 *
 * La carpeta propia hace además que **borrar el archivo sea seguro**. El
 * servidor lo borra apenas lo lee, para no dejar huérfanos legibles por URL en
 * un bucket público; si la ruta pudiera ser cualquiera de la agencia, ese mismo
 * borrado podría llevarse puesto el .docx original de un asesor, que es la
 * única fuente de verdad contra la que compara toda la verificación.
 */
export function carpetaDeVersionesNuevas(agencyId: string): string {
  return `asesores/${agencyId}/_versiones-nuevas/`
}

/** Dónde sube el navegador el .docx de la versión nueva. El `id` lo genera él. */
export function rutaDeVersionNueva(agencyId: string, id: string): string {
  return `${carpetaDeVersionesNuevas(agencyId)}${id}.docx`
}

/**
 * Lo que puede tener el nombre del archivo, y nada más.
 *
 * **No hay barra**, y eso es lo que hace que `..` no pueda llegar a ninguna
 * parte: sin separador no hay nivel al que subir. Se prohíbe igual más abajo,
 * porque una defensa que depende de leer bien un alfabeto es una defensa que se
 * rompe el día que alguien le agrega un carácter al alfabeto.
 */
const NOMBRE_DE_VERSION_NUEVA = /^[A-Za-z0-9][A-Za-z0-9._-]*\.docx$/i

/**
 * Valida la ruta que mandó el navegador contra el `agency_id` **de la sesión**.
 *
 * El `agencyId` NUNCA puede venir del cuerpo del pedido: si viniera, la guarda
 * sería el propio atacante diciendo contra qué compararse. El 27-ago-2026 se
 * cerró en producción un agujero por confiar en un dato de autoridad que venía
 * del navegador.
 */
export function validarRutaDeVersionNueva(
  path: unknown,
  agencyId: string,
): { ok: true; path: string } | { ok: false; error: string } {
  if (typeof path !== "string" || path.trim() === "") {
    return { ok: false, error: "Falta el archivo de la versión nueva" }
  }
  /**
   * Sin recortar espacios: se valida EXACTAMENTE lo que después se va a bajar y
   * a borrar. Recortar acá dejaría una ruta validada distinta de la usada, que
   * es la forma clásica de que una guarda mire una cosa y el sistema use otra.
   */
  if (path.length > 512) {
    return { ok: false, error: "La ruta del archivo es demasiado larga" }
  }
  const rechazo = { ok: false as const, error: "Esa ruta de archivo no es válida" }

  // Barras invertidas, caracteres de control y el escapado de URL: nada de eso
  // tiene por qué estar en la clave de un archivo, y todos sirven para disfrazar.
  if (/[\\%\u0000-\u001f\u007f]/.test(path)) return rechazo
  if (path.startsWith("/")) return rechazo
  if (path.includes("..")) return rechazo

  const carpeta = carpetaDeVersionesNuevas(agencyId)
  if (!path.startsWith(carpeta)) {
    return {
      ok: false,
      error:
        "Ese archivo no es de tu inmobiliaria. Subí el .docx de la versión nueva desde esta misma pantalla y " +
        "volvé a intentar.",
    }
  }

  const nombre = path.slice(carpeta.length)
  if (!NOMBRE_DE_VERSION_NUEVA.test(nombre)) {
    return {
      ok: false,
      error: "El archivo tiene que ser un .docx de Word. Un PDF no se puede convertir en plantilla.",
    }
  }

  return { ok: true, path }
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
