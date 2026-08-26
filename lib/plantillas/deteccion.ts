import { diffWords } from "diff"

/**
 * Comparar N contratos entre sí para deducir qué es texto fijo y qué es el
 * dato de cada asesor. Lo idéntico en todos es la plantilla; lo que difiere
 * es el hueco.
 *
 * Trabaja sobre texto plano ya extraído (lo extrae `textoDeDocx`), nunca
 * sobre el .docx: acá no se sabe ni se quiere saber de XML.
 */

/** Un tramo del contrato que cambia de asesor a asesor. */
export type Hueco = {
  /** Posición del hueco dentro del documento, empezando en 0. */
  indice: number
  /** El texto de alrededor, que es lo que después lee la IA para nombrarlo. */
  contexto: string
  /** Del id del asesor al texto que ese asesor tiene en este hueco. */
  valores: Record<string, string>
}

export type Documento = { advisorId: string; texto: string }

export type Deteccion = {
  huecos: Hueco[]
  textoBase: string
  /**
   * Los asesores que de verdad entraron en la comparación: el del documento
   * base más los que se pudieron comparar contra él.
   *
   * Sin esto, "los tres contratos son idénticos" y "se cayeron todos los
   * documentos" devuelven exactamente las mismas llaves, y lo único que los
   * separa es prosa en castellano adentro de `advertencias`. Por `valores`
   * tampoco se puede deducir: si no hay huecos, no hay ningún `valores` que
   * mirar. Quien consuma esto tiene que poder contar.
   */
  documentosUsados: string[]
  advertencias: string[]
}

export type Opciones = {
  /**
   * Cuánto puede tardar la comparación contra UN asesor antes de darla por
   * perdida. Se puede bajar desde afuera para poder probar qué pasa cuando
   * una comparación se cae, sin tener que armar dos contratos gigantes.
   */
  topeDiffMs?: number
}

/**
 * Con dos documentos toda diferencia parece un hueco y no hay con qué
 * contrastar: si dos contratos dicen "30%" y "35%", no se sabe si el
 * porcentaje es un dato del asesor o si uno de los dos está mal escrito.
 * Con tres, una coincidencia empieza a significar algo. No se falla por
 * estar debajo: se avisa y decide el que llama.
 */
export const MINIMO_DOCUMENTOS = 3

/** Cuánto texto de cada lado se guarda como contexto para la IA. */
const CONTEXTO = 60

/**
 * Dos contratos largos y muy distintos hacen que el diff explote en tiempo.
 * Un director subiendo documentos no puede quedarse con la pantalla colgada:
 * se corta, se avisa, y ese asesor queda fuera de la comparación.
 */
const TOPE_DIFF_MS = 10_000

const LARGO_MAXIMO_PEGAMENTO = 3

/**
 * Pegamento: lo que puede aparecer ENTRE dos tramos distintos sin que dejen
 * de ser el mismo dato. Un CUIT "20-11111111-1" le llega al diff partido en
 * "20" / "-" / "11111111" / "-" / "1", porque los guiones son iguales en
 * todos y el diff los da por texto fijo. Si no se vuelven a pegar, un solo
 * dato sale como tres huecos.
 *
 * La condición es que el separador no tenga NI letras NI números NI espacios.
 * El espacio es justamente lo que distingue "20-11111111-1" (un dato) de
 * "Juan, 35%" (dos datos separados por ", "): lo que se escribe pegado es un
 * dato solo; en cuanto hay un espacio de por medio, son dos.
 *
 * El largo también decide, y no es decorativo: con un tope más grande
 * "Juan--.-30" pasaría a ser un dato solo.
 *
 * Lo de las letras y los números es la DEFINICIÓN de la regla, no una
 * defensa: hoy `diffWords` nunca los deja afuera del tramo cambiado, así que
 * ninguna prueba lo pone en rojo. Está escrito igual para que la regla se
 * lea completa, y para que el que venga no lo tome por cobertura faltante.
 */
function esPegamento(entre: string): boolean {
  if (entre.length === 0 || entre.length > LARGO_MAXIMO_PEGAMENTO) return false
  return !/[\p{L}\p{N}\s]/u.test(entre)
}

