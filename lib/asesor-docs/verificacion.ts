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
 * Vive en `lib/` y no adentro del endpoint porque este archivo es EL que no
 * puede estar mal: si compara de más, bloquea plantillas que estaban bien; si
 * compara de menos, deja pasar un contrato con el dato de otra persona. El
 * endpoint tiene sus propios tests desde que `vitest.config.ts` mira también
 * `app/api/**`; acá viven las reglas, allá el cableado.
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
 * OJO con el alcance, porque cambió: esta función compara DOS TEXTOS y no
 * sabe de dónde salieron. La que compara un documento es
 * `verificarDocumentoEntero`, más abajo, y mira TODO el texto del paquete
 * —cuerpo, encabezado, pie, notas al pie, notas al final y comentarios— vía
 * `textoPorParte`. Comparar solo el cuerpo (que es lo que devuelve mammoth)
 * dejaba pasar en verde un legajo de encabezado con el número de otra persona.
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

// ---------------------------------------------------------------------------
// EL DOCUMENTO ENTERO, NO SOLO EL CUERPO
// ---------------------------------------------------------------------------

/**
 * ═══ El falso verde que costó una ronda ═══
 *
 * `verificarContraElOriginal` compara DOS TEXTOS. Si esos textos salen de
 * mammoth, son el CUERPO del documento y nada más — y ahí hay un agujero real,
 * medido:
 *
 *   · el encabezado de Ana dice "Legajo interno 8892", el de Bruno "4471";
 *   · la detección compara cuerpos, así que el legajo NUNCA sale como campo;
 *   · el molde se arma del .docx de Ana y su encabezado queda con "8892";
 *   · el contrato de Bruno sale con el legajo de Ana;
 *   · y la comprobación, mirando solo el cuerpo, decía VERDE.
 *
 * Peor todavía: sin nada en rojo, la plantilla podía llegar a `activa`.
 *
 * La regla, entonces: **se compara TODO el texto del paquete.** No solo lo que
 * el molde rellena (cuerpo, encabezado, pie, notas al pie, comentarios) sino
 * también lo que NO rellena y aun así se lleva puesto de una persona a todas:
 * las notas al final. `textoPorParte` devuelve exactamente eso.
 *
 * Comparar parte por parte y no todo pegado no es prolijidad: si se
 * concatenara, una diferencia en el encabezado se informaría con el contexto
 * del cuerpo y el director iría a buscarla donde no está.
 */

/** Las familias de partes que puede tener un .docx, para agrupar y nombrar. */
export type TipoDeParte = "cuerpo" | "encabezado" | "pie" | "notas-al-pie" | "notas-al-final" | "comentarios" | "otra"

/**
 * De qué familia es una parte del paquete.
 *
 * El orden de las preguntas importa: "footnotes" y "endnotes" contienen la
 * palabra "note", y "footnotes" empieza con "foot" igual que "footer". Mirado
 * en el orden equivocado, las notas al pie salían informadas como pie de
 * página y el director iba a buscar al lugar que no era.
 */
export function tipoDeParte(ruta: string): TipoDeParte {
  if (ruta === "word/document.xml") return "cuerpo"
  if (/footnotes/i.test(ruta)) return "notas-al-pie"
  if (/endnotes/i.test(ruta)) return "notas-al-final"
  if (/header/i.test(ruta)) return "encabezado"
  if (/footer/i.test(ruta)) return "pie"
  if (/comments/i.test(ruta)) return "comentarios"
  return "otra"
}

/** Cómo se llama cada familia, para una persona, y si va en plural. */
const PARTES: Record<TipoDeParte, { nombre: string; plural: boolean }> = {
  cuerpo: { nombre: "el cuerpo del documento", plural: false },
  encabezado: { nombre: "el encabezado", plural: false },
  pie: { nombre: "el pie de página", plural: false },
  "notas-al-pie": { nombre: "las notas al pie", plural: true },
  "notas-al-final": { nombre: "las notas al final", plural: true },
  comentarios: { nombre: "los comentarios de Word", plural: true },
  otra: { nombre: "otra parte del documento", plural: false },
}

export function nombreDeParte(ruta: string): string {
  return PARTES[tipoDeParte(ruta)].nombre
}

