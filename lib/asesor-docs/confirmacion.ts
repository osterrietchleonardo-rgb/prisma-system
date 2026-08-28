import { nombreGenerico, sanearNombre, type PropuestaHueco } from "@/lib/asesor-docs/propuesta"
import { fusionarHuecosIguales } from "@/lib/asesor-docs/plantillas"

/**
 * Ojo con lo que se agregue acá: este archivo NO lo carga el navegador, y no
 * puede empezar a hacerlo. Importa `propuesta.ts`, que importa
 * `deteccion.ts`, que arrastra la librería de comparación de textos (900 KB).
 * La pantalla de revisión importa de acá SOLO tipos (`import type`, que
 * desaparece al compilar); la prosa que muestra vive en `plantillas.ts`.
 */

/**
 * La pantalla de revisión (spec §7.2) y lo que el endpoint de confirmar hace
 * con lo que el director editó ahí.
 *
 * Todo lo que decide algo vive acá y no adentro del `.tsx` ni del `route.ts`,
 * por el motivo de siempre: los tests del repo solo miran `lib/**`. Y acá lo
 * que se decide no es cosmético. Dos campos que terminan con el mismo nombre
 * son UN campo —el segundo pisa al primero en el objeto que se le pasa a
 * docxtemplater— y los dos lugares del contrato salen con el mismo dato. Eso
 * pasa sin ruido y termina en un papel que alguien firma.
 *
 * Nada de este archivo toca la base, la red ni el sistema de archivos.
 */

// ---------------------------------------------------------------------------
// De lo que editó el director a lo que se guarda
// ---------------------------------------------------------------------------

export type HuecoParaGuardar = {
  /** El mismo id que traía la propuesta. La pantalla edita por id. */
  id: string
  /**
   * El nombre técnico: mayúsculas, sin acentos, sin espacios. Es la llave con
   * la que docxtemplater rellena, y es lo que se escribe `{{ASÍ}}` en el .docx.
   */
  nombre: string
  /** Lo que el director escribió, tal cual, para mostrárselo a una persona. */
  label: string
  /** El texto de alrededor. Sirve para entender de qué dato se trata. */
  contexto: string
  /** Del id del asesor al texto que ese asesor tiene en este hueco. */
  valores: Record<string, string>
}

/**
 * Le pone a cada hueco un nombre técnico válido y ÚNICO.
 *
 * Dos cosas que no puede saltear:
 *
 *  1. **Sanear.** El director escribe "Comisión %" y eso no es una llave
 *     válida: docxtemplater no la encuentra al rellenar y el `nullGetter` de
 *     `lib/plantillas/docx.ts` deja el lugar EN BLANCO sin fallar. El contrato
 *     sale a la firma sin el dato y sin un solo aviso.
 *  2. **Desambiguar.** Dos huecos con el mismo nombre son un campo solo. El
 *     director puede repetir un nombre sin querer mientras edita, y "sin
 *     querer" es justamente el caso que hay que atajar.
 *
 * Devuelve además los avisos de lo que cambió, porque un nombre que se
 * transforma solo y en silencio es un nombre que el director no reconoce
 * después en el formulario.
 */
export function nombresFinales(huecos: Array<{ nombre: string }>): {
  nombres: string[]
  advertencias: string[]
} {
  const usados = new Set<string>()
  const nombres: string[] = []
  const advertencias: string[] = []

  huecos.forEach((h, i) => {
    const escrito = (h.nombre ?? "").trim()
    const saneado = sanearNombre(escrito) ?? nombreGenerico(i)

    if (saneado !== escrito) {
      advertencias.push(
        escrito === ""
          ? `Hay un campo sin nombre: se guarda como ${saneado}.`
          : `El campo "${escrito}" se guarda como ${saneado}: adentro de Word los nombres van en mayúsculas, sin ` +
            `acentos y sin espacios.`,
      )
    }

    let final = saneado
    if (usados.has(final)) {
      let n = 2
      while (usados.has(`${saneado}_${n}`)) n++
      final = `${saneado}_${n}`
      advertencias.push(
        `Hay dos campos llamados ${saneado}: al segundo se lo guarda como ${final}. Si fueran el mismo dato, los ` +
          `dos lugares del contrato saldrían con el mismo texto.`,
      )
    }
    usados.add(final)
    nombres.push(final)
  })

  return { nombres, advertencias }
}

