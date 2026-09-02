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

/**
 * El número de versión leído de esa misma ruta. `null` si no se lo puede leer.
 *
 * Va PEGADO al que la arma, y con un test que las hace ida y vuelta, por la
 * lección más repetida de esta etapa: la forma del hueco estaba escrita a mano
 * en tres lugares y las tres discrepaban. Dos funciones que tienen que
 * coincidir viven juntas o terminan separándose.
 *
 * Se lee de la ruta y no de una consulta nueva a propósito: la ruta es **el
 * archivo que se está bajando**, así que el número no puede quedar desfasado
 * del contenido. Un `version_id` traído aparte podría, si alguien cambia el
 * orden de dos escrituras.
 */
export function versionDeLaRutaDelGenerado(path: string | null): number | null {
  if (!path) return null
  const m = /-v(\d+)\.docx$/i.exec(path)
  if (!m) return null
  const n = Number(m[1])
  return Number.isInteger(n) && n > 0 ? n : null
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
  docx_path: null
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
    /**
     * `docx_path` tambien, y es la quinta columna que se suma tarde.
     *
     * Apareció al arreglar lo que Leonardo encontró usando la app: el documento
     * GENERADO se guardaba y la pantalla seguía mostrando el que había subido
     * el director. Al hacer que la pantalla muestre el generado, esta columna
     * pasó a decidir QUÉ CONTRATO SE BAJA — y sin limpiarla acá, reemplazar el
     * .docx de una persona dejaba su `docx_path` viejo apuntando al generado de
     * la versión anterior: la pantalla mostraría ese contrato viejo como si
     * fuera el de su archivo nuevo.
     *
     * Es exactamente la misma familia que las otras cuatro, y por el mismo
     * motivo: una columna que sobrevive a un reemplazo se vuelve una afirmación
     * falsa sobre el archivo que la reemplazó.
     */
    docx_path: null,
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

// ---------------------------------------------------------------------------
// QUÉ ARCHIVO SE BAJA
// ---------------------------------------------------------------------------

/**
 * El documento de esa persona hoy: el GENERADO si ya se le aplicó una versión,
 * y si no, el que subió el director.
 *
 * ═══ Por qué esto existe, y por qué es de las cosas más caras de la etapa ═══
 *
 * Lo encontró Leonardo usando la app, no un test: subió la versión nueva, siguió
 * los pasos, el sistema le dijo que estaba todo bien —y estaba: los tres .docx
 * generados eran correctos, con la cláusula nueva, el encabezado, el pie y el
 * nombre de cada persona— y **los documentos que mostraba la pantalla seguían
 * siendo los viejos**. La pantalla bajaba `archivo_original_path`, que es el
 * archivo que el director subió, y nadie leía `docx_path`.
 *
 * O sea: la etapa entera generaba el documento, lo verificaba con cinco
 * comprobaciones y lo guardaba, y después **no lo mostraba**. Toda la
 * verificación miró el camino de escritura; nadie miró el de lectura.
 *
 * La regla es una línea, pero el nombre del archivo también cambia: el asesor
 * tiene que poder distinguir en su carpeta de Descargas el contrato nuevo del
 * que ya tenía.
 */
export function archivoQueSeBaja(doc: {
  archivo_original_path: string
  docx_path: string | null
  nombre_archivo: string
}): { path: string; nombre: string; esGenerado: boolean } {
  if (!doc.docx_path) {
    return { path: doc.archivo_original_path, nombre: doc.nombre_archivo, esGenerado: false }
  }
  return {
    path: doc.docx_path,
    nombre: nombreDelGenerado(doc.nombre_archivo, versionDeLaRutaDelGenerado(doc.docx_path)),
    esGenerado: true,
  }
}

/**
 * Cómo se llama el archivo generado cuando el asesor lo baja.
 *
 * Se le pega el sufijo ANTES de la extensión: "Acuerdo.docx" queda como
 * "Acuerdo - v2.docx", no como "Acuerdo.docx - v2", que no lo abre Word.
 *
 * ═══ Por qué el NÚMERO y no "actualizado" ═══
 *
 * La primera versión de esto decía "- actualizado", con el argumento de que el
 * asesor no sabe qué es una versión ni tiene por qué (spec §8.7). Lo corrigió
 * Leonardo con un caso que el argumento no cubría: **el asesor baja los dos a
 * la misma carpeta de Descargas.** Con "- actualizado", bajar después de la v2
 * y otra vez después de la v3 le deja dos archivos con el MISMO nombre, y el
 * navegador le agrega "(1)": no tiene forma de saber cuál es el último.
 *
 * El §8.7 dice que el asesor no ve la LISTA de plantillas ni el historial de
 * versiones, y eso se sigue cumpliendo. Un número en el nombre del archivo no
 * es el historial: es lo único que distingue dos descargas.
 *
 * El número sale de la RUTA del archivo que se está bajando, no de una
 * consulta aparte, así que no puede quedar desfasado del contenido. Si no se
 * puede leer, se cae a "actualizado" en vez de mentir con un número.
 */
export function nombreDelGenerado(nombreArchivo: string, version?: number | null): string {
  const limpio = nombreArchivo.trim()
  const sufijo = typeof version === "number" && version > 0 ? `v${version}` : "actualizado"
  const i = limpio.lastIndexOf(".")
  if (i <= 0) return `${limpio} - ${sufijo}`
  return `${limpio.slice(0, i)} - ${sufijo}${limpio.slice(i)}`
}