const esEspacio = (c: string) => /\s/.test(c)

/**
 * Un tramo de la BASE, con qué texto pone el otro documento ahí.
 * Los tramos de un documento cubren la base entera y en orden, sin agujeros:
 * de eso depende poder recortar después cualquier rango de la base.
 */
type Segmento =
  | { tipo: "igual"; ini: number; fin: number }
  | { tipo: "distinto"; ini: number; fin: number; textoOtro: string }

/**
 * Avanza sobre la base consumiendo lo que el diff dio por igual.
 *
 * No alcanza con sumar `value.length`: `diffWords` ignora los espacios al
 * comparar pero devuelve el tramo igual TAL COMO ESTÁ EN EL SEGUNDO
 * documento. Si la base dice "Hola  Juan" y el otro "Hola Juan", el tramo
 * igual mide un carácter menos que en la base, y de ahí en adelante todas
 * las posiciones quedan corridas -- y un contrato de Word con un espacio de
 * más es lo más común que hay. Por eso se recorre carácter por carácter,
 * dejando que cada lado tenga los espacios que quiera.
 *
 * Devuelve dos posiciones porque cuando la base tiene MÁS espacios que el
 * otro documento, el diff parte esa tanda de espacios entre el tramo igual y
 * el tramo distinto que sigue, y desde acá no se sabe por dónde la partió:
 * `duro` es justo después de la última letra que coincidió y `blando` es
 * después de todos los espacios. El corte real está en algún punto entre
 * esos dos, y lo termina de decidir `segmentar` con el texto borrado.
 *
 * Devuelve null si los caracteres que no son espacio no coinciden: eso
 * significa que las posiciones ya no son de fiar, y es preferible descartar
 * la comparación entera antes que proponer huecos corridos.
 */
function avanzarPorLoIgual(
  base: string,
  desde: number,
  valor: string,
): { duro: number; blando: number } | null {
  let i = desde
  let j = 0
  let duro = desde
  while (j < valor.length) {
    if (esEspacio(valor[j])) {
      while (j < valor.length && esEspacio(valor[j])) j++
      while (i < base.length && esEspacio(base[i])) i++
      continue
    }
    /**
     * Los espacios de la base se saltean SIEMPRE, no solo cuando el tramo
     * igual arranca con espacio. Si no, alcanza con que el diff meta el
     * espacio adentro del agregado -- "S.A." contra "S.R.L." emite
     * `+ "L. "` y el tramo igual que sigue arranca con letra -- para que la
     * base llegue con un espacio sin consumir, no coincida, y el asesor
     * entero quede afuera de la comparación. Con razones sociales o
     * iniciales de largo distinto (J.P. contra M.G.R.) se caían los dos
     * asesores y la plantilla salía SIN NINGÚN HUECO y sin nada en rojo:
     * igualita a tres contratos idénticos.
     */
    while (i < base.length && esEspacio(base[i])) i++
    if (i >= base.length || base[i] !== valor[j]) return null
    i++
    j++
    duro = i
  }
  return { duro, blando: i }
}