/**
 * Qué puede hacer el director cuando la diferencia NO está en el cuerpo.
 *
 * Sin esto, el mensaje le dice que algo no coincide y lo deja sin salida:
 * desde la pantalla de revisión no puede tocar un encabezado ni borrar un
 * comentario. Desde el Word sí, y alcanza con decirlo.
 *
 * El motivo de fondo es el mismo para todas: la detección compara el CUERPO de
 * los contratos, así que nada que viva afuera puede convertirse en campo.
 */
function comoSeArregla(tipo: TipoDeParte): string {
  const base =
    "La detección compara el cuerpo de los contratos, así que un dato que viva acá no puede convertirse en campo."
  if (tipo === "comentarios") {
    return `${base} Si es una nota de cada persona, borrá el comentario en el Word y volvé a detectar.`
  }
  if (tipo === "notas-al-final") {
    return (
      `${base} Además, la plantilla no rellena las notas al final: la de esta persona sale con lo que decía la del ` +
      `documento que se usó de molde. Movelo al cuerpo del contrato o dejalo igual en todos, y volvé a detectar.`
    )
  }
  return `${base} Movelo al cuerpo del contrato o dejalo igual en todos, y volvé a detectar.`
}

/**
 * Compara el documento ENTERO contra el original, familia de partes por
 * familia de partes.
 *
 * **Se agrupa por familia y no por ruta**, y eso arregla un falso rojo: Word
 * numera los encabezados según le convenga (`header1` para la primera página,
 * `header2` para el resto), y dos documentos con el MISMO membrete pueden
 * guardarlo con números distintos. Comparando ruta contra ruta, eso salía como
 * "falta el encabezado" y no había nada que arreglar.
 *
 * Se informa la PRIMERA familia que no coincide, con el cuerpo primero: es
 * donde está el contrato y donde el director va a mirar. Una familia que está
 * en uno y no en el otro también es una diferencia — y de las que más asustan,
 * porque significa que el molde perdió o inventó un encabezado.
 */
export function verificarDocumentoEntero(
  original: Record<string, string>,
  armado: Record<string, string>,
): Verificacion {
  /** Junta las partes de la misma familia, en orden de ruta para que no dependa
   * de cómo las declare el paquete. */
  const porFamilia = (partes: Record<string, string>) => {
    const mapa = new Map<TipoDeParte, string[]>()
    for (const ruta of Object.keys(partes).sort()) {
      const tipo = tipoDeParte(ruta)
      mapa.set(tipo, [...(mapa.get(tipo) ?? []), partes[ruta] ?? ""])
    }
    /**
     * Una familia que existe pero está vacía es lo mismo que no tenerla: un
     * `word/header1.xml` sin una letra adentro no es un encabezado. Si no, un
     * documento con el encabezado en blanco y otro sin encabezado darían un
     * rojo por algo que nadie ve ni puede arreglar.
     */
    const salida = new Map<TipoDeParte, string>()
    for (const [tipo, textos] of mapa) {
      const junto = textos.join("\n")
      if (normalizarParaComparar(junto) !== "") salida.set(tipo, junto)
    }
    return salida
  }

  const a = porFamilia(original)
  const b = porFamilia(armado)

  const familias: TipoDeParte[] = ["cuerpo", "encabezado", "pie", "notas-al-pie", "notas-al-final", "comentarios", "otra"]

  for (const tipo of familias) {
    const enUno = a.has(tipo)
    const enOtro = b.has(tipo)
    if (!enUno && !enOtro) continue

    const { nombre, plural } = PARTES[tipo]

    if (enUno !== enOtro) {
      const verbo = enUno ? (plural ? "Faltan" : "Falta") : plural ? "Sobran" : "Sobra"
      return {
        coincide: false,
        observacion:
          `${verbo} ${nombre} en el documento armado con la plantilla. El molde no tiene la misma estructura que ` +
          `el archivo de esta persona: revisá que los dos sean el mismo tipo de documento.`,
      }
    }

    const v = verificarContraElOriginal(a.get(tipo) ?? "", b.get(tipo) ?? "")
    if (v.coincide) continue

    // En el cuerpo no hace falta decir dónde: es lo que todo el mundo supone.
    if (tipo === "cuerpo") return v
    return { coincide: false, observacion: `En ${nombre}: ${v.observacion} ${comoSeArregla(tipo)}` }
  }

  return { coincide: true, observacion: null }
}