export type PropuestaConfirmada = {
  templateId: string
  moldeAdvisorId: string
  huecos: HuecoParaGuardar[]
}

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const esTexto = (v: unknown): v is string => typeof v === "string"

/**
 * Lee y valida lo que manda la pantalla: la MISMA forma `Propuesta` que
 * devolvió la detección, ya con los nombres cambiados y los huecos de más
 * borrados.
 *
 * **Lo que NO se lee de acá, nunca:** la inmobiliaria y el rol. Esos salen de
 * la sesión del servidor. Del cuerpo del pedido llega qué plantilla, con qué
 * documento de molde y qué campos; el endpoint después comprueba contra la
 * base que esa plantilla y ese asesor sean de la inmobiliaria de quien pide.
 * El 27-ago-2026 se cerró en producción un agujero por confiar en un dato que
 * venía del navegador.
 *
 * Tampoco se leen `advertencias`, `documentosUsados` ni `laIaRespondio`: son
 * cosas que la pantalla recibió, no cosas que la pantalla decida. Quiénes
 * entran en la verificación lo vuelve a averiguar el servidor contra la base.
 */
export function leerPropuestaConfirmada(
  cuerpo: unknown,
): { ok: true; propuesta: PropuestaConfirmada; advertencias: string[] } | { ok: false; error: string } {
  if (cuerpo === null || typeof cuerpo !== "object") {
    return { ok: false, error: "El pedido no tiene la forma esperada." }
  }
  const c = cuerpo as Record<string, unknown>

  if (!esTexto(c.templateId) || !ES_UUID.test(c.templateId)) {
    return { ok: false, error: "Falta el tipo de documento." }
  }
  if (!esTexto(c.moldeAdvisorId) || !ES_UUID.test(c.moldeAdvisorId)) {
    return { ok: false, error: "Falta saber de qué asesor es el documento que se usa de molde." }
  }
  if (!Array.isArray(c.huecos)) {
    return { ok: false, error: "Falta la lista de campos." }
  }
  if (c.huecos.length === 0) {
    return {
      ok: false,
      error:
        "No quedó ningún campo. Una plantilla sin campos sería el contrato de una sola persona copiado para " +
        "todos: si ninguno de los datos que encontró es de verdad un dato de cada asesor, conviene volver a " +
        "detectar en vez de confirmar.",
    }
  }

  const crudos: PropuestaHueco[] = []
  const idsVistos = new Set<string>()
  for (const h of c.huecos as unknown[]) {
    if (h === null || typeof h !== "object") return { ok: false, error: "Hay un campo con una forma inesperada." }
    const x = h as Record<string, unknown>
    if (!esTexto(x.id) || x.id.trim() === "") return { ok: false, error: "Hay un campo sin identificador." }
    /**
     * Dos huecos con el mismo id romperían la edición de la pantalla (renombrar
     * uno cambiaría los dos) y, más abajo, harían que el reemplazo se pida dos
     * veces. Es imposible que pase desde la pantalla; se rechaza igual, porque
     * lo que llega por HTTP lo puede escribir cualquiera.
     */
    if (idsVistos.has(x.id)) return { ok: false, error: "Hay dos campos con el mismo identificador." }
    idsVistos.add(x.id)

    if (!esTexto(x.nombre)) return { ok: false, error: "Hay un campo sin nombre." }
    if (x.valores === null || typeof x.valores !== "object" || Array.isArray(x.valores)) {
      return { ok: false, error: "Hay un campo sin los valores de cada asesor." }
    }

    const valores: Record<string, string> = {}
    for (const [advisorId, valor] of Object.entries(x.valores as Record<string, unknown>)) {
      if (!ES_UUID.test(advisorId) || !esTexto(valor)) {
        return { ok: false, error: "Hay un valor de asesor con una forma inesperada." }
      }
      valores[advisorId] = valor
    }

    crudos.push({
      id: x.id,
      nombre: x.nombre,
      contexto: esTexto(x.contexto) ? x.contexto : "",
      valores,
    })
  }

  /**
   * Juntar va ANTES de nombrar: si no, los dos campos que son el mismo dato se
   * llevan dos nombres, y el segundo —el que se descarta— se habría comido un
   * "_2" que después le hace falta a otro.
   */
  const fusion = fusionarHuecosIguales(crudos)
  const { nombres, advertencias } = nombresFinales(fusion.huecos)

  return {
    ok: true,
    advertencias: [...fusion.advertencias, ...advertencias],
    propuesta: {
      templateId: c.templateId,
      moldeAdvisorId: c.moldeAdvisorId,
      huecos: fusion.huecos.map((h, i) => ({
        id: h.id,
        nombre: nombres[i],
        /** El rótulo es lo que escribió el director; si no escribió nada, el técnico. */
        label: h.nombre.trim() === "" ? nombres[i] : h.nombre.trim(),
        contexto: h.contexto,
        valores: h.valores,
      })),
    },
  }
}

