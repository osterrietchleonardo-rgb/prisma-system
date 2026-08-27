/**
 * La red de seguridad (spec §7.3): comparar el documento que sale de la
 * plantilla contra el archivo original de cada asesor.
 *
 * Por qué existe: meter `{{huecos}}` dentro de un .docx es la parte
 * arriesgada de todo esto. Word guarda el texto partido en *runs*, y un
 * "Juan Pérez" puede estar en tres pedazos; también puede pasar que el valor
 * de una persona aparezca en una cláusula fija y el reemplazo se lleve puesta
 * la cláusula. Cuando eso pase, tiene que fallar a los gritos, no en silencio:
 * lo que se guarda acá termina siendo el contrato que alguien firma.
 *
 * Vive en `lib/` y no adentro del endpoint porque los tests del repo solo
 * miran `lib/**`, y este archivo es EL que no puede estar mal: si compara de
 * más, bloquea plantillas que estaban bien; si compara de menos, deja pasar un
 * contrato con el dato de otra persona.
 */

// ---------------------------------------------------------------------------
// EL CRITERIO DE COMPARACIÓN
// ---------------------------------------------------------------------------

/**
 * ═══ Dónde está la línea, y por qué está justo ahí ═══
 *
 * La comparación NO es byte a byte, a propósito. Byte a byte da rojos falsos,
 * y un rojo falso es casi tan caro como un verde falso: bloquea una plantilla
 * que estaba bien y el director no tiene cómo desbloquearla.
 *
 * **Se ignora (no indica ninguna falla):**
 *
 *  1. **Cuánto espacio hay.** Dos espacios contra uno, una tabulación contra
 *     un espacio, un salto de línea de más, un párrafo vacío de más. No es una
 *     licencia: es una CONSECUENCIA de cómo detecta `lib/plantillas/deteccion.ts`.
 *     Esa detección compara con `diffWords`, que ignora los espacios; su
 *     `avanzarPorLoIgual` está escrito justo para dejar que "cada lado tenga
 *     los espacios que quiera". O sea: **un espacio de más en el contrato de
 *     un asesor nunca sale como hueco**, sale como texto fijo. Si acá se
 *     exigiera igualdad de espacios, ese asesor quedaría en rojo por algo que
 *     la detección decidió ignorar tres archivos antes — un rojo garantizado,
 *     sistemático, y sobre el que nadie puede hacer nada. Un contrato de Word
 *     con un espacio doble es lo más común que hay.
 *  2. **Espacios que no son el espacio común**: el duro (NBSP) que Word mete
 *     con Ctrl+Shift+Espacio, el fino, el angosto. Se leen igual y se escriben
 *     distinto.
 *  3. **Caracteres invisibles**: ancho cero, marca de orden de bytes, guión
 *     blando. No se ven, no se imprimen, no son dato.
 *  4. **La forma de las comillas y del apóstrofo**: las curvas que pone solo
 *     el autocorrector de Word ("" '') contra las rectas (" '). Es la misma
 *     comilla escrita por dos teclados distintos.
 *  5. **Cómo está armada la letra acentuada por dentro**: "ó" como un solo
 *     caracter o como "o" + tilde suelta. Se ven idénticas en pantalla.
 *
 * **NO se ignora (todo lo demás es diferencia de verdad):**
 *
 *  · Que un espacio EXISTA o no entre dos palabras. "Juan Pérez" contra
 *    "JuanPérez" es rojo. Se colapsan tandas de espacios; no se borran.
 *  · Las mayúsculas. "S.A." no es "s.a.".
 *  · Los guiones, puntos, comas, %, $, y cualquier signo que sea parte del
 *    dato. Un guión medio contra un guión corto en un CUIT queda en rojo, y
 *    está bien que quede: si esa diferencia estuviera en el texto fijo, el
 *    diff ya la habría convertido en hueco y se rellenaría sola. Que llegue
 *    hasta acá significa que algo no se reemplazó.
 *  · Cualquier letra o número. Obvio, y es lo único que de verdad se busca.
 *
 * La regla corta, para quien la tenga que tocar: **se ignora cómo se ve el
 * texto; no se ignora lo que dice.**
 *
 * Lo que esto NO alcanza a mirar, y hay que decirlo: `textoDeDocx` usa mammoth,
 * que devuelve el CUERPO del documento. Un dato que viva solo en el encabezado
 * o en el pie queda fuera de esta verificación aunque `ponerHuecosEnDocx` sí lo
 * haya tocado. El endpoint lo avisa por escrito en vez de fingir que revisó
 * todo el archivo.
 */

