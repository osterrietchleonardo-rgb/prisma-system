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
export type UbicacionEnPartes = UbicacionDeValor & { partes: string[] }

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
  const rutas = Object.keys(partes).sort()
  const porCampo = new Map<string, UbicacionEnPartes>()

  /**
   * El punto de partida sale de buscar sobre el texto VACÍO: así el valor
   * recortado, el `corto` y el `dentroDe` —que no dependen del documento— se
   * calculan una sola vez y con la misma regla, en vez de escribirse de nuevo
   * acá y poder separarse de `ubicarValores` sin que nadie se entere.
   */
  for (const inicial of ubicarValores("", valores)) {
    porCampo.set(inicial.campo, { ...inicial, posiciones: [], partes: [] })
  }

  for (const ruta of rutas) {
    for (const u of ubicarValores(partes[ruta] ?? "", valores)) {
      const acumulado = porCampo.get(u.campo)!
      acumulado.veces += u.veces
      acumulado.posiciones.push(...u.posiciones)
      if (u.veces > 0) acumulado.partes.push(nombreDeParte(ruta))
    }
  }

  for (const u of porCampo.values()) {
    u.partes = [...new Set(u.partes)]
    u.situacion =
      u.valor === "" ? "sin-dato" : u.veces === 0 ? "ausente" : u.veces === 1 ? "encontrado" : "repetido"
  }

  return [...porCampo.values()]
}

/** Los campos que sí se pueden convertir en hueco: los que aparecen en el documento. */
export function seVaAUsar(u: UbicacionDeValor): boolean {
  return u.situacion === "encontrado" || u.situacion === "repetido"
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
  const rutas = Object.keys(partes).sort()
  const cuerpo = rutas.filter((r) => r === "word/document.xml")
  const resto = rutas.filter((r) => r !== "word/document.xml")

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