// ---------------------------------------------------------------------------
// Lo que se le pide a las primitivas de .docx
// ---------------------------------------------------------------------------

/**
 * Cómo se escribe el campo adentro del documento de Word.
 *
 * **Las llaves NO son decoración.** `ponerHuecosEnDocx` valida el hueco
 * contra `{{NOMBRE}}` antes de tocar el XML y rechaza cualquier otra cosa; un
 * nombre pelado se devuelve como faltante con la leyenda "no tiene una forma
 * válida" y NO SE PONE NINGÚN CAMPO. Costó un ensayo con tres contratos
 * reales descubrirlo: los 11 campos salieron sin marcar y el documento molde
 * quedó idéntico al contrato de una sola persona.
 */
export function comoQuedaEnElDocumento(nombre: string): string {
  return `{{${nombre}}}`
}

/**
 * Qué texto hay que cambiar por qué hueco, dentro del .docx del asesor que
 * hace de molde.
 *
 * Un hueco cuyo valor en el molde es vacío no se pide: `ponerHuecosEnDocx`
 * ignora los buscados vacíos y los devuelve como faltantes con la leyenda
 * "(vacío -- se ignoró)", que no le dice nada a nadie. Acá se lo saca antes y
 * se lo cuenta con nombre y apellido en `sinValorEnElMolde`.
 *
 * Que un hueco no tenga valor en el molde es un caso real: pasa cuando OTRO
 * asesor tiene un texto de más que el del molde no tiene. Ahí no hay nada que
 * reemplazar, y ese texto de más se va a perder — cosa que la verificación
 * detecta y pone en rojo, como corresponde.
 *
 * Cada pedido lleva las dos formas del campo: `hueco` es lo que se escribe en
 * el .docx ({{CUIT}}) y `nombre` es el campo pelado (CUIT), que es lo que se
 * le muestra a una persona. Van juntas para que quien recorra la respuesta de
 * `ponerHuecosEnDocx` —que devuelve la forma con llaves— pueda volver al
 * nombre sin tener que recortar caracteres a mano.
 */
export function reemplazosDelMolde(
  huecos: HuecoParaGuardar[],
  moldeAdvisorId: string,
): {
  reemplazos: Array<{ buscado: string; hueco: string; nombre: string }>
  sinValorEnElMolde: string[]
} {
  const reemplazos: Array<{ buscado: string; hueco: string; nombre: string }> = []
  const sinValorEnElMolde: string[] = []

  for (const h of huecos) {
    const valor = (h.valores[moldeAdvisorId] ?? "").trim()
    if (valor === "") {
      sinValorEnElMolde.push(h.nombre)
      continue
    }
    reemplazos.push({ buscado: valor, hueco: comoQuedaEnElDocumento(h.nombre), nombre: h.nombre })
  }

  return { reemplazos, sinValorEnElMolde }
}