/**
 * Lo que no se ve ni se imprime: ancho cero, junta-palabras, marca de orden
 * de bytes, guión blando (el que Word mete para cortar una palabra al final
 * del renglón).
 *
 * Estos se BORRAN, no se cambian por un espacio: no ocupan lugar.
 *
 * Los espacios raros —el duro de Ctrl+Shift+Espacio, el fino, el angosto— NO
 * están en esta lista y no hace falta que estén: el `\s` de JavaScript ya los
 * incluye a todos, así que los colapsa el último paso. El de ancho cero es la
 * única excepción, y por eso sí figura acá. Que esto siga siendo cierto lo
 * vigila el test del espacio duro.
 */
const INVISIBLES = /[\u00ad\u200b\u200c\u200d\u2060\ufeff]/g

/** Las comillas dobles que pone el autocorrector, y sus primas. */
const COMILLAS_DOBLES = /[\u201c\u201d\u201e\u201f\u00ab\u00bb\u2033]/g

/** Las comillas simples y los apóstrofos curvos. */
const COMILLAS_SIMPLES = /[\u2018\u2019\u201a\u201b\u2032]/g

/**
 * Deja el texto en la forma en la que se lo compara.
 *
 * Exportada porque es EL criterio: un test que la ejercite es la única forma
 * de dejar fijado por escrito qué diferencia pasa y cuál no.
 */
export function normalizarParaComparar(texto: string): string {
  return texto
    /**
     * Primero la forma canónica de Unicode: junta la "o" con su tilde suelta
     * en una sola "ó". Va antes que todo lo demás porque cambia el largo del
     * texto, y todos los reemplazos de abajo son sobre caracteres sueltos.
     */
    .normalize("NFC")
    .replace(INVISIBLES, "")
    .replace(COMILLAS_DOBLES, '"')
    .replace(COMILLAS_SIMPLES, "'")
    /**
     * Toda tanda de espacios —incluidos los saltos de línea y las
     * tabulaciones— pasa a ser UN espacio. Un espacio, no ninguno: dos
     * palabras pegadas siguen siendo distintas de dos palabras separadas.
     */
    .replace(/\s+/g, " ")
    .trim()
}

// ---------------------------------------------------------------------------
// Comparar, y saber decir en qué se diferencian
// ---------------------------------------------------------------------------

/** Cuánto texto de cada lado se muestra en la observación. */
const LARGO_DE_LA_MUESTRA = 60

/** Cuánto texto anterior se muestra, para poder ubicar el lugar. */
const LARGO_DEL_ANTES = 40

export type Diferencia = {
  /** Lo que dice el archivo que subió el director. */
  enElOriginal: string
  /** Lo que diría el documento armado con la plantilla. */
  enElArmado: string
  /** El texto justo antes, para poder encontrar el lugar en el contrato. */
  antes: string
}

/** Recorta por el medio, para no volcar medio contrato en la observación. */
function muestra(texto: string): string {
  if (texto.length <= LARGO_DE_LA_MUESTRA) return texto
  return `${texto.slice(0, LARGO_DE_LA_MUESTRA)}…`
}

