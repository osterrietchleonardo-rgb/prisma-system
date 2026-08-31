import { comoQuedaEnElDocumento, LARGO_DE_DATO_SOSPECHOSO } from "@/lib/asesor-docs/confirmacion"
import { nombreDeParte } from "@/lib/asesor-docs/verificacion"

/**
 * Subir una versión nueva de la plantilla (spec §7.4), primera mitad: LEERLA y
 * decir qué cambia. Aplicarla —regenerar el documento de cada asesor— es otra
 * tarea, y a propósito: el spec §7.4.4 dice que el reemplazo ocurre "recién con
 * el OK explícito" del director, después de ver la vista previa.
 *
 * Todo lo que decide algo vive acá y no adentro del `route.ts`, por el motivo
 * de siempre en esta etapa: un texto o una regla escritos a mano en el cableado
 * no los mira ningún test, y ya cobró dos veces. Nada de este archivo toca la
 * base, la red ni el sistema de archivos.
 *
 * Ojo con el alcance, igual que en `confirmacion.ts`: este archivo NO lo carga
 * el navegador. Importa de `confirmacion.ts`, que arrastra la librería de
 * comparación de textos. La pantalla recibe los textos YA ESCRITOS en la
 * respuesta del endpoint, y de acá toma solo tipos (`import type`, que
 * desaparece al compilar).
 *
 * ═══ La idea de fondo, en una frase ═══
 *
 * El director sube el .docx de la versión nueva **ya completado con los datos
 * de UN asesor que el sistema ya tiene cargado**, y dice cuál. Con eso, buscar
 * los huecos deja de ser adivinar: PRISMA ya sabe que el CUIT de esa persona es
 * `20-12345678-9`, lo busca literal, y donde lo encuentra va un hueco. Un
 * archivo genérico, o con los campos en blanco, no tiene nada que buscar y se
 * rechaza — que es literal del spec §7.4.1.
 */

// ---------------------------------------------------------------------------
// Buscar los valores conocidos adentro del texto del documento nuevo
// ---------------------------------------------------------------------------

/**
 * Qué pasó al buscar el valor de un campo adentro del documento nuevo.
 *
 *  · `encontrado` — aparece exactamente una vez. El caso cómodo.
 *  · `repetido` — aparece más de una vez. NO es un error: el nombre del asesor
 *    está en la cláusula y otra vez en la firma, y las dos tienen que cambiar
 *    (`ponerHuecosEnDocx` reemplaza todas las apariciones a propósito). Pero se
 *    dice, porque si una de esas apariciones fuera parte del texto fijo del
 *    contrato, el reemplazo se la lleva puesta.
 *  · `ausente` — el valor conocido de esa persona no está en el documento
 *    nuevo. O el campo dejó de existir en esta versión, o el archivo que se
 *    subió no es el de esa persona.
 *  · `sin-dato` — el `form_data` de esa persona trae ese campo vacío. No hay
 *    nada que buscar; no es lo mismo que no encontrarlo.
 */
export type SituacionDelValor = "encontrado" | "repetido" | "ausente" | "sin-dato"

export type UbicacionDeValor = {
  /** El nombre del campo, tal como está en `form_data` y en `campos_schema`. */
  campo: string
  /** El valor conocido de esa persona, ya recortado de espacios. */
  valor: string
  /** Cuántas veces aparece en el documento nuevo. */
  veces: number
  /** Dónde empieza cada aparición, en caracteres. Sirve para ordenar y para probar. */
  posiciones: number[]
  situacion: SituacionDelValor
  /**
   * `true` cuando el dato es de `LARGO_DE_DATO_SOSPECHOSO` letras o menos.
   *
   * Va aparte de `situacion` porque son dos cosas distintas: un dato corto se
   * encuentra igual, y muchas veces se encuentra de más. El "1" de "1 de marzo"
   * aparece también en "una (1) instancia mensual". Medido con tres contratos
   * reales en la confirmación de la §7.2, y acá el riesgo es el mismo.
   */
  corto: boolean
  /**
   * Los otros campos cuyo valor CONTIENE a este. El caso del brief: `"2026"`
   * adentro de `"PLAZO_2026"`.
   *
   * Importa porque el reemplazo es textual: si el corto entrara primero, partiría
   * al largo por la mitad. `ponerHuecosEnDocx` lo evita ordenando de más largo a
   * más corto, así que esto NO es un error — es lo que hay que poder decir
   * cuando el resultado sorprenda.
   */
  dentroDe: string[]
}

/** La misma regla de borde de palabra que usa `ponerHuecosEnDocx`. */
const ES_LETRA_O_NUMERO = /[\p{L}\p{N}]/u

/**
 * ¿La aparición en [inicio, fin) parte una palabra por la mitad?
 *
 * Es una COPIA de `partePalabra` en `lib/plantillas/docx.ts`, y tiene que
 * seguir siendo la misma. Motivo: esta función existe para PREDECIR qué va a
 * reemplazar `ponerHuecosEnDocx`; si las dos reglas se separan, la predicción
 * miente justo donde más caro sale — se le dice al director que un campo se
 * encontró y después no entra en el documento, o al revés.
 *
 * No se importa de allá porque `docx.ts` no la exporta y exportarla sería
 * agrandar su superficie pública por un detalle interno. Lo que ata las dos es
 * un test que corre `ponerHuecosEnDocx` de verdad sobre un .docx armado en
 * memoria y compara las cuentas.
 */
function partePalabra(completo: string, inicio: number, fin: number): boolean {
  const antes = completo[inicio - 1]
  const despues = completo[fin]
  return (
    (antes !== undefined && ES_LETRA_O_NUMERO.test(antes)) ||
    (despues !== undefined && ES_LETRA_O_NUMERO.test(despues))
  )
}

/** Dónde empieza cada aparición de `buscado`, salteando las que parten una palabra. */
function aparicionesDe(completo: string, buscado: string): number[] {
  if (buscado === "") return []
  const posiciones: number[] = []
  let desde = 0
  while (desde <= completo.length) {
    const at = completo.indexOf(buscado, desde)
    if (at === -1) break
    if (partePalabra(completo, at, at + buscado.length)) {
      desde = at + 1
      continue
    }
    posiciones.push(at)
    desde = at + buscado.length
  }
  return posiciones
}