/** El `campos_schema` de la versión, con la forma que pide la spec §8.3. */
export function camposSchema(huecos: HuecoParaGuardar[]): Array<{ nombre: string; label: string; orden: number }> {
  return huecos.map((h, i) => ({ nombre: h.nombre, label: h.label, orden: i }))
}

/**
 * El `form_data` de un asesor: de nombre de campo al texto que le corresponde.
 *
 * Devuelve `null` cuando ese asesor no tiene NINGÚN valor, que es la forma de
 * decir "este asesor no entró en la comparación". No es lo mismo que tener
 * todos los campos vacíos, y confundirlos haría que se le arme un contrato con
 * todos los datos en blanco creyendo que está bien.
 */
export function formDataDe(huecos: HuecoParaGuardar[], advisorId: string): Record<string, string> | null {
  const tieneAlguno = huecos.some((h) => Object.prototype.hasOwnProperty.call(h.valores, advisorId))
  if (!tieneAlguno) return null

  const datos: Record<string, string> = {}
  for (const h of huecos) datos[h.nombre] = h.valores[advisorId] ?? ""
  return datos
}

// ---------------------------------------------------------------------------
// Los datos demasiado cortos
// ---------------------------------------------------------------------------

/**
 * Hasta cuántos caracteres un dato se considera "demasiado corto".
 *
 * Sale de una prueba con tres contratos de partnership reales, donde la
 * comparación aisló tres datos así: `"1"` (el día de "1 de marzo"), `"35"`
 * (el número de "treinta y cinco por ciento (35%)") y `"A."` (lo que queda de
 * "S.A." cuando el otro dice "S.R.L."). Ninguno de los tres es un dato: son
 * pedazos de un dato que la comparación no pudo separar entero.
 *
 * Y hacen daño de verdad, porque `ponerHuecosEnDocx` reemplaza TODAS las
 * apariciones: el `"A."` de la razón social del asesor también se lleva puesto
 * el "S.A." de la inmobiliaria, y el `"1"` del día se lleva el "(1)" de "una
 * (1) instancia mensual". Medido en esa prueba: 6 reemplazos donde tenía que
 * haber 1.
 *
 * Hay un daño peor todavía. El campo se escribe `{{CAMPO_1}}`, y el guión bajo
 * y las llaves no son letras ni números, así que un dato de un solo dígito
 * ENCUENTRA ese "1" adentro del campo que ya se puso y lo reemplaza:
 * `{{CAMPO_{{CAMPO_14}}}}`. El .docx queda con las llaves cruzadas y
 * docxtemplater ya no lo puede abrir — el molde entero deja de servir.
 */
export const LARGO_DE_DATO_SOSPECHOSO = 3

/**
 * Los campos cuyo dato es tan corto que va a aparecer en lugares del contrato
 * que no le corresponden.
 *
 * No se borran solos: se le muestran al director, que es el único que sabe si
 * ese "35" es la comisión de esa persona o el "(35)" de otra cláusula. Sacarlo
 * es un clic en la pantalla de revisión, y para eso está.
 */
export function camposConDatoCorto(huecos: HuecoParaGuardar[], moldeAdvisorId: string): string[] {
  return huecos
    .filter((h) => {
      const valor = (h.valores[moldeAdvisorId] ?? "").trim()
      return valor.length > 0 && valor.length <= LARGO_DE_DATO_SOSPECHOSO
    })
    .map((h) => h.nombre)
}

/**
 * El aviso de que el contrato tiene notas al FINAL con texto.
 *
 * El cartel de la pantalla dice que los campos salen del cuerpo; esto lo hace
 * concreto y con nombre propio cuando pasa de verdad. La versión anterior del
 * cartel prometía "te lo avisamos aparte" y **no había ningún aviso en ninguna
 * parte**: la promesa era falsa.
 *
 * No frena nada por sí solo. Lo que frena, si el dato de esa nota cambia de
 * persona a persona, es la comparación: `textoPorParte` sí lee las notas al
 * final y la diferencia sale en rojo con el motivo.
 *
 * `null` cuando no hay notas al final con texto.
 */
