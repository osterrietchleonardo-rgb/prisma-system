import { MINIMO_DOCUMENTOS, type Deteccion, type Hueco } from "@/lib/plantillas/deteccion"

/**
 * Lo que el endpoint de detección le devuelve al director para que lo revise,
 * y las reglas puras que lo arman.
 *
 * Vive acá y no adentro de `route.ts` por dos motivos:
 *  · los tests del repo solo miran `lib/**`, y esto es justo lo que puede
 *    romperse en silencio (un nombre repetido colapsa dos huecos en uno);
 *  · la pantalla de revisión (Tarea 6) importa los tipos de acá, así que la
 *    forma del contrato está escrita una sola vez.
 *
 * Nada de esto toca la base ni la red. El endpoint junta los datos, esto
 * decide qué se muestra.
 */

// ---------------------------------------------------------------------------
// La forma de la propuesta
// ---------------------------------------------------------------------------

export type PropuestaHueco = {
  /**
   * Estable dentro de una propuesta: la pantalla renombra, borra o marca un
   * hueco por este id, nunca por su nombre (que el director puede repetir
   * mientras edita) ni por su posición en el arreglo (que cambia al borrar).
   */
  id: string
  /** El que le puso la IA, o `CAMPO_N` si no la hubo o no sirvió. */
  nombre: string
  /** El texto de alrededor, para que el director entienda de qué es el dato. */
  contexto: string
  /** Del id del asesor al texto que ese asesor tiene en este hueco. */
  valores: Record<string, string>
}

export type Propuesta = {
  templateId: string
  /** De quién es el .docx que se usa de molde. Vacío si no quedó ninguno. */
  moldeAdvisorId: string
  huecos: PropuestaHueco[]
  advertencias: string[]
  /**
   * Los asesores que de verdad entraron en la comparación. Sale de
   * `Deteccion.documentosUsados`, NUNCA de las llaves de `valores`: un asesor
   * se puede caer (documento ilegible, id repetido, tope del diff) y entonces
   * no está, y presentar el valor de 2 de 3 como si fueran los 3 es
   * exactamente el error que esto vino a evitar.
   */
  documentosUsados: string[]
  /** `false` ⇒ los nombres son `CAMPO_N` y hay que revisarlos sí o sí. */
  laIaRespondio: boolean
}

// ---------------------------------------------------------------------------
// Quién entra en la detección
// ---------------------------------------------------------------------------

/** Los estados de `profiles` que dejan a un asesor fuera (spec §7, plan). */
export const ESTADOS_FUERA = ["pausado", "eliminado"] as const

/** Los estados conocidos hoy. Cualquier otro se informa en vez de suponerse. */
const ESTADOS_CONOCIDOS = ["activo", ...ESTADOS_FUERA]

export type FilaAsesor = {
  advisorId: string
  /** `profiles.estado`. `null` es un perfil viejo, anterior a la columna. */
  estado: string | null
  /** Para poder nombrar a la persona en la advertencia. Opcional. */
  nombre?: string | null
}

const comoSeLlama = (fila: FilaAsesor) => fila.nombre?.trim() || fila.advisorId

/**
 * Saca de la comparación a los asesores pausados y desvinculados.
 *
 * Cada exclusión sale por escrito. Un asesor que desaparece sin dejar rastro
 * es el fallo más caro de acá: el director ve una plantilla armada con menos
 * documentos de los que subió y no tiene cómo enterarse.
 *
 * Un estado desconocido NO excluye: entra, y se avisa. La regla es "pausados y
 * desvinculados", y un estado nuevo no es ninguno de los dos; dejarlo afuera
 * en silencio sería inventar una regla que nadie escribió. Si el estado nuevo
 * sí tuviera que quedar afuera, la advertencia es lo que lo hace visible.
 */