/** Parte la base en tramos iguales y distintos contra `textoOtro`. */
function segmentar(textoBase: string, textoOtro: string, topeMs: number): Segmento[] | null {
  const cambios = diffWords(textoBase, textoOtro, { timeout: topeMs })
  if (!cambios) return null

  const segmentos: Segmento[] = []
  let cursor = 0 // fin del último tramo emitido: los tramos tienen que cubrir la base entera
  let pos = 0
  let posDuro = 0
  let i = 0
  while (i < cambios.length) {
    const c = cambios[i]
    if (!c.added && !c.removed) {
      const avance = avanzarPorLoIgual(textoBase, pos, c.value)
      if (avance === null) return null
      posDuro = avance.duro
      pos = avance.blando
      i++
      continue
    }
    /**
     * Un dato cambiado llega como "sacá esto" seguido de "poné esto otro",
     * en dos cambios distintos. Se juntan en un solo tramo: si no,
     * "Juan Pérez" -> "María González" saldría como un hueco que borra y
     * otro que agrega, en vez de un hueco con el nombre de cada uno.
     */
    let textoBorrado = ""
    let textoAgregado = ""
    while (i < cambios.length && (cambios[i].added || cambios[i].removed)) {
      if (cambios[i].removed) textoBorrado += cambios[i].value
      else textoAgregado += cambios[i].value
      i++
    }
    /**
     * El texto borrado sí viene tal cual de la base, así que sirve de ancla:
     * se lo busca entre `posDuro` y `pos`, que es la franja de espacios donde
     * puede haber caído el corte. Sin esta ancla, un espacio de más en la
     * base corre todas las posiciones y la comparación entera se descarta.
     */
    let ini = pos
    if (textoBorrado !== "") {
      ini = -1
      for (let p = posDuro; p <= pos; p++) {
        if (textoBase.startsWith(textoBorrado, p)) {
          ini = p
          break
        }
      }
      if (ini === -1) return null
    }
    const fin = ini + textoBorrado.length
    if (ini > cursor) segmentos.push({ tipo: "igual", ini: cursor, fin: ini })
    segmentos.push({ tipo: "distinto", ini, fin, textoOtro: textoAgregado })
    cursor = fin
    pos = fin
    posDuro = fin
  }

  if (cursor < textoBase.length) segmentos.push({ tipo: "igual", ini: cursor, fin: textoBase.length })
  return segmentos
}

/**
 * Qué dice este documento en el rango [ini, fin) de la BASE.
 *
 * Donde el documento coincide con la base se copia la base: son las mismas
 * palabras, y así no hace falta llevar un segundo juego de posiciones sobre
 * el otro documento, que es justo donde se cuelan los corrimientos por
 * espacios.
 */
function recorte(segmentos: Segmento[], textoBase: string, ini: number, fin: number): string {
  let salida = ""
  for (const s of segmentos) {
    if (s.fin < ini || s.ini > fin) continue
    if (s.tipo === "distinto") {
      // Un tramo de ancho 0 es un agregado puro: la base no dice nada ahí.
      salida += s.textoOtro
    } else {
      salida += textoBase.slice(Math.max(s.ini, ini), Math.min(s.fin, fin))
    }
  }
  return salida
}