export function avisoDeNotasAlFinal(textoDeLasNotas: string): string | null {
  if (textoDeLasNotas.trim() === "") return null
  return (
    "El contrato tiene notas al final del documento. La plantilla no las rellena: la nota que quede es la del " +
    "documento que se usa de molde, igual para todos. Si ahí hay un dato de cada persona, va a salir en rojo acá " +
    "abajo y hay que moverlo al cuerpo del contrato en el Word."
  )
}

/**
 * El mensaje de cuando el molde quedó inservible: se le pusieron los campos y
 * después no se lo puede rellenar.
 *
 * Se dice ANTES de guardar nada. Guardar una versión con un molde que no abre
 * sería quemar un número de versión y dejar un archivo roto en el camino, para
 * que el director descubra el problema recién cuando alguien pida el contrato.
 */
/**
 * Los campos cuyo dato se mete DENTRO del nombre de otro campo, y por eso
 * rompen el molde.
 *
 * Es la causa exacta —no una sospecha por el largo— de que el documento quede
 * sin poder abrirse. El campo se escribe `{{PLAZO_2026}}`; ni el guión bajo ni
 * las llaves son letras ni números, así que un dato `"2026"` lo encuentra ahí
 * adentro y lo reemplaza, dejando `{{PLAZO_{{ANIO}}}}`. Las llaves quedan
 * cruzadas y docxtemplater ya no puede leer el archivo.
 *
 * El aviso por largo (`camposConDatoCorto`, 3 caracteres) es una advertencia
 * temprana para el director; ESTO es el diagnóstico. Un dato de 4 caracteres
 * como "2026" rompe igual y el largo no lo ve, y sin esto el director recibía
 * un "no se puede rellenar" y nada más.
 *
 * Se mira el nombre YA saneado, que es el que se escribe en el .docx, y se usa
 * la misma regla de `ponerHuecosEnDocx`: no cuenta si el texto cae partiendo
 * una palabra por la mitad.
 */
export function camposQueChocanConOtroNombre(
  huecos: HuecoParaGuardar[],
  moldeAdvisorId: string,
): Array<{ campo: string; dentroDe: string }> {
  const esLetraONumero = /[\p{L}\p{N}]/u
  const choques: Array<{ campo: string; dentroDe: string }> = []

  for (const h of huecos) {
    const valor = (h.valores[moldeAdvisorId] ?? "").trim()
    if (valor === "") continue

    for (const otro of huecos) {
      if (otro === h) continue
      const escrito = comoQuedaEnElDocumento(otro.nombre)
      let desde = 0
      while (desde <= escrito.length) {
        const at = escrito.indexOf(valor, desde)
        if (at === -1) break
        const antes = escrito[at - 1]
        const despues = escrito[at + valor.length]
        const parteDePalabra =
          (antes !== undefined && esLetraONumero.test(antes)) ||
          (despues !== undefined && esLetraONumero.test(despues))
        if (!parteDePalabra) {
          choques.push({ campo: h.nombre, dentroDe: otro.nombre })
          break
        }
        desde = at + 1
      }
    }
  }

  return choques
}

/**
 * El mensaje de cuando el molde quedó inservible: se le pusieron los campos y
 * después no se lo puede rellenar.
 *
 * Se dice ANTES de guardar nada, y **con nombre y apellido**. Un
 * "no se puede rellenar" pelado deja al director sin nada que hacer: no sabe
 * qué campo sacar y volver a detectar le devuelve exactamente el mismo
 * problema.
 */