/**
 * Busca en `texto` los valores conocidos de un asesor y dice, campo por campo,
 * si están, cuántas veces y dónde.
 *
 * **Esto es lo que hace determinista a la detección de la versión nueva.** No
 * se adivina qué parte del contrato es dato de cada persona comparando
 * documentos entre sí (eso es la §7.1, y hace falta tener 3): se buscan valores
 * que ya se saben.
 *
 * El orden de la salida es el de `valores`, para que la pantalla muestre los
 * campos en el orden del formulario y no en uno que cambie de una corrida a
 * otra.
 */
export function ubicarValores(texto: string, valores: Record<string, string>): UbicacionDeValor[] {
  const campos = Object.keys(valores)
  const limpio = new Map<string, string>()
  for (const campo of campos) limpio.set(campo, (valores[campo] ?? "").trim())

  return campos.map((campo) => {
    const valor = limpio.get(campo) ?? ""
    const posiciones = valor === "" ? [] : aparicionesDe(texto, valor)

    const situacion: SituacionDelValor =
      valor === "" ? "sin-dato" : posiciones.length === 0 ? "ausente" : posiciones.length === 1 ? "encontrado" : "repetido"

    /**
     * Contra el valor del OTRO, no contra su nombre. Un valor que es pedazo del
     * valor de otro campo es el que puede partirlo al reemplazar; que además
     * choque con el nombre `{{CAMPO}}` de otro es un daño distinto, y de ese se
     * ocupa `camposQueChocanConOtroNombre` en `confirmacion.ts`, que el
     * endpoint usa tal cual.
     */
    const dentroDe =
      valor === ""
        ? []
        : campos.filter((otro) => {
            if (otro === campo) return false
            const suValor = limpio.get(otro) ?? ""
            return suValor !== valor && suValor !== "" && aparicionesDe(suValor, valor).length > 0
          })

    return {
      campo,
      valor,
      veces: posiciones.length,
      posiciones,
      situacion,
      corto: valor !== "" && valor.length <= LARGO_DE_DATO_SOSPECHOSO,
      dentroDe,
    }
  })
}

/**
 * Lo mismo que `UbicacionDeValor`, más en qué partes del documento apareció el
 * valor —"el cuerpo del documento", "el encabezado"—, con los nombres que ya usa
 * la verificación para hablarle al director.
 */
export type UbicacionEnPartes = UbicacionDeValor & {
  partes: string[]
  /**
   * Dónde aparece por PRIMERA vez, en el orden en que una persona lee el
   * documento: primero el cuerpo, después las demás partes por ruta.
   *
   * `parte` es el índice de la parte en ese recorrido y `pos` el caracter dentro
   * de ella. Las dos juntas ordenan; ninguna sola alcanza, porque el caracter 3
   * del encabezado va DESPUÉS del caracter 900 del cuerpo.
   *
   * `null` cuando el valor no aparece en ninguna parte.
   */
  primeraAparicion: { parte: number; pos: number } | null
}

/** La parte del paquete donde vive el contrato. */
const CUERPO = "word/document.xml"

/**
 * Las partes del documento en el orden en que se leen: el cuerpo primero y el
 * resto por ruta.
 *
 * Es el MISMO criterio que usa `textoDeVistaPrevia` para armar la previsualización.
 * Si los dos se separaran, el director vería los campos en un orden y el
 * documento en otro.
 */
export function rutasEnOrdenDeLectura(partes: Record<string, string>): string[] {
  const rutas = Object.keys(partes).sort()
  return [...rutas.filter((r) => r === CUERPO), ...rutas.filter((r) => r !== CUERPO)]
}

/**
 * Lo mismo, pero sobre el documento ENTERO: cuerpo, encabezado, pie, notas y
 * comentarios, tal como los devuelve `textoPorParte`.
 *
 * No es una comodidad. Mirar solo el cuerpo —que es lo que devuelve mammoth—
 * ya dejó pasar en VERDE un legajo de encabezado que salía con el número de
 * otra persona; está documentado en `verificacion.ts` y medido. Acá el mismo
 * agujero sería peor: un dato que vive en el encabezado no se encontraría, el
 * campo saldría como "desaparecido", y el molde nuevo se llevaría el encabezado
 * de una sola persona al documento de todas.
 *
 * Las apariciones se SUMAN entre partes y las posiciones se devuelven relativas
 * a cada parte, así que se agrega también en cuál. Un valor que está una vez en
 * el cuerpo y una vez en el encabezado es `repetido`, que es la verdad.
 */
export function ubicarValoresEnPartes(
  partes: Record<string, string>,
  valores: Record<string, string>,
): UbicacionEnPartes[] {
  const rutas = rutasEnOrdenDeLectura(partes)
  const porCampo = new Map<string, UbicacionEnPartes>()

  /**
   * El punto de partida sale de buscar sobre el texto VACÍO: así el valor
   * recortado, el `corto` y el `dentroDe` —que no dependen del documento— se
   * calculan una sola vez y con la misma regla, en vez de escribirse de nuevo
   * acá y poder separarse de `ubicarValores` sin que nadie se entere.
   */
  for (const inicial of ubicarValores("", valores)) {
    porCampo.set(inicial.campo, { ...inicial, posiciones: [], partes: [], primeraAparicion: null })
  }

  rutas.forEach((ruta, indiceDeParte) => {
    for (const u of ubicarValores(partes[ruta] ?? "", valores)) {
      const acumulado = porCampo.get(u.campo)!
      acumulado.veces += u.veces
      acumulado.posiciones.push(...u.posiciones)
      if (u.veces > 0) {
        acumulado.partes.push(nombreDeParte(ruta))
        if (acumulado.primeraAparicion === null) {
          acumulado.primeraAparicion = { parte: indiceDeParte, pos: u.posiciones[0] }
        }
      }
    }
  })

  for (const u of porCampo.values()) {
    u.partes = [...new Set(u.partes)]
    u.situacion =
      u.valor === "" ? "sin-dato" : u.veces === 0 ? "ausente" : u.veces === 1 ? "encontrado" : "repetido"
  }

  return [...porCampo.values()]
}