export function separarPorEstado(filas: FilaAsesor[]): {
  dentro: FilaAsesor[]
  advertencias: string[]
} {
  const dentro: FilaAsesor[] = []
  const advertencias: string[] = []

  for (const fila of filas) {
    const estado = fila.estado?.trim().toLowerCase() ?? null

    if (estado === "pausado") {
      advertencias.push(`${comoSeLlama(fila)} está pausado: su documento queda fuera de la comparación.`)
      continue
    }
    if (estado === "eliminado") {
      advertencias.push(`${comoSeLlama(fila)} está desvinculado: su documento queda fuera de la comparación.`)
      continue
    }
    if (estado !== null && !ESTADOS_CONOCIDOS.includes(estado)) {
      advertencias.push(
        `${comoSeLlama(fila)} tiene un estado que el sistema no conoce ("${estado}"): se lo incluyó en la ` +
          `comparación. Revisá que corresponda.`,
      )
    }
    dentro.push(fila)
  }

  return { dentro, advertencias }
}

// ---------------------------------------------------------------------------
// Los nombres de los huecos
// ---------------------------------------------------------------------------

/** El nombre de descarte, el del spec §7.1: `CAMPO_1`, `CAMPO_2`… */
export function nombreGenerico(indice: number): string {
  return `CAMPO_${indice + 1}`
}

const LARGO_MAXIMO_NOMBRE = 40

/**
 * Deja el nombre en la forma que después se escribe como `{{NOMBRE}}` dentro
 * del .docx: mayúsculas, sin acentos, y solo letras, números y guión bajo.
 *
 * No es cosmético. El nombre termina siendo la llave de un
 * `Record<string, string>` que se le pasa a docxtemplater; un nombre con un
 * espacio, una llave o un acento no se encuentra al rellenar, y el
 * `nullGetter` de `lib/plantillas/docx.ts` deja el lugar EN BLANCO sin fallar:
 * el contrato sale a la firma sin el dato y sin un solo aviso.
 *
 * Devuelve `null` si no queda nada usable; ahí el que llama pone `CAMPO_N`.
 */