export function moldeInservible(args: {
  choques: Array<{ campo: string; dentroDe: string }>
  camposCortos: string[]
}): string {
  const base =
    "Al marcar los campos, el documento quedó de una forma que después no se puede rellenar, así que no se guardó nada."

  if (args.choques.length > 0) {
    /**
     * Agrupado POR CAMPO CULPABLE, no por par. Un dato de un dígito choca con
     * el nombre de todos los campos numerados, y listar los ocho pares dejaba
     * un párrafo que repetía ocho veces el mismo nombre: el director tiene que
     * leer QUÉ campo sacar, no contra cuántos choca.
     */
    const porCampo = new Map<string, string[]>()
    for (const c of args.choques) porCampo.set(c.campo, [...(porCampo.get(c.campo) ?? []), c.dentroDe])

    const detalle = [...porCampo.entries()].map(([campo, contra]) => {
      const otros = contra.length - 1
      const donde = otros === 0 ? `"${contra[0]}"` : `"${contra[0]}" y ${otros} campo${otros === 1 ? "" : "s"} más`
      return `"${campo}" (se mete adentro de ${donde})`
    })

    return (
      `${base} ${detalle.length === 1 ? "El campo que lo rompe es" : "Los campos que lo rompen son"} ` +
      `${detalle.join(", ")}. Ese dato es tan corto que aparece adentro del nombre de otro campo y le rompe las ` +
      `llaves. Volvé a detectar y sacá ${detalle.length === 1 ? "ese campo" : "esos campos"} antes de confirmar.`
    )
  }

  if (args.camposCortos.length > 0) {
    const cuantos = args.camposCortos.length
    return (
      `${base} Lo más probable es que sea por ${cuantos === 1 ? "el campo" : "los campos"} ` +
      `${args.camposCortos.join(", ")}, cuyo dato es de muy pocas letras y se mete donde no corresponde. Volvé a ` +
      `detectar y sacá ${cuantos === 1 ? "ese campo" : "esos campos"} antes de confirmar.`
    )
  }

  return (
    `${base} No se pudo señalar un campo en particular: probá sacando los que tengan un dato de pocas letras, o los ` +
    `que aparezcan repetidos en el contrato.`
  )
}

// ---------------------------------------------------------------------------
// La decisión final
// ---------------------------------------------------------------------------

/**
 * Cómo queda cada asesor después de la verificación.
 *
 * Solo hay dos valores, y no tres. La columna acepta también `pendiente`, pero
 * acá no se usa a propósito: la solapa "Plantillas" cuenta en rojo únicamente
 * los `revisar` (ver `armarFilas` en `plantillas.ts`), así que un asesor
 * marcado `pendiente` no aparecería en ningún contador y el director leería
 * "la plantilla ya está detectada pero falta confirmarla" sobre una plantilla
 * que ACABA de confirmar. Todo lo que no se pudo comprobar necesita que
 * alguien lo mire: eso es `revisar`.
 */
export type ResultadoDeAsesor = {
  advisorId: string
  /** Para mostrárselo al director. El id no le sirve de nada. */
  nombre: string
  estado: "ok" | "revisar"
  /** Por qué está en rojo. `null` cuando está bien. */
  observacion: string | null
}

/**
 * Si la plantilla se publica o se queda en borrador.
 *
 * **La regla que no se puede romper:** alcanza con UN asesor en rojo para que
 * la plantilla no se use con nadie. La versión se guarda igual —el trabajo del
 * director no se tira— pero queda como borrador.
 *
 * Un hueco que no se pudo marcar en el molde también frena la publicación,
 * aunque los asesores hayan dado todos verde. Motivo: ese campo va a figurar en
 * el formulario de la plantilla y editarlo no va a cambiar el documento, porque
 * el `{{HUECO}}` no llegó a entrar en el .docx. Un campo que existe en la
 * pantalla y no existe en el papel es exactamente la clase de falla muda que
 * toda esta verificación vino a evitar.
 *
 * Y con cero asesores verificados tampoco se publica: no se comprobó nada, y
 * "no se encontró ningún problema" no es lo mismo que "está bien".
 */
export function laPlantillaSePublica(args: {
  resultados: ResultadoDeAsesor[]
  huecosNoColocados: string[]
}): boolean {
  if (args.resultados.length === 0) return false
  if (args.huecosNoColocados.length > 0) return false
  return args.resultados.every((r) => r.estado === "ok")
}