/**
 * Los pone en el orden en que aparecen en el documento, y no en el que venían.
 *
 * ═══ Por qué esto tiene que ser verdad y no una intención ═══
 *
 * El `orden` del `campos_schema` es el orden del formulario que va a ver el
 * director. Cuando reescribe el contrato y mueve la cláusula de la zona arriba
 * de todo, espera que el formulario la muestre arriba de todo: es la mitad del
 * sentido de subir una versión nueva.
 *
 * Antes decía que lo hacía y no lo hacía: el orden que salía era el de las
 * llaves de `form_data`, que es el de la versión ANTERIOR. El comentario lo
 * afirmaba, el nombre de un test lo afirmaba, y el test pasaba en verde porque
 * probaba la función aislada y nunca miraba quién le armaba la entrada. Ahora lo
 * hace de verdad, y hay un test que lo mide desde el .docx.
 *
 * Los que NO aparecen en el documento —los que el asesor de referencia trae
 * vacíos— van al final conservando el orden que traían: no hay ninguna posición
 * con la cual ordenarlos, y inventarle una sería peor que ponerlos juntos donde
 * se los pueda ver.
 */
export function ordenarComoEnElDocumento<T extends { primeraAparicion: { parte: number; pos: number } | null }>(
  ubicaciones: T[],
): T[] {
  return ubicaciones
    .map((u, i) => ({ u, i }))
    .sort((a, b) => {
      const x = a.u.primeraAparicion
      const y = b.u.primeraAparicion
      // Los que no aparecen, al final, en el orden en que venían.
      if (x === null && y === null) return a.i - b.i
      if (x === null) return 1
      if (y === null) return -1
      if (x.parte !== y.parte) return x.parte - y.parte
      if (x.pos !== y.pos) return x.pos - y.pos
      return a.i - b.i
    })
    .map(({ u }) => u)
}

/** Los campos que sí se pueden convertir en hueco: los que aparecen en el documento. */
export function seVaAUsar(u: UbicacionDeValor): boolean {
  return u.situacion === "encontrado" || u.situacion === "repetido"
}

/**
 * Los campos cuyo dato viene VACÍO en el asesor de referencia.
 *
 * ═══ Por qué esto NO es un "desaparecido", y por qué importa ═══
 *
 * `ubicarValores` separa con cuidado `ausente` (se buscó y no está) de
 * `sin-dato` (no había qué buscar). Si después los dos se juntan en el mismo
 * balde, el director lee *"ese dato deja de usarse"* sobre un campo que el
 * sistema **nunca buscó**. Es una afirmación que no puede hacer, y encima la
 * paga dos veces: el campo también se cae del `campos_schema` de la versión
 * nueva, o sea que deja de existir en el formulario de TODOS los asesores por
 * culpa de que UNO no lo tenía cargado.
 *
 * Es alcanzable de verdad: `formDataDe` en `confirmacion.ts` escribe `""` para
 * el campo que ese asesor no tenía, y hay un test que lo fija. Que hoy en
 * producción no haya ninguno es suerte, no diseño.
 *
 * Lo que corresponde decir es la verdad: **no se pudo comprobar**. El campo
 * sigue en la plantilla, y sigue sin saberse si el documento nuevo lo tiene.
 */
export function camposSinDato(ubicaciones: UbicacionDeValor[]): string[] {
  return ubicaciones.filter((u) => u.situacion === "sin-dato").map((u) => u.campo)
}

/**
 * Qué texto hay que cambiar por qué hueco, adentro del .docx que subió el
 * director.
 *
 * Es el gemelo de `reemplazosDelMolde` de la §7.2, y devuelve la misma forma
 * —`buscado`, `hueco` y `nombre`— para que `ponerHuecosEnDocx` y quien lea su
 * respuesta funcionen igual en los dos caminos. Lo que cambia es de dónde sale
 * el valor: allá, de lo que el director revisó en pantalla; acá, del
 * `form_data` que ya está guardado.
 */
export function reemplazosDeLaVersionNueva(
  ubicaciones: UbicacionDeValor[],
): Array<{ buscado: string; hueco: string; nombre: string }> {
  return ubicaciones
    .filter(seVaAUsar)
    .map((u) => ({ buscado: u.valor, hueco: comoQuedaEnElDocumento(u.campo), nombre: u.campo }))
}

// ---------------------------------------------------------------------------
// Qué campos cambian de una versión a la otra
// ---------------------------------------------------------------------------

export type CamposQueCambian = {
  /** Están en la versión nueva y no estaban antes. */
  nuevos: string[]
  /** Estaban antes y en la versión nueva ya no están. */
  desaparecidos: string[]
  /** Están en las dos. */
  iguales: string[]
}

/**
 * Qué cambia entre los campos de la versión vigente y los de la nueva.
 *
 * El spec §7.4.2 es taxativo en las DOS direcciones, y las dos tienen
 * consecuencias distintas:
 *
 *  · **campo nuevo** → hay que avisarlo. PRISMA no tiene ese dato de nadie, así
 *    que esos asesores quedan en `pendiente` y **siguen con la versión
 *    anterior** hasta que alguien se lo complete.
 *  · **campo desaparecido** → hay que avisarlo, pero **el dato NO se borra de
 *    `form_data`**. Ese es el único motivo por el que volver a la versión
 *    anterior sigue funcionando.
 *
 * Se compara por nombre y sin repetir. El orden de salida es el de entrada
 * —primero los nuevos en el orden en que vienen, después los desaparecidos en
 * el orden viejo— para que la pantalla no los mueva de lugar entre dos
 * corridas iguales.
 */
export function compararCampos(viejos: string[], nuevos: string[]): CamposQueCambian {
  const antes = [...new Set(viejos)]
  const ahora = [...new Set(nuevos)]
  const setAntes = new Set(antes)
  const setAhora = new Set(ahora)

  return {
    nuevos: ahora.filter((c) => !setAntes.has(c)),
    desaparecidos: antes.filter((c) => !setAhora.has(c)),
    iguales: antes.filter((c) => setAhora.has(c)),
  }
}

/**
 * Los nombres de campo que trae un `campos_schema` de la base, leído con
 * desconfianza.
 *
 * Es `jsonb`: lo que vuelve es `unknown` de verdad, no un tipo. Una fila vieja,
 * escrita a mano o de una versión anterior del formato puede traer cualquier
 * cosa, y un `.map(c => c.nombre)` pelado sobre eso explota adentro del
 * endpoint con un 500 que no le dice nada a nadie. Lo que no tiene forma de
 * campo se saltea, en vez de tumbar el pedido.
 */
