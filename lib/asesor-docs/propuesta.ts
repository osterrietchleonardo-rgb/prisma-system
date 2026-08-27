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
// Armar la propuesta
// ---------------------------------------------------------------------------

export function armarPropuesta(args: {
  templateId: string
  deteccion: Deteccion
  nombres: string[]
  laIaRespondio: boolean
  /** Lo que ya se sabía antes de comparar: exclusiones, descargas fallidas… */
  advertenciasPrevias?: string[]
}): Propuesta {
  const { templateId, deteccion, nombres, laIaRespondio } = args
  const advertencias = [...(args.advertenciasPrevias ?? []), ...deteccion.advertencias]

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

  if (deteccion.documentosUsados.length > 0 && deteccion.huecos.length === 0) {
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
    advertencias,
    documentosUsados: deteccion.documentosUsados,
    laIaRespondio,
  }
}