/**
 * Lo que se guarda en `advisor_doc_templates.estado`.
 *
 * Existe para que el endpoint no tenga que escribir `"activa"` ni
 * `"borrador"` en ninguna parte: ahí, esos dos literales son la regla que no
 * se puede romper, y un literal suelto en el cableado es un literal que se
 * puede dar vuelta sin que ninguna función pura se entere. Acá está bajo test,
 * y el endpoint tiene el suyo.
 */
export function estadoDeLaPlantilla(args: {
  resultados: ResultadoDeAsesor[]
  huecosNoColocados: string[]
}): "activa" | "borrador" {
  return laPlantillaSePublica(args) ? "activa" : "borrador"
}

/**
 * El renglón que resume cómo salió, para el cartel de arriba de todo.
 *
 * Dice el número Y la consecuencia. "2 de 3 asesores" sin el "no se usa con
 * nadie" al lado deja al director sin saber si tiene que hacer algo.
 */
export function resumenDeLaConfirmacion(args: {
  resultados: ResultadoDeAsesor[]
  huecosNoColocados: string[]
  version: number
}): string {
  const publicada = laPlantillaSePublica(args)
  const total = args.resultados.length
  const enRojo = args.resultados.filter((r) => r.estado === "revisar").length

  if (publicada) {
    return total === 1
      ? `Listo: la versión ${args.version} quedó activa y el único asesor comprobado coincide.`
      : `Listo: la versión ${args.version} quedó activa y los ${total} asesores comprobados coinciden.`
  }

  const cola = "queda como borrador y no se usa con nadie."

  if (total === 0) {
    return `La versión ${args.version} se guardó, pero no se pudo comprobar contra ningún asesor: ${cola}`
  }

  if (enRojo > 0) {
    const quienes = enRojo === 1 ? "1 asesor no coincide" : `${enRojo} asesores no coinciden`
    return `La versión ${args.version} se guardó, pero ${quienes} de ${total}: ${cola}`
  }

  /**
   * Todos los asesores dieron verde y aun así no se publica: fue por un campo
   * que no se pudo marcar en el documento molde. Decir "0 asesores no
   * coinciden" acá sería un número correcto y una explicación falsa.
   */
  const cuantos = args.huecosNoColocados.length
  const campos = args.huecosNoColocados.join(", ")
  return (
    `La versión ${args.version} se guardó y los ${total} asesores comprobados coinciden, pero ` +
    `${cuantos === 1 ? "el campo" : "los campos"} ${campos} no ${cuantos === 1 ? "se pudo" : "se pudieron"} ` +
    `marcar dentro del documento: ${cola}`
  )
}

// ---------------------------------------------------------------------------
// Lo que el endpoint devuelve
// ---------------------------------------------------------------------------

/**
 * La respuesta de `POST /api/asesor-docs/confirmar-plantilla`.
 *
 * La pantalla la importa con `import type`, que desaparece al compilar: así el
 * navegador NO se baja este archivo (ni la librería de comparación de textos
 * que hay del otro lado de sus importaciones). Escrito una sola vez para que
 * el servidor y la pantalla no puedan discrepar sobre la forma.
 */
export type RespuestaConfirmacion = {
  versionId: string
  version: number
  /** Cómo quedó la plantilla. `activa` solo si TODO salió bien. */
  estado: "activa" | "borrador"
  /** Cuántos campos entraron de verdad en el documento molde. */
  camposPuestos: number
  /** Los que no se pudieron marcar. Cualquiera de estos la deja en borrador. */
  huecosNoColocados: string[]
  resultados: ResultadoDeAsesor[]
  advertencias: string[]
  /** El renglón de arriba de todo, ya escrito para el director. */
  resumen: string
}

/**
 * Se re-exporta desde donde vivía. La función se mudó a `plantillas.ts` para
 * que la PANTALLA pueda usarla —tiene que poder decir cuántos campos se van a
 * guardar DE VERDAD, y eso depende de la fusión— sin arrastrar al navegador la
 * librería de comparación de textos que cuelga de este archivo.
 */
export { fusionarHuecosIguales }