export function nombresDelSchema(schema: unknown): string[] {
  if (!Array.isArray(schema)) return []
  const nombres: string[] = []
  for (const c of schema) {
    if (c === null || typeof c !== "object") continue
    const nombre = (c as Record<string, unknown>).nombre
    if (typeof nombre === "string" && nombre.trim() !== "") nombres.push(nombre)
  }
  return [...new Set(nombres)]
}

/**
 * Los valores de esta persona que SIGUEN ESTANDO, literales, adentro del molde
 * ya armado.
 *
 * ═══ Esta es la que le da dientes a la comprobación ═══
 *
 * El molde se arma del documento de UNA persona y después se lo rellena con los
 * datos de ESA MISMA persona para ver si vuelve a dar su documento. Dicho así,
 * casi siempre da verde: es un ida y vuelta sobre los mismos valores. Lo único
 * que esa comprobación atrapa es que el molde no se pueda rellenar.
 *
 * Lo que de verdad hace daño es otra cosa: un dato de esta persona que quedó
 * PEGADO en el molde. Pasa donde el reemplazo no llega —las notas al final, que
 * `ponerHuecosEnDocx` no toca, y los cuadros de texto, que no abre por dentro
 * para no romper el archivo—. Ese pedazo se lo lleva el molde al documento de
 * TODOS: el contrato de Bruno sale con el CUIT de Ana. Y la comprobación de ida
 * y vuelta no lo ve, porque para Ana está bien.
 *
 * Se mide sobre el molde y no sobre el resultado: si el valor sigue ahí después
 * de haber puesto los huecos, no se reemplazó, y punto.
 */
export function valoresQueSobrevivenEnElMolde(
  partesDelMolde: Record<string, string>,
  valores: Record<string, string>,
): UbicacionEnPartes[] {
  return ubicarValoresEnPartes(partesDelMolde, valores).filter((u) => u.veces > 0)
}

/** El mensaje de arriba, escrito. `null` cuando no sobrevivió ninguno. */
export function avisoDeValoresQueSobreviven(
  sobreviven: UbicacionEnPartes[],
  nombreDelAsesor: string,
): string | null {
  if (sobreviven.length === 0) return null
  const detalle = sobreviven
    .map((u) => `${u.campo} ("${u.valor}")${u.partes.length > 0 ? ` en ${u.partes.join(" y ")}` : ""}`)
    .join(", ")
  const uno = sobreviven.length === 1
  return (
    `${uno ? "Este dato" : "Estos datos"} de ${nombreDelAsesor} ${uno ? "quedó" : "quedaron"} adentro de la ` +
    `plantilla y no se ${uno ? "pudo" : "pudieron"} convertir en campo: ${detalle}. Si se guardara así, el ` +
    `documento de TODOS los asesores saldría con ${uno ? "ese dato" : "esos datos"} de ${nombreDelAsesor}. Casi ` +
    `siempre es porque está en una nota al final o en un cuadro de texto: movelo al cuerpo del documento en el Word ` +
    `y subilo de nuevo.`
  )
}

/**
 * Deja los huecos escritos a mano en su forma canónica: `{{ COMISION }}` pasa a
 * ser `{{COMISION}}`.
 *
 * ═══ Por qué hace falta, y qué rechazaba sin esto ═══
 *
 * `lib/plantillas/docx.ts` documenta —y tiene un `trim` en el parser justo por
 * eso— que el director escribe los huecos a mano en Word y que ahí sale
 * "{{ NOMBRE }}" con un espacio de más **muy fácil**. docxtemplater lo rellena
 * igual, así que el documento está bien.
 *
 * Pero la comprobación compara el archivo que subió contra el molde relleno, y
 * al hueco nuevo se le devuelve su nombre escrito canónico. Sin normalizar, un
 * lado decía "{{ COMISION }}" y el otro "{{COMISION}}", no coincidían, y el
 * pedido se rechazaba **con un mensaje que hablaba de otra cosa** — sobre un
 * archivo que estaba perfecto. Medido: el test del hueco con espacios daba 400.
 *
 * Se toca SOLO lo que tiene forma de hueco válido, el mismo alfabeto que usa
 * `huecosDe`. Un `{{ }}` vacío o un `{{ dos palabras }}` no son huecos y no se
 * tocan: cambiarlos sería reescribir el contrato de alguien.
 */
const HUECO_ESCRITO = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g

export function normalizarHuecosEscritosAMano(partes: Record<string, string>): Record<string, string> {
  const salida: Record<string, string> = {}
  for (const ruta of Object.keys(partes)) {
    salida[ruta] = (partes[ruta] ?? "").replace(HUECO_ESCRITO, (_, nombre: string) => `{{${nombre}}}`)
  }
  return salida
}

// ---------------------------------------------------------------------------
// LA PRUEBA CON DATOS CENTINELA
// ---------------------------------------------------------------------------

/**
 * ═══ Por qué el ida y vuelta solo no alcanza ═══
 *
 * La comprobación del spec §7.4.5 rellena el molde con los datos del MISMO
 * asesor del que salió y compara contra su documento. Dicho así es casi una
 * tautología: se sacan sus valores, se los vuelve a poner, y vuelve a decir lo
 * mismo. Da verde salvo que el .docx no se pueda abrir.
 *
 * Con datos CENTINELA —valores que no están en ninguna parte del documento— deja
 * de ser un ida y vuelta y pasa a ser una medición: cada hueco tiene que dejar
 * SU centinela, exactamente donde estaba su valor y en ningún otro lado. Si un
 * `{{hueco}}` quedó anidado adentro de otro, o se perdió, o se llevó puesto un
 * pedazo de texto fijo, el centinela aparece donde no va o no aparece donde sí.
 *
 * Y lo que se compara contra el resultado no sale del mismo camino: sale de
 * reemplazar los valores sobre el TEXTO PLANO, con la misma regla de borde de
 * palabra. Son dos implementaciones independientes —una sobre el XML de Word,
 * otra sobre texto— y tienen que coincidir. Que coincidan por casualidad es
 * mucho menos probable que dos errores iguales.
 */