/**
 * La PRIMERA diferencia entre los dos textos, ya normalizados.
 *
 * Se recorta el prefijo y el sufijo comunes, y lo que queda en el medio es la
 * diferencia. No es un diff palabra por palabra a propósito: acá no hace falta
 * el detalle, hace falta que el director pueda ir al contrato, encontrar el
 * lugar y ver con sus ojos qué pasó.
 *
 * **Los bordes se estiran hasta el espacio más cercano, y eso no es un
 * adorno.** El recorte por caracteres es exacto pero ilegible: "María
 * González" contra "Juan Pérez" comparten la "ez" del final, así que el
 * recorte crudo le mostraba al director «María Gonzál» contra «Juan Pér».
 * Palabras cortadas por la mitad que él no puede buscar en su Word. Estirando
 * hasta el espacio, lee «María González,» contra «Juan Pérez,», que es lo que
 * puede ir a buscar.
 *
 * `null` cuando son iguales.
 */
export function primeraDiferencia(original: string, armado: string): Diferencia | null {
  if (original === armado) return null

  let prefijo = 0
  /**
   * El tope evita que el prefijo y el sufijo se pisen. Sin él, "aaa" contra
   * "aa" comparte "aa" por delante Y "aa" por detrás, los índices se cruzan y
   * el recorte del medio sale al revés.
   */
  const tope = Math.min(original.length, armado.length)
  while (prefijo < tope && original[prefijo] === armado[prefijo]) prefijo++

  let sufijo = 0
  while (
    sufijo < tope - prefijo &&
    original[original.length - 1 - sufijo] === armado[armado.length - 1 - sufijo]
  ) {
    sufijo++
  }

  // Hacia atrás hasta el principio de la palabra en la que cayó el corte.
  while (prefijo > 0 && !/\s/.test(original[prefijo - 1])) prefijo--

  /**
   * Y hacia adelante hasta el final de la palabra. Los dos lados avanzan
   * juntos —se achica el sufijo compartido, que es el mismo texto en ambos—,
   * así que no hace falta llevar dos cursores.
   */
  while (sufijo > 0 && !/\s/.test(original[original.length - sufijo])) sufijo--

  return {
    enElOriginal: muestra(original.slice(prefijo, original.length - sufijo)),
    enElArmado: muestra(armado.slice(prefijo, armado.length - sufijo)),
    antes: original.slice(Math.max(0, prefijo - LARGO_DEL_ANTES), prefijo),
  }
}

/** "(nada)" y no comillas vacías: un vacío entre comillas no se ve. */
const NADA = "(nada)"
const entreComillas = (texto: string) => (texto === "" ? NADA : `«${texto}»`)

export type Verificacion = {
  /** `true` ⇒ el documento armado dice lo mismo que el original. */
  coincide: boolean
  /** En castellano, qué no coincidió. `null` cuando coincide. */
  observacion: string | null
}

/**
 * El corazón de la red de seguridad: ¿el documento que saldría de la plantilla
 * dice lo mismo que el archivo que subió el director?
 *
 * `original` y `armado` son los dos textos crudos, tal como los devuelve
 * `textoDeDocx`. La normalización se hace acá adentro para que nadie pueda
 * comparar sin ella por olvidarse.
 *
 * La observación está escrita para el director, no para un programador: dice
 * dónde y qué, con el texto de alrededor, para que pueda abrir el Word y mirar.
 */
export function verificarContraElOriginal(original: string, armado: string): Verificacion {
  const a = normalizarParaComparar(original)
  const b = normalizarParaComparar(armado)

  const dif = primeraDiferencia(a, b)
  if (dif === null) return { coincide: true, observacion: null }

  const ubicacion = dif.antes.trim() === "" ? "Al principio del documento" : `Después de "…${dif.antes.trim()}"`

  return {
    coincide: false,
    observacion:
      `${ubicacion}, el archivo original dice ${entreComillas(dif.enElOriginal)} y el documento armado con la ` +
      `plantilla diría ${entreComillas(dif.enElArmado)}. Puede ser un campo que no se pudo marcar, uno que se ` +
      `borró al revisar, o un dato de esta persona que también aparece en una parte fija del contrato.`,
  }
}