export function sanearNombre(crudo: unknown): string | null {
  if (typeof crudo !== "string") return null

  const sinAcentos = crudo
    .normalize("NFD")
    // Marcas diacríticas: la tilde de "COMISIÓN" se va y queda "COMISION".
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()

  const limpio = sinAcentos
    .replace(/[^A-Z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, LARGO_MAXIMO_NOMBRE)
    // El slice puede dejar un guión bajo colgando al final.
    .replace(/_+$/g, "")

  if (limpio === "") return null
  // Un nombre que empieza con número no se lee como nombre de campo.
  if (/^[0-9]/.test(limpio)) return `CAMPO_${limpio}`
  return limpio
}

/**
 * Cuántos huecos se le mandan a la IA de una. Más que esto es casi seguro una
 * detección desbocada (dos documentos que no tienen nada que ver), y mandarla
 * entera solo sirve para gastar tokens: los que sobran salen `CAMPO_N`.
 */
export const MAX_HUECOS_A_LA_IA = 150

/** Cuánto de un valor se le muestra a la IA. Alcanza para entender qué es. */
const LARGO_MAXIMO_VALOR = 80

export const SYSTEM_PROMPT_NOMBRES = `Sos un asistente que le pone nombre a los campos variables de un contrato inmobiliario argentino.

Te paso una lista de huecos. De cada uno vas a ver el texto que lo rodea y qué escribió cada persona ahí. NO ves el contrato entero y no lo necesitás.

Tu única tarea es devolver, para cada hueco, un nombre de campo:
- En MAYÚSCULAS_CON_GUION_BAJO, sin acentos, sin espacios, sin llaves.
- Que describa QUÉ dato es, no qué valor tiene: NOMBRE_COMPLETO, CUIT, MATRICULA, COMISION_PORCENTAJE, FECHA_INICIO, DOMICILIO.
- Distinto para cada hueco. Si dos huecos son el mismo dato repetido, agregales un sufijo (DOMICILIO_1, DOMICILIO_2).
- Corto: menos de 40 caracteres.

Devolvés ÚNICAMENTE un JSON con esta forma, sin texto alrededor ni backticks:
{"nombres": ["NOMBRE_1", "NOMBRE_2"]}

El arreglo tiene que tener exactamente un nombre por hueco y en el mismo orden en que te los paso.`

/**
 * Lo que se le manda a la IA: el contexto de cada hueco y qué puso cada
 * asesor. NUNCA el documento entero — ni hace falta ni corresponde mandarle
 * el contrato de nadie completo a un tercero.
 *
 * Los ids de los asesores tampoco viajan: se numeran "Persona 1", "Persona 2".
 * Para ponerle nombre al campo no sirven de nada y son datos de más afuera.
 */
export function promptDeNombres(huecos: Hueco[]): string {
  const lineas = huecos.slice(0, MAX_HUECOS_A_LA_IA).map((h, i) => {
    const valores = Object.values(h.valores).map((v, j) => {
      const corto = v.length > LARGO_MAXIMO_VALOR ? `${v.slice(0, LARGO_MAXIMO_VALOR)}…` : v
      return `    Persona ${j + 1}: ${JSON.stringify(corto)}`
    })
    return [`Hueco ${i + 1}:`, `    Contexto: ${JSON.stringify(h.contexto)}`, ...valores].join("\n")
  })

  return `Huecos a nombrar: ${lineas.length}\n\n${lineas.join("\n\n")}`
}

/** Saca los ```json ... ``` con los que el modelo a veces envuelve la respuesta. */
function sinBackticks(texto: string): string {
  return texto.replace(/```json/gi, "").replace(/```/g, "").trim()
}

/**
 * De la respuesta cruda de la IA a un nombre por hueco.
 *
 * Se aceptan las dos formas que devuelve un modelo en la práctica: el objeto
 * `{"nombres": [...]}` que se le pide y el arreglo pelado que a veces manda
 * igual.
 *
 * `laIaRespondio` es true SOLO si la IA nombró TODOS los huecos con algo
 * usable. Alcanza con que falle uno para que el director tenga que revisar la
 * lista entera, así que decir "sí respondió" cuando nombró la mitad sería
 * decirle que puede confiar en algo que no está.
 */
export function nombresParaHuecos(
  respuestaIA: string | null,
  cantidad: number,
): { nombres: string[]; laIaRespondio: boolean; advertencias: string[] } {
  const genericos = () => Array.from({ length: cantidad }, (_, i) => nombreGenerico(i))

  if (cantidad === 0) return { nombres: [], laIaRespondio: false, advertencias: [] }

  if (respuestaIA === null || respuestaIA.trim() === "") {
    return {
      nombres: genericos(),
      laIaRespondio: false,
      advertencias: [
        "La IA no pudo ponerle nombre a los campos: salen como CAMPO_1, CAMPO_2… Hay que renombrarlos a mano.",
      ],
    }
  }

  let crudos: unknown[]
  try {
    const parseado = JSON.parse(sinBackticks(respuestaIA))
    if (Array.isArray(parseado)) crudos = parseado
    else if (parseado && Array.isArray((parseado as { nombres?: unknown }).nombres))
      crudos = (parseado as { nombres: unknown[] }).nombres
    else throw new Error("forma inesperada")
  } catch {
    return {
      nombres: genericos(),
      laIaRespondio: false,
      advertencias: [
        "La IA contestó algo que no se pudo leer: los campos salen como CAMPO_1, CAMPO_2… Hay que renombrarlos a mano.",
      ],
    }
  }

  const advertencias: string[] = []
  if (crudos.length !== cantidad) {
    advertencias.push(
      `La IA devolvió ${crudos.length} nombre(s) para ${cantidad} campo(s): los que faltan salen como CAMPO_N. ` +
        `Revisá la lista completa.`,
    )
  }

  /**
   * Dos huecos con el mismo nombre son un solo campo: el nombre es la llave
   * del objeto que se le pasa a docxtemplater, así que el segundo pisa al
   * primero y los dos lugares del contrato terminan con el mismo dato. Pasa
   * de verdad cuando el mismo dato aparece dos veces (el domicilio arriba y
   * en la firma) y la IA los nombra igual.
   */
  const usados = new Set<string>()
  const desambiguar = (nombre: string) => {
    if (!usados.has(nombre)) {
      usados.add(nombre)
      return nombre
    }
    let n = 2
    while (usados.has(`${nombre}_${n}`)) n++
    const final = `${nombre}_${n}`
    usados.add(final)
    return final
  }

  let todosDeLaIa = crudos.length === cantidad
  const nombres: string[] = []
  for (let i = 0; i < cantidad; i++) {
    const saneado = sanearNombre(crudos[i])
    if (saneado === null) {
      todosDeLaIa = false
      nombres.push(desambiguar(nombreGenerico(i)))
      continue
    }
    nombres.push(desambiguar(saneado))
  }

  if (!todosDeLaIa && advertencias.length === 0) {
    advertencias.push(
      "La IA no le pudo poner nombre a todos los campos: los que faltan salen como CAMPO_N. Revisá la lista completa.",
    )
  }

  return { nombres, laIaRespondio: todosDeLaIa, advertencias }
}

// ---------------------------------------------------------------------------
// Los límites conocidos de la detección
// ---------------------------------------------------------------------------

/**
 * Lo que la detección NO puede ver o ve mal, dicho de frente.
 *
 * Están medidos y documentados en `lib/plantillas/`. Si no se los cuenta acá,
 * el director firma una revisión creyendo que la lista está completa. La
 * revisión es obligatoria (spec §7.2) justamente por esto.
 */
export function limitesConocidos(deteccion: Deteccion): string[] {
  const avisos: string[] = [
    "Un dato que esté adentro de un cuadro de texto de Word no se detecta: revisá si el contrato tiene alguno.",
    "Un dato que esté en una nota al pie o al final no se reemplaza; se informa como faltante.",
  ]

  if (deteccion.huecos.length > 0) {
    avisos.push(
      "Dos datos pegados, con solo un espacio entre medio, salen como un campo solo. Si ves un campo con dos " +
        "cosas adentro, es eso.",
    )
  }

  if (deteccion.documentosUsados.length === MINIMO_DOCUMENTOS) {
    avisos.push(
      `Con ${MINIMO_DOCUMENTOS} documentos, lo que arranca igual en los tres queda como texto fijo: si los tres ` +
        `CUIT empiezan en "20-", ese "20-" no es campo. Con un cuarto asesor que empiece distinto, habría que ` +
        `volver a detectar.`,
    )
  }

  return avisos
}

// ---------------------------------------------------------------------------
// El presupuesto de tiempo
// ---------------------------------------------------------------------------

/**
 * Cuánto se le suma a lo medido antes de creerle.
 *
 * La sonda mide UNA comparación y con eso se decide por todas, y no todas
 * cuestan igual. Un 50% de holgura es lo que separa "entraron 14 y las 13
 * comparaciones terminaron" de "entraron 14 y las últimas se cortaron".
 */
const HOLGURA = 1.5

/**
 * Cuántos documentos entran en la comparación y con cuánto tiempo cada uno,
 * para que el TOTAL quepa en el presupuesto.
 *
 * El problema que resuelve: el tope de `detectarHuecos` es **por comparación**,
 * y hay N−1 comparaciones. Un tope por comparación no puede acotar el total, por
 * diseño. Medido con 26 contratos distintos entre sí: **46,8 s** de comparación,
 * con cada comparación individual en ~1,9 s, o sea que el tope de 10 s **nunca
 * se dispara** y la función muere de timeout. Lo que ve el director es un
 * FUNCTION_INVOCATION_TIMEOUT pelado: sin aviso, sin propuesta y sin explicación.
 *
 * **No predice: mide.** El que llama corre UNA comparación de prueba sobre estos
 * mismos documentos y pasa cuánto tardó. El primer intento repartía el
 * presupuesto en partes iguales sin medir nada, y la sonda lo desmintió: con 26
 * contratos dispares el reparto parejo da 1,6 s por comparación, **las 25 se
 * cortan**, y la propuesta vuelve con UN documento usado después de gastar los
 * 40 s enteros. Cumplía el techo y no servía para nada. Con la medición entran
 * menos documentos pero las comparaciones **terminan**, que es lo único que
 * produce una plantilla.
 *
 * Garantiza que `(cuantosEntran − 1) × topeDiffMs ≤ presupuestoMs`: el tope
 * sigue siendo la pared dura por si la sonda midió de menos.
 */
export function repartirPresupuesto(args: {
  cantidadDeDocumentos: number
  presupuestoMs: number
  /** El tope por comparación de siempre (`TOPE_DIFF_MS` de `deteccion.ts`). */
  topeNormalMs: number
  /** Lo que tardó UNA comparación de prueba sobre estos mismos documentos. */
  msPorComparacionMedido: number
}): { cuantosEntran: number; topeDiffMs: number } {
  const { cantidadDeDocumentos: cantidad, topeNormalMs } = args
  const presupuesto = Math.max(0, args.presupuestoMs)

  // Con uno solo no hay ninguna comparación que acotar.
  if (cantidad <= 1) return { cuantosEntran: cantidad, topeDiffMs: topeNormalMs }

  /**
   * Nunca menos de 1 ms: si la sonda dio 0 -- documentos cortos, o el reloj sin
   * resolución suficiente -- dividir por cero da Infinity y `cabidas` deja de
   * significar nada. El total lo sigue acotando el tope de abajo igual, así que
   * esto no es la red de seguridad: es no dejar un Infinity dando vueltas
   * adentro de una cuenta que el que venga va a querer tocar.
   */
  const estimado = Math.max(1, Math.ceil(Math.max(0, args.msPorComparacionMedido) * HOLGURA))

  /**
   * Al menos una comparación siempre se intenta. Devolver una propuesta sin
   * ningún hueco por no haber intentado nada sería peor que pasarse un poco.
   */
  const cabidas = Math.max(1, Math.floor(presupuesto / estimado))
  const cuantosEntran = Math.min(cantidad, cabidas + 1)

  const topeDiffMs = Math.max(1, Math.min(topeNormalMs, Math.floor(presupuesto / (cuantosEntran - 1))))
  return { cuantosEntran, topeDiffMs }
}

/**
 * El renglón resumen: cuántos documentos se compararon de verdad, de los que
 * había.
 *
 * Se dice el número completo -- "N de M" -- y no solo cuántos entraron: el
 * director subió M archivos y tiene que poder ver la resta él mismo. `null`
 * cuando se compararon todos, para no meter ruido.
 *
 * **El segundo número es cuántos se compararon, NO cuántos se intentaron.**
 * Son dos cosas distintas y confundirlas deja al director sin el resumen justo
 * cuando más lo necesita: hay un caso medido donde el reparto de tiempo deja
 * entrar los M documentos y aun así algunas comparaciones se cortan adentro,
 * así que se intentaron M y se lograron menos. Decidiéndolo contra los que se
 * intentaron, el aviso no sale: la información queda solo desparramada en las
 * advertencias por persona, y el renglón que hace la resta no aparece. Las dos
 * formas de quedarse afuera -- "no entró" y "entró y se cortó" -- terminan en
 * `documentosUsados`, que es por eso el único número honesto para comparar.
 */
export function avisoPorRecorteDeTiempo(cantidadOriginal: number, cuantosSeCompararon: number): string | null {
  if (cuantosSeCompararon >= cantidadOriginal) return null
  return (
    `Se compararon ${cuantosSeCompararon} de ${cantidadOriginal} documentos. Los que faltan quedaron afuera ` +
    `-- casi siempre porque comparar todos no entraba en el tiempo que tiene la operación --, y cada uno tiene su ` +
    `propio aviso en esta misma lista. La plantilla sale con esos ${cuantosSeCompararon}; los demás no se ` +
    `tocaron. Si los contratos son muy distintos entre sí, conviene revisar que todos sean del mismo tipo de ` +
    `documento.`
  )
}

// ---------------------------------------------------------------------------
// Nombres en vez de ids
// ---------------------------------------------------------------------------

/**
 * Cambia los ids de asesor por el nombre de la persona adentro de las
 * advertencias.
 *
 * `deteccion.ts` no conoce a nadie: nombra por id, y le sale "El documento del
 * asesor aaaaaaaa-1111-... está vacío". El director no tiene cómo saber de quién
 * habla, y encima queda desparejo contra las advertencias de acá, que sí usan el
 * nombre. Traducirlo es de las cosas más baratas que se pueden hacer por que un
 * aviso sirva.
 *
 * Toca SOLO el texto de las advertencias. Los ids de `valores` y de
 * `documentosUsados` quedan intactos: la pantalla los necesita para poder
 * escribir después.
 */
export function conNombres(
  advertencias: string[],
  nombresDeAsesores?: ReadonlyMap<string, string>,
): string[] {
  if (!nombresDeAsesores || nombresDeAsesores.size === 0) return advertencias
  return advertencias.map((texto) => {
    let salida = texto
    for (const [id, nombre] of nombresDeAsesores) {
      const limpio = nombre.trim()
      if (limpio === "" || !salida.includes(id)) continue
      salida = salida.split(id).join(limpio)
    }
    return salida
  })
}

// ---------------------------------------------------------------------------
// Armar la propuesta
// ---------------------------------------------------------------------------

export function armarPropuesta(args: {
  templateId: string
  deteccion: Deteccion
  nombres: string[]
  laIaRespondio: boolean
  /** Lo que ya se sabía antes de comparar: exclusiones, descargas fallidas… */
  advertenciasPrevias?: string[]
  /**
   * Del id del asesor a su nombre, para que ninguna advertencia salga con un
   * uuid crudo. Opcional: sin el mapa, los textos quedan como vinieron.
   */
  nombresDeAsesores?: ReadonlyMap<string, string>
  /**
   * Cuántos documentos había para comparar antes de que empezara la
   * comparación. Con esto se arma el renglón resumen "N de M". Opcional: sin
   * el número no hay resta que hacer y no se dice nada.
   */
  cantidadDeDocumentos?: number
}): Propuesta {
  const { templateId, deteccion, nombres, laIaRespondio } = args

  /**
   * El resumen va PRIMERO, antes que las advertencias de cada persona: es el
   * renglón que le dice al director cuántos documentos entraron de verdad, y
   * leer diez avisos sueltos sin ese total arriba es lo que hace que no se
   * entienda cuántos quedaron afuera.
   *
   * Se decide contra `documentosUsados`, los que se compararon de verdad, y
   * NO contra cuántos se intentaron: ver `avisoPorRecorteDeTiempo`.
   */
  const resumen =
    args.cantidadDeDocumentos === undefined
      ? null
      : avisoPorRecorteDeTiempo(args.cantidadDeDocumentos, deteccion.documentosUsados.length)

  const advertencias = [
    ...(resumen ? [resumen] : []),
    ...(args.advertenciasPrevias ?? []),
    ...deteccion.advertencias,
  ]

  const huecos: PropuestaHueco[] = deteccion.huecos.map((h, i) => ({
    id: `hueco-${h.indice}`,
    nombre: nombres[i] ?? nombreGenerico(i),
    contexto: h.contexto,
    valores: h.valores,
  }))

  /**
   * Que cada asesor que entró en la comparación tenga un valor en cada hueco.
   * Hoy `detectarHuecos` los escribe todos, así que esto no debería saltar
   * nunca; está para que el día que deje de ser cierto se vea acá y no en un
   * contrato con el campo en blanco.
   */
  for (const hueco of huecos) {
    const faltan = deteccion.documentosUsados.filter(
      (id) => !Object.prototype.hasOwnProperty.call(hueco.valores, id),
    )
    if (faltan.length > 0) {
      advertencias.push(
        `El campo ${hueco.nombre} no tiene valor para ${faltan.length} de los ${deteccion.documentosUsados.length} ` +
          `asesores comparados. Completalo a mano.`,
      )
    }
  }

  /**
   * `> 1` y no `> 0`. Con UN solo documento legible no se comparó nada: no hay
   * con qué ser idéntico. Decirle al director que revise si subió el mismo
   * archivo para todos lo manda a buscar duplicados que no existen, cuando el
   * problema real es que solo uno de sus documentos se pudo leer -- y eso ya se
   * lo dice la advertencia de MINIMO_DOCUMENTOS. Un aviso que desvía es peor
   * que ninguno.
   */
  if (deteccion.documentosUsados.length > 1 && deteccion.huecos.length === 0) {
    advertencias.push(
      "Los documentos comparados son idénticos entre sí: no se encontró ningún dato que cambie de asesor a asesor. " +
        "Revisá que no hayas subido el mismo archivo para todos.",
    )
  }

  advertencias.push(...limitesConocidos(deteccion))

  return {
    templateId,
    moldeAdvisorId: deteccion.documentosUsados[0] ?? "",
    huecos,
    /**
     * La traducción de ids a nombres va al final y de una sola pasada, para que
     * alcance también a las advertencias que escribió `deteccion.ts`, que no
     * conoce a nadie y nombra por uuid.
     */
    advertencias: conNombres(advertencias, args.nombresDeAsesores),
    documentosUsados: deteccion.documentosUsados,
    laIaRespondio,
  }
}