/** El índice `n` escrito en letras, para que el centinela no tenga dígitos. */
function letrasDe(n: number): string {
  let salida = ""
  let x = n
  do {
    salida = String.fromCharCode(65 + (x % 26)) + salida
    x = Math.floor(x / 26) - 1
  } while (x >= 0)
  return salida
}

/**
 * Un valor de prueba por campo, garantizado ausente del documento.
 *
 * **Sin dígitos ni guiones bajos, a propósito.** El centinela va a quedar dentro
 * del texto mientras se siguen buscando otros valores, y un centinela con un
 * "1" adentro podría ser encontrado por un dato corto — que es justamente el
 * daño que esta prueba tiene que poder ver, no producir. Con letras solas, la
 * regla de borde de palabra hace imposible que nada caiga adentro.
 *
 * Si por lo que fuera el prefijo ya estuviera en el documento, se lo alarga
 * hasta que no esté. Determinista, y sin poder colgarse: cada vuelta agrega una
 * letra.
 */
export function centinelasPara(campos: string[], textoDelDocumento: string): Record<string, string> {
  let prefijo = "CENTINELAPRISMA"
  while (textoDelDocumento.includes(prefijo)) prefijo += "Z"

  const salida: Record<string, string> = {}
  ;[...new Set(campos)].forEach((campo, i) => {
    salida[campo] = `${prefijo}${letrasDe(i)}FIN`
  })
  return salida
}

/**
 * Cómo tendría que quedar el texto del documento si cada valor se reemplazara
 * por su centinela.
 *
 * Es la implementación INDEPENDIENTE contra la que se compara lo que hizo Word.
 * Reemplaza de más largo a más corto, igual que `ponerHuecosEnDocx`, porque si
 * un valor contiene a otro hay que consumir el grande antes de que el chico lo
 * parta por la mitad.
 */
export function textoEsperadoConCentinelas(
  partes: Record<string, string>,
  reemplazos: Array<{ buscado: string; centinela: string }>,
): Record<string, string> {
  const orden = [...reemplazos]
    .filter((r) => r.buscado !== "")
    .sort((a, b) => b.buscado.length - a.buscado.length)

  const salida: Record<string, string> = {}
  for (const ruta of Object.keys(partes)) {
    let texto = partes[ruta] ?? ""
    for (const { buscado, centinela } of orden) {
      const posiciones = aparicionesDe(texto, buscado)
      // De atrás para adelante: así las posiciones de más adelante siguen valiendo.
      for (let i = posiciones.length - 1; i >= 0; i--) {
        const at = posiciones[i]
        texto = texto.slice(0, at) + centinela + texto.slice(at + buscado.length)
      }
    }
    salida[ruta] = texto
  }
  return salida
}

/**
 * El mensaje de cuando la plantilla no resiste la prueba con datos centinela.
 *
 * Se dice ANTES de guardar nada. Que el molde ponga los datos en lugares que no
 * le corresponden es exactamente la falla que toda esta etapa vino a evitar, y
 * la única diferencia con el rojo del ida y vuelta es que esta se ve con datos
 * que no son de nadie — o sea, la que le va a pasar a los OTROS asesores.
 */
export function moldeNoResisteLaPrueba(observacion: string | null): string {
  return (
    "La plantilla que salió de este archivo no pone los datos donde corresponde. Se la probó con datos de prueba y " +
    `el resultado no dio lo esperado: ${observacion ?? "los campos quedaron en lugares distintos de los que tenían"}. ` +
    "No se guardó nada. Casi siempre es porque un campo quedó metido adentro de otro, o porque un dato que también " +
    "aparece en una parte fija del contrato se llevó puesta esa parte. Revisá en el Word que cada dato esté escrito " +
    "de una sola vez y volvé a subirlo."
  )
}

/**
 * El mensaje de cuando el dato de un campo se mete adentro del NOMBRE de otro.
 *
 * ═══ Por qué necesita su propio mensaje, y no el de la §7.2 ═══
 *
 * El daño es el mismo que allá: el campo se escribe `{{CAMPO_1}}`, ni el guión
 * bajo ni las llaves son letras ni números, así que un dato `"1"` lo encuentra
 * ahí adentro y deja `{{CAMPO_{{CAMPO_2}}}}`. Las llaves quedan cruzadas y el
 * molde entero deja de servir.
 *
 * Lo que cambia es el REMEDIO. `moldeInservible` termina diciendo "volvé a
 * detectar la plantilla y sacá ese campo", y **ese camino no existe en este
 * flujo**: acá no hay pantalla de revisión donde borrar un campo, y volver a
 * detectar rearmaría la plantilla desde los documentos VIEJOS, que es otra cosa.
 * Un mensaje correcto que manda a una pantalla que no lleva a ningún lado deja
 * al director sin nada que hacer.
 *
 * Y no es un caso exótico: `CAMPO_1`, `CAMPO_2`… es el fallback documentado del
 * spec §7.1 para cuando la IA no llega a nombrar los huecos. Con esos nombres,
 * cualquier dato de un dígito choca.
 *
 * Las dos salidas que sí existen desde acá son las que se ofrecen.
 */
export function moldeRotoPorChoque(
  choques: Array<{ campo: string; dentroDe: string }>,
  nombreDelAsesor: string,
): string | null {
  if (choques.length === 0) return null

  /**
   * Agrupado POR CAMPO CULPABLE, igual que en `moldeInservible`: un dato de un
   * dígito choca contra el nombre de todos los campos numerados, y listar los
   * ocho pares repite ocho veces el mismo nombre. El director tiene que leer QUÉ
   * campo lo rompe, no contra cuántos.
   */
  const porCampo = new Map<string, string[]>()
  for (const c of choques) porCampo.set(c.campo, [...(porCampo.get(c.campo) ?? []), c.dentroDe])

  const detalle = [...porCampo.entries()].map(([campo, contra]) => {
    const otros = contra.length - 1
    const donde = otros === 0 ? `"${contra[0]}"` : `"${contra[0]}" y ${otros} campo${otros === 1 ? "" : "s"} más`
    return `"${campo}" (se mete adentro del nombre de ${donde})`
  })
  const uno = detalle.length === 1

  return (
    `No se puede armar la plantilla con los datos de ${nombreDelAsesor}: ` +
    `${uno ? "el dato del campo" : "los datos de los campos"} ${detalle.join(", ")} ` +
    `${uno ? "es" : "son"} tan corto${uno ? "" : "s"} que aparece${uno ? "" : "n"} adentro del nombre de otro campo ` +
    `y le rompe${uno ? "" : "n"} las llaves. No se guardó nada. ` +
    `Tenés dos salidas: subí el archivo completado con los datos de otro asesor, ` +
    `${uno ? "cuyo dato de ese campo" : "cuyos datos de esos campos"} sea${uno ? "" : "n"} más largo${uno ? "" : "s"}; ` +
    `o, si ${uno ? "ese campo ya no va" : "esos campos ya no van"} en la versión nueva, ` +
    `saca${uno ? "lo" : "los"} del documento en el Word y volvé a subirlo.`
  )
}