export function detectarHuecos(docs: Documento[], opciones: Opciones = {}): Deteccion {
  const topeMs = opciones.topeDiffMs ?? TOPE_DIFF_MS
  const advertencias: string[] = []

  /**
   * Un documento vacío o ilegible no puede tumbar la detección de los demás:
   * si el .docx de un asesor no se pudo leer, se lo deja afuera y se avisa,
   * en vez de que el director se quede sin plantilla por culpa de uno solo.
   */
  const vistos = new Set<string>()
  const usables: Documento[] = []
  for (const d of docs) {
    if (d.texto.trim() === "") {
      advertencias.push(
        `El documento del asesor ${d.advisorId} está vacío o no se pudo leer: queda fuera de la comparación.`,
      )
      continue
    }
    /**
     * `valores` es un objeto por id de asesor: si llegan dos documentos con
     * el mismo id, uno pisaría al otro sin que nadie se entere.
     */
    if (vistos.has(d.advisorId)) {
      advertencias.push(
        `Hay más de un documento para el asesor ${d.advisorId}: se usa el primero y se descartan los demás.`,
      )
      continue
    }
    vistos.add(d.advisorId)
    usables.push(d)
  }

  if (usables.length < MINIMO_DOCUMENTOS) {
    advertencias.push(
      `Hacen falta al menos ${MINIMO_DOCUMENTOS} documentos para distinguir el texto fijo del dato de cada ` +
        `asesor; llegaron ${usables.length}. Los huecos que salgan hay que revisarlos a mano.`,
    )
  }

  if (usables.length === 0) return { huecos: [], textoBase: "", documentosUsados: [], advertencias }

  const base = usables[0]
  const textoBase = base.texto

  /**
   * La base contra cada uno de los demás. Un tramo es hueco si difiere en al
   * menos una de esas comparaciones: alcanza con que UN asesor tenga otra
   * cosa ahí para que ese lugar deje de ser texto fijo.
   */
  const porAsesor = new Map<string, Segmento[]>()
  for (const otro of usables.slice(1)) {
    const segmentos = segmentar(textoBase, otro.texto, topeMs)
    if (segmentos === null) {
      advertencias.push(
        `No se pudo comparar el documento del asesor ${otro.advisorId} con el de ${base.advisorId}: ` +
          `queda fuera de la detección.`,
      )
      continue
    }
    porAsesor.set(otro.advisorId, segmentos)
  }

  /**
   * Acá está el punto fino. Cada comparación devuelve sus propios tramos, y
   * el mismo dato puede empezar en un lugar contra B y en otro contra C: con
   * el CUIT pasa de verdad, porque contra un asesor difiere desde el "20"
   * inicial y contra otro que también arranca con 20 recién difiere desde el
   * bloque del medio. Para decidir cuándo dos tramos de comparaciones
   * distintas son el mismo hueco, todos se expresan como un rango de la
   * MISMA base, que es lo único común a todas las comparaciones. Después se
   * unen los rangos que se pisan o se tocan.
   */
  const rangos: Array<{ ini: number; fin: number }> = []
  for (const segmentos of porAsesor.values()) {
    for (const s of segmentos) if (s.tipo === "distinto") rangos.push({ ini: s.ini, fin: s.fin })
  }
  rangos.sort((x, y) => x.ini - y.ini || x.fin - y.fin)

  const unidos: Array<{ ini: number; fin: number }> = []
  for (const r of rangos) {
    const ultimo = unidos[unidos.length - 1]
    // <= y no <: dos rangos pegados, sin nada en el medio, son un solo hueco.
    if (ultimo && r.ini <= ultimo.fin) {
      ultimo.fin = Math.max(ultimo.fin, r.fin)
      continue
    }
    unidos.push({ ...r })
  }

  // Segunda vuelta: volver a pegar lo que solo separa un guión, una barra o un punto.
  const finales: Array<{ ini: number; fin: number }> = []
  for (const r of unidos) {
    const ultimo = finales[finales.length - 1]
    if (ultimo && esPegamento(textoBase.slice(ultimo.fin, r.ini))) {
      ultimo.fin = r.fin
      continue
    }
    /**
     * Los espacios de los bordes no son parte del dato. Si la base trae un
     * espacio de más antes del nombre, el rango arranca ahí, y el valor
     * saldría como " Juan Pérez" -- que después se guarda así en la base de
     * datos y se escribe así en el contrato de todos.
     */
    let { ini, fin } = r
    while (ini < fin && esEspacio(textoBase[ini])) ini++
    while (fin > ini && esEspacio(textoBase[fin - 1])) fin--
    finales.push({ ini, fin })
  }

  const huecos: Hueco[] = []
  for (const r of finales) {
    const valores: Record<string, string> = { [base.advisorId]: textoBase.slice(r.ini, r.fin) }
    for (const [advisorId, segmentos] of porAsesor) {
      /**
       * El mismo recorte de espacios que se le hace al rango de la base hay
       * que hacérselo al valor del otro asesor, porque el diff le mete el
       * espacio adentro del agregado ("Otra mas. "). Sin esto, ese espacio de
       * cola se guarda en la base de datos y después se escribe en el
       * contrato de esa persona.
       */
      valores[advisorId] = recorte(segmentos, textoBase, r.ini, r.fin).trim()
    }
    huecos.push({
      indice: huecos.length,
      /**
       * El valor va incluido en el contexto a propósito: la IA que después
       * le pone nombre al hueco necesita leer la frase entera, no dos
       * pedazos sueltos con un agujero en el medio.
       */
      contexto:
        textoBase.slice(Math.max(0, r.ini - CONTEXTO), r.ini) +
        textoBase.slice(r.ini, r.fin) +
        textoBase.slice(r.fin, Math.min(textoBase.length, r.fin + CONTEXTO)),
      valores,
    })
  }

  return {
    huecos,
    textoBase,
    documentosUsados: [base.advisorId, ...porAsesor.keys()],
    advertencias,
  }
}