/**
 * Los campos que, en ESTE asesor, tienen exactamente el mismo dato.
 *
 * Por qué frena todo: el reemplazo es textual. Si `ZONA` y `BARRIO` valen las
 * dos "Belgrano R" para Ana, no hay forma de saber cuál de los dos lugares del
 * contrato es de cuál campo — y el que entra primero se lleva los dos, dejando
 * al otro sin ningún lugar en el documento.
 *
 * `ponerHuecosEnDocx` lo devuelve como "faltante", que es cierto pero manda al
 * director al lugar equivocado: el mensaje de faltante habla de texto partido
 * en pedazos por Word, y acá el texto está entero. Se lo dice con lo que de
 * verdad pasó, y con lo único que él puede hacer: elegir de referencia a un
 * asesor cuyos datos no se repitan.
 *
 * Devuelve los grupos, no los pares, para no repetir treinta veces el mismo
 * nombre cuando tres campos coinciden.
 */
export function camposConElMismoDato(ubicaciones: UbicacionDeValor[]): string[][] {
  const porValor = new Map<string, string[]>()
  for (const u of ubicaciones) {
    if (!seVaAUsar(u)) continue
    porValor.set(u.valor, [...(porValor.get(u.valor) ?? []), u.campo])
  }
  return [...porValor.values()].filter((campos) => campos.length > 1)
}

/**
 * El mensaje de arriba, escrito. `null` cuando no hay ningún grupo repetido.
 */
export function avisoDeCamposConElMismoDato(grupos: string[][], nombreDelAsesor: string): string | null {
  if (grupos.length === 0) return null
  const detalle = grupos.map((campos) => campos.join(" y ")).join("; ")
  const uno = grupos.length === 1
  return (
    `${uno ? "Estos campos tienen" : "Estos grupos de campos tienen"} exactamente el mismo dato en ` +
    `${nombreDelAsesor}: ${detalle}. Así no hay forma de saber cuál va en cada lugar del contrato, y el que se ` +
    `marque primero se lleva los dos lugares. Elegí de referencia a un asesor cuyos datos no se repitan, o unificá ` +
    `esos campos en uno solo.`
  )
}

/**
 * El `campos_schema` de la versión nueva (spec §8.3), conservando el rótulo que
 * el director ya le había puesto a cada campo.
 *
 * Que el rótulo se herede no es cosmética. El director escribió "CUIT del
 * asesor" en la versión 1; si al subir la 2 ese campo volviera a llamarse
 * `CUIT` a secas, el formulario que él conocía cambia solo, sin que haya
 * cambiado nada del documento. Un campo que no reconoce es un campo que va a
 * volver a nombrar, y ahí sí se rompe algo: dos versiones de la misma plantilla
 * con nombres distintos para el mismo dato.
 *
 * El `orden` sale de la posición en `campos`, que es el orden en el que
 * aparecen en el documento nuevo. Ese es el orden que el director espera en el
 * formulario, y es el que puede haber cambiado a propósito al reescribir el
 * contrato.
 */
export function camposSchemaDeLaVersionNueva(
  campos: string[],
  schemaViejo: unknown,
): Array<{ nombre: string; label: string; orden: number }> {
  const rotulos = new Map<string, string>()
  if (Array.isArray(schemaViejo)) {
    for (const c of schemaViejo) {
      if (c === null || typeof c !== "object") continue
      const x = c as Record<string, unknown>
      if (typeof x.nombre !== "string" || x.nombre.trim() === "") continue
      if (typeof x.label === "string" && x.label.trim() !== "" && !rotulos.has(x.nombre)) {
        rotulos.set(x.nombre, x.label)
      }
    }
  }
  return [...new Set(campos)].map((nombre, orden) => ({ nombre, label: rotulos.get(nombre) ?? nombre, orden }))
}

// ---------------------------------------------------------------------------
// Lo que lee el director
// ---------------------------------------------------------------------------

/** Cuántos valores se nombran en el mensaje de rechazo antes de cortar. */
const CUANTOS_VALORES_SE_MUESTRAN = 4

/** Cómo se escribe un campo y su valor en los mensajes. */
const conSuValor = (u: UbicacionDeValor) => `${u.campo} ("${u.valor}")`

/**
 * Cuando el asesor que se eligió de molde no tiene datos guardados.
 *
 * Sin datos conocidos no hay NADA determinista que buscar, y buscar de otra
 * forma sería adivinar. Se dice qué hacer, no solo que no se puede.
 */
export const SIN_DATOS_DEL_ASESOR =
  "Ese asesor todavía no tiene datos guardados de esta plantilla, así que no hay ningún valor conocido para buscar " +
  "adentro del archivo que subiste. Elegí un asesor cuyo documento ya esté comprobado, o volvé a detectar la " +
  "plantilla primero."

/** Cuando la plantilla todavía no tiene una versión vigente contra la cual comparar. */
export const SIN_VERSION_VIGENTE =
  "Esta plantilla todavía no tiene ninguna versión activa, así que no hay con qué comparar la que subiste. " +
  "Detectá la plantilla primero con los documentos que ya tenés cargados."

/**
 * El rechazo del archivo genérico (spec §7.4.1), **con nombre y apellido**.
 *
 * Un "archivo inválido" pelado no sirve para nada: el director no sabe si subió
 * el archivo equivocado, si eligió el asesor equivocado o si el sistema falló.
 * Acá se dice exactamente qué se esperaba encontrar adentro y no apareció, que
 * es lo único que le permite darse cuenta solo.
 *
 * Se nombran los valores y no solo los campos, a diferencia de la §7.2 (que a
 * propósito no muestra el dato de otra persona). Acá no hay ese problema: el
 * documento que se está mirando es el que el director acaba de subir, con los
 * datos del asesor que él mismo eligió, y los tiene abiertos en el Word.
 */
export function moldeNoSeReconoce(ubicaciones: UbicacionDeValor[], nombreDelAsesor: string): string {
  const buscados = ubicaciones.filter((u) => u.situacion === "ausente")
  const vacios = ubicaciones.filter((u) => u.situacion === "sin-dato")

  const muestra = buscados.slice(0, CUANTOS_VALORES_SE_MUESTRAN).map(conSuValor).join(", ")
  const resto = buscados.length - CUANTOS_VALORES_SE_MUESTRAN
  const cola = resto > 0 ? `, y ${resto} campo${resto === 1 ? "" : "s"} más` : ""

  const loQueFalta =
    buscados.length === 0
      ? `Los ${vacios.length} campos que tiene guardados están vacíos, así que no hubo nada que buscar.`
      : `Se buscaron los datos de ${nombreDelAsesor} y no apareció ninguno: ${muestra}${cola}.`

  return (
    `El archivo que subiste no parece la versión nueva de este documento. ${loQueFalta} ` +
    `Tiene que ser el .docx de la versión nueva YA COMPLETADO con los datos de un asesor que ya esté cargado, y ese ` +
    `asesor tiene que ser el que elegiste. Con un archivo genérico o con los campos en blanco no hay forma de saber ` +
    `qué parte del texto es el dato de cada persona.`
  )
}

/**
 * El aviso de los campos que la versión nueva trae y antes no existían.
 *
 * Lo importante es la consecuencia, no el número: esos asesores **siguen con la
 * versión anterior**. Un aviso que dijera solo "hay 2 campos nuevos" deja al
 * director creyendo que el cambio ya está aplicado. `null` cuando no hay
 * ninguno.
 */
export function avisoDeCamposNuevos(nuevos: string[]): string | null {
  if (nuevos.length === 0) return null
  const uno = nuevos.length === 1
  return (
    `La versión nueva trae ${uno ? "un campo que antes no existía" : `${nuevos.length} campos que antes no existían`}: ` +
    `${nuevos.join(", ")}. PRISMA no tiene ${uno ? "ese dato" : "esos datos"} de nadie, así que hay que ` +
    `${uno ? "completárselo" : "completárselos"} a cada asesor a mano. Hasta que lo hagas, cada uno sigue con el ` +
    `documento que tiene hoy.`
  )
}

/**
 * El aviso de los campos que la versión nueva ya no tiene.
 *
 * La segunda mitad —que el dato NO se borra— no es un consuelo: es lo que hace
 * que volver a la versión anterior siga funcionando, y el director tiene que
 * saberlo antes de decidir. `null` cuando no desapareció ninguno.
 */
export function avisoDeCamposDesaparecidos(desaparecidos: string[]): string | null {
  if (desaparecidos.length === 0) return null
  const uno = desaparecidos.length === 1
  return (
    `En la versión nueva ya no ${uno ? "aparece un campo que antes sí estaba" : `aparecen ${desaparecidos.length} campos que antes sí estaban`}: ` +
    `${desaparecidos.join(", ")}. ${uno ? "Ese dato deja" : "Esos datos dejan"} de usarse, pero no se ` +
    `${uno ? "borra" : "borran"}: ${uno ? "queda guardado" : "quedan guardados"} por si volvés a la versión anterior.`
  )
}

/**
 * El aviso de los campos que no se pudieron comprobar porque el asesor de
 * referencia no tiene ese dato cargado.
 *
 * Dice las dos cosas que el director necesita: que el campo **sigue estando**, y
 * que de ese campo **no se sabe nada** —ni que está en el documento nuevo ni que
 * no está—. Y qué hacer para saberlo: elegir de referencia a alguien que sí lo
 * tenga. `null` cuando no hay ninguno.
 */
export function avisoDeCamposSinDato(campos: string[], nombreDelAsesor: string): string | null {
  if (campos.length === 0) return null
  const uno = campos.length === 1
  return (
    `${uno ? "Este campo no se pudo comprobar" : `Estos ${campos.length} campos no se pudieron comprobar`}, porque ` +
    `${nombreDelAsesor} no ${uno ? "tiene ese dato" : "tiene esos datos"} cargado${uno ? "" : "s"}: ` +
    `${campos.join(", ")}. ${uno ? "Se deja" : "Se dejan"} en la plantilla tal como ${uno ? "estaba" : "estaban"} ` +
    `—no ${uno ? "se borra" : "se borran"} nada—, pero no se sabe si el documento nuevo ${uno ? "lo" : "los"} ` +
    `sigue teniendo. Para averiguarlo, subí el archivo completado con los datos de un asesor que sí ` +
    `${uno ? "lo" : "los"} tenga.`
  )
}

/**
 * El aviso de los datos que aparecen más de una vez.
 *
 * No frena nada: que el nombre esté en la cláusula y en la firma es lo normal, y
 * las dos apariciones TIENEN que cambiar. Pero si una de ellas fuera parte del
 * texto fijo del contrato, el reemplazo se la lleva puesta — y eso lo atrapa la
 * comprobación de más abajo, que es la que manda. Esto es para que el director
 * sepa por dónde mirar si sale en rojo. `null` cuando no hay ninguno.
 */
export function avisoDeValoresRepetidos(ubicaciones: UbicacionDeValor[]): string | null {
  const repetidos = ubicaciones.filter((u) => u.situacion === "repetido")
  if (repetidos.length === 0) return null
  const detalle = repetidos.map((u) => `${u.campo} (${u.veces} veces)`).join(", ")
  const uno = repetidos.length === 1
  return (
    `${uno ? "Este dato aparece" : "Estos datos aparecen"} más de una vez en el documento y se ` +
    `${uno ? "va" : "van"} a reemplazar en todos los lugares: ${detalle}. Es lo normal cuando el nombre está en la ` +
    `cláusula y otra vez en la firma. Si alguno de esos lugares fuera texto fijo del contrato, va a salir en rojo ` +
    `acá abajo.`
  )
}

/**
 * El aviso de los datos tan cortos que se van a reemplazar donde no
 * corresponde, y de los que son un pedazo del dato de otro campo.
 *
 * Los dos se dicen juntos porque para el director son el mismo problema —"este
 * campo va a tocar cosas que no son suyas"— y separarlos en dos párrafos que
 * nombran a los mismos campos hace que no lea ninguno. `null` cuando no hay
 * ninguno de los dos.
 */
export function avisoDeDatosQueSePasan(ubicaciones: UbicacionDeValor[]): string | null {
  const cortos = ubicaciones.filter((u) => u.corto && seVaAUsar(u))
  const pedazos = ubicaciones.filter((u) => u.dentroDe.length > 0 && seVaAUsar(u))
  if (cortos.length === 0 && pedazos.length === 0) return null

  const partes: string[] = []
  if (cortos.length > 0) {
    const uno = cortos.length === 1
    partes.push(
      `${uno ? "El campo" : "Los campos"} ${cortos.map(conSuValor).join(", ")} ${uno ? "tiene un dato" : "tienen datos"} ` +
        `de muy pocas letras, así que ese texto se reemplaza en TODOS los lugares del contrato donde aparezca, no ` +
        `solo donde corresponde.`,
    )
  }
  if (pedazos.length > 0) {
    const detalle = pedazos.map((u) => `${u.campo} (está adentro de ${u.dentroDe.join(", ")})`).join(", ")
    partes.push(`El dato de estos campos es un pedazo del dato de otro: ${detalle}.`)
  }

  return `${partes.join(" ")} Si abajo hay algo en rojo, mirá primero por acá.`
}

/**
 * El renglón de arriba de todo: qué se leyó y qué falta hacer.
 *
 * Dice el número Y la consecuencia, igual que el de la confirmación. "8 campos
 * ubicados" sin el "todavía no se aplicó a nadie" al lado deja al director
 * creyendo que ya está.
 */
export function resumenDeLaVersionNueva(args: {
  version: number
  ubicados: number
  nuevos: string[]
  desaparecidos: string[]
}): string {
  const { version, ubicados } = args
  const base =
    ubicados === 1
      ? `Se leyó la versión ${version} y se ubicó 1 campo adentro del documento.`
      : `Se leyó la versión ${version} y se ubicaron ${ubicados} campos adentro del documento.`

  const cambios: string[] = []
  if (args.nuevos.length > 0) cambios.push(`${args.nuevos.length} campo${args.nuevos.length === 1 ? "" : "s"} nuevo${args.nuevos.length === 1 ? "" : "s"}`)
  if (args.desaparecidos.length > 0) {
    cambios.push(
      `${args.desaparecidos.length} que ya no ${args.desaparecidos.length === 1 ? "está" : "están"}`,
    )
  }
  const queCambia = cambios.length === 0 ? " Los campos son los mismos que antes." : ` Hay ${cambios.join(" y ")}.`

  return (
    `${base}${queCambia} Todavía no se aplicó a ningún asesor: mirá la vista previa y, si está bien, confirmá el ` +
    `reemplazo.`
  )
}

/**
 * La vista previa (spec §7.4.3): el documento de un asesor real armado con la
 * versión nueva, en texto plano.
 *
 * El cuerpo va PRIMERO y sin rótulo —es lo que el director espera leer— y las
 * demás partes van abajo, cada una con su nombre. Sin los rótulos, el legajo
 * del encabezado aparece pegado arriba del contrato como si fuera la primera
 * línea, y el director no tiene forma de saber que eso vive en el encabezado.
 *
 * Las partes vacías no se muestran: un `word/header1.xml` sin una letra adentro
 * es un rótulo que no explica nada.
 */
export function textoDeVistaPrevia(partes: Record<string, string>): string {
  /**
   * El MISMO recorrido con el que se ordenan los campos, no una copia: si los
   * dos se separaran, el director vería el formulario en un orden y el documento
   * en otro.
   */
  const rutas = rutasEnOrdenDeLectura(partes)
  const cuerpo = rutas.filter((r) => r === CUERPO)
  const resto = rutas.filter((r) => r !== CUERPO)

  const bloques: string[] = []
  for (const ruta of cuerpo) {
    const texto = (partes[ruta] ?? "").trim()
    if (texto !== "") bloques.push(texto)
  }
  /** Agrupadas por familia, para que header1 y header2 no salgan como dos rótulos iguales. */
  const porNombre = new Map<string, string[]>()
  for (const ruta of resto) {
    const texto = (partes[ruta] ?? "").trim()
    if (texto === "") continue
    const nombre = nombreDeParte(ruta)
    porNombre.set(nombre, [...(porNombre.get(nombre) ?? []), texto])
  }
  for (const [nombre, textos] of porNombre) {
    bloques.push(`— ${nombre} —\n${textos.join("\n")}`)
  }

  return bloques.join("\n\n")
}

// ---------------------------------------------------------------------------
// Lo que el endpoint devuelve
// ---------------------------------------------------------------------------

/**
 * La respuesta de `POST /api/asesor-docs/aplicar-version`.
 *
 * El nombre del endpoint dice "aplicar" y esta primera mitad NO aplica nada: la
 * versión queda guardada y sin usar hasta que el director confirme (spec
 * §7.4.4). Que el tipo lo diga por escrito es a propósito.
 *
 * La pantalla la importa con `import type`, que desaparece al compilar: así el
 * navegador no se baja este archivo ni lo que cuelga de sus importaciones.
 */
export type RespuestaVersionNueva = {
  versionId: string
  version: number
  /** Qué cambia respecto de la versión vigente. */
  campos: CamposQueCambian
  /** Campo por campo, qué se encontró adentro del documento nuevo. */
  ubicaciones: UbicacionDeValor[]
  /** El documento de un asesor real armado con la versión nueva, en texto. */
  vistaPrevia: { advisorId: string; nombre: string; texto: string }
  advertencias: string[]
  /** El renglón de arriba de todo, ya escrito para el director. */
  resumen: string
  /**
   * Siempre `false` en esta mitad. Existe para que la pantalla no pueda dar por
   * aplicado algo que no se aplicó, ni siquiera por descuido.
   */
  aplicada: false
}
