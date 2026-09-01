import { DELIMITADORES } from "@/lib/plantillas/docx"
import { LARGO_DE_DATO_SOSPECHOSO } from "@/lib/asesor-docs/confirmacion"
import { lugaresDeUnValor, type SospechaDeTextoFijo } from "@/lib/asesor-docs/version-nueva"

/**
 * LA RED QUE SE CORRE ANTES DE ESCRIBIRLE EL DOCUMENTO A UNA PERSONA (spec §7.5).
 *
 * ═══ Por qué la red de la §7.3 NO sirve acá, y hay que hacer otra ═══
 *
 * En la primera detección hay verdad de referencia: el `.docx` original de cada
 * asesor. Se rellena la plantilla con sus datos y se compara contra su archivo;
 * lo que no da idéntico queda en rojo. Es una medición contra algo real.
 *
 * En una versión NUEVA eso no existe. El original de Bruno es de la versión
 * **vieja**, así que comparar el regenerado contra él da distinto en todos
 * lados — justamente porque cambió la versión. **No hay contra qué comparar.**
 *
 * Y la idea que aparece sola —comparar entre sí los documentos regenerados de
 * varios asesores y exigir que toda diferencia caiga en un campo declarado—
 * **ya se probó y se descartó, medida**. El caso "Palermo": si la zona de Ana
 * es "Palermo" y el contrato dice "nuestra oficina de Palermo", el molde queda
 * con `{{ZONA}}` DOS veces; al regenerar, la diferencia entre el documento de
 * Ana y el de Bruno cae exactamente en un campo declarado. **El daño tiene
 * forma de campo, y por eso es invisible para esa comparación.**
 *
 * Lo que sí se puede comprobar, por asesor y antes de escribirle nada, es lo
 * que hay acá abajo. Las cuatro son "NO ESCRIBO", no "escribo y aviso": el
 * director ya dijo que sí, así que lo que sigue es un contrato que alguien va a
 * firmar.
 *
 *  1. **Que sus datos hayan aterrizado** (`camposQueNoAterrizaron`). Un campo
 *     que no aterriza es un contrato con un blanco.
 *  2. **Que no se le haya colado el dato de otro** (`datosDeOtroQueSeColaron`).
 *  3. **Que no quede un hueco sin rellenar** (`avisoDeHuecosSinRellenar`). Un
 *     `{{ZONA}}` literal en un contrato que va a la firma es el peor resultado
 *     posible, y es trivial de detectar.
 *  4. **La cuenta cruzada de la 7a, acá como FRENO** (`avisoDeTextoFijoQueFrena`).
 *     Allá es una advertencia a propósito, porque el §7.4.3 es una vista previa
 *     y el director todavía tiene que decir que sí. Acá ya dijo que sí.
 *
 * Todo el texto que lee el director vive en este archivo y no en el `.tsx` ni
 * suelto adentro del endpoint: los tests del repo miran `lib/**`, y esa regla
 * ya cobró dos veces en esta etapa.
 */

// ---------------------------------------------------------------------------
// Contar los huecos del molde
// ---------------------------------------------------------------------------

/**
 * La forma del hueco se ARMA con `DELIMITADORES`, no se escribe a mano.
 *
 * `docx.ts` documenta el daño MEDIDO de que dos copias de `{{` y `}}`
 * discrepen: un regex escrito a mano no se entera de que alguien cambió los
 * delimitadores, uno armado desde la constante sigue el cambio solo. Es la
 * misma decisión que ya tomó `normalizarHuecosEscritosAMano`.
 */
const paraRegex = (d: string) => d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
/**
 * Y el espacio que se tolera adentro del hueco es **horizontal**, nunca un
 * salto de línea.
 *
 * `textoPorParte` pega los párrafos con `\n`. Con un `\s*` —que matchea el
 * salto— un `{{` al final de un párrafo y un `NOMBRE}}` al principio del
 * siguiente armarían un hueco FANTASMA que no existe: el contador diría que el
 * molde promete un campo de más, la comprobación de aterrizaje lo daría por no
 * aterrizado, y se frenaría un documento perfecto.
 *
 * Es el mismo agujero que `huecosDe` tapa metiendo un `|||` entre párrafos, con
 * el mismo motivo escrito allá. Acá el separador no se puede meter —el texto
 * viene ya armado— así que se tapa por el otro lado.
 */
const HUECO = new RegExp(
  `${paraRegex(DELIMITADORES.start)}[ \\t]*([A-Za-z0-9_]+)[ \\t]*${paraRegex(DELIMITADORES.end)}`,
  "g",
)

/**
 * Cuántas veces aparece el hueco de cada campo adentro del molde, contando
 * TODAS las partes del paquete.
 *
 * ═══ Por qué se cuenta sobre el molde y no sobre el `campos_schema` ═══
 *
 * El `campos_schema` de una versión subida incluye también los campos que el
 * asesor de referencia traía VACÍOS (`camposSinDato` en `version-nueva.ts`):
 * no se los pudo buscar, así que no se los pudo convertir en hueco, pero se los
 * deja en el esquema para no borrarle el campo a TODOS los asesores porque UNO
 * no lo tenía cargado. Esos campos **no tienen hueco en el molde**, y exigirles
 * que aterricen sería frenar por algo que el molde nunca prometió.
 *
 * Lo que decide si el contrato sale con un blanco es el molde: si adentro hay
 * `{{ZONA}}`, ese lugar se llena o queda vacío. El esquema no decide nada.
 *
 * Se cuentan las partes que entrega `textoPorParte`, o sea el documento ENTERO
 * —cuerpo, encabezado, pie, notas y comentarios—, incluidas **las notas al
 * final que docxtemplater NO rellena**. Es a propósito: un `{{ZONA}}` que vive
 * ahí no se llena nunca, y el contrato sale a la firma con las llaves puestas.
 * Contarlo es lo que lo delata.
 */
export function contarHuecosDelMolde(partesDelMolde: Record<string, string>): Record<string, number> {
  const cuenta: Record<string, number> = {}
  for (const ruta of Object.keys(partesDelMolde)) {
    for (const m of (partesDelMolde[ruta] ?? "").matchAll(HUECO)) {
      cuenta[m[1]] = (cuenta[m[1]] ?? 0) + 1
    }
  }
  return cuenta
}

/**
 * Cuántas veces aparece `buscado` adentro de `texto`, sin solaparse.
 *
 * **Sin regla de borde de palabra, y eso es deliberado**, al revés que
 * `ubicarValores`. Allá la regla existe para PREDECIR qué va a reemplazar
 * `ponerHuecosEnDocx`; acá se cuenta lo que YA quedó escrito en el documento
 * de una persona, y la regla de borde produciría un falso rojo real: dos
 * huecos pegados —`{{ZONA}}{{ZONA}}`— dejan "PalermoPalermo", y el borde de
 * palabra descarta las DOS apariciones porque cada una tiene una letra al
 * lado. Se frenaría un documento perfecto.
 */
function vecesEn(texto: string, buscado: string): number {
  if (buscado === "") return 0
  let veces = 0
  let desde = 0
  for (;;) {
    const at = texto.indexOf(buscado, desde)
    if (at === -1) return veces
    veces += 1
    desde = at + buscado.length
  }
}

/** Todas las partes del documento pegadas, para contar sobre el texto entero. */
function todoElTexto(partes: Record<string, string>): string {
  return Object.keys(partes)
    .sort()
    .map((r) => partes[r] ?? "")
    .join("\n")
}

// ---------------------------------------------------------------------------
// EL CAMPO NUEVO QUE ESTA PERSONA NO TIENE (spec §7.4.2)
// ---------------------------------------------------------------------------

/**
 * Los huecos del molde para los que este asesor **no tiene dato**.
 *
 * Es el caso que el spec §7.4.2 declara normal: la versión nueva trajo un campo
 * que antes no existía, PRISMA no tiene ese dato de nadie, y hay que
 * completarlo asesor por asesor. Ese asesor queda `pendiente` y **sigue con la
 * versión anterior**.
 *
 * No es una falla de la red: es una respuesta distinta. Por eso está separado
 * de las cuatro comprobaciones — generar igual dejaría el contrato con ese
 * lugar en blanco, y un blanco en un contrato no se ve.
 */
export function huecosSinDato(huecosDelMolde: Record<string, number>, datos: Record<string, string> | null): string[] {
  const tiene = (campo: string) => (datos?.[campo] ?? "").trim() !== ""
  return Object.keys(huecosDelMolde)
    .filter((campo) => !tiene(campo))
    .sort()
}

/** Lo que queda escrito en `observacion` para que el director sepa qué falta. */
export function observacionDePendiente(campos: string[]): string {
  const uno = campos.length === 1
  return (
    `La versión nueva trae ${uno ? "un campo" : `${campos.length} campos`} que esta persona todavía no tiene ` +
    `cargado${uno ? "" : "s"}: ${campos.join(", ")}. Su documento quedó como estaba, con la versión anterior. ` +
    `Completá ${uno ? "ese dato" : "esos datos"} y volvé a aplicarle la versión.`
  )
}

// ---------------------------------------------------------------------------
// 1. QUE SUS DATOS HAYAN ATERRIZADO
// ---------------------------------------------------------------------------

export type CampoQueNoAterrizo = {
  campo: string
  /** Cuántas veces el molde tiene el hueco de ese campo. */
  enElMolde: number
  /** Cuántas veces quedó su valor en el documento generado. */
  enElGenerado: number
}

/**
 * Los campos cuyo dato NO llegó al documento generado tantas veces como el
 * molde prometía.
 *
 * Es `<`, no `!==`, y no es descuido: si el valor aparece de MÁS es porque ese
 * texto también está en la parte fija del contrato —"nuestra oficina de
 * Palermo"— y de ese daño se ocupa la cuenta cruzada, que es la comprobación 4
 * y sabe distinguirlo. Frenar acá por un valor que sobra sería frenar por el
 * problema equivocado y con el mensaje equivocado.
 *
 * Solo se miran los campos con dato: los que no lo tienen ya frenaron antes,
 * como `pendiente`.
 */
export function camposQueNoAterrizaron(args: {
  huecosDelMolde: Record<string, number>
  datos: Record<string, string>
  partesDelGenerado: Record<string, string>
}): CampoQueNoAterrizo[] {
  const texto = todoElTexto(args.partesDelGenerado)
  const salida: CampoQueNoAterrizo[] = []
  for (const campo of Object.keys(args.huecosDelMolde).sort()) {
    const valor = (args.datos[campo] ?? "").trim()
    if (valor === "") continue
    const enElGenerado = vecesEn(texto, valor)
    if (enElGenerado < args.huecosDelMolde[campo]) {
      salida.push({ campo, enElMolde: args.huecosDelMolde[campo], enElGenerado })
    }
  }
  return salida
}

/** El mensaje de arriba, escrito. `null` cuando aterrizaron todos. */
export function avisoDeCamposQueNoAterrizaron(faltan: CampoQueNoAterrizo[], nombre: string): string | null {
  if (faltan.length === 0) return null
  const uno = faltan.length === 1
  const detalle = faltan
    .map((f) =>
      f.enElGenerado === 0
        ? `${f.campo} no aparece por ningún lado (el molde lo tiene ${f.enElMolde === 1 ? "1 vez" : `${f.enElMolde} veces`})`
        : `${f.campo} aparece ${f.enElGenerado} ${f.enElGenerado === 1 ? "vez" : "veces"} y el molde lo tiene ${f.enElMolde}`,
    )
    .join("; ")
  return (
    `No se le generó el documento a ${nombre}: ${uno ? "un dato suyo no entró" : "hay datos suyos que no entraron"} ` +
    `en el documento y quedaría con un blanco donde va ${uno ? "ese dato" : "cada uno"}. ${detalle}. Casi siempre ` +
    `es porque ese campo quedó en una nota al final o en un cuadro de texto del Word, que son los dos lugares que ` +
    `la plantilla no puede rellenar. Su documento no se tocó: sigue con la versión anterior.`
  )
}

// ---------------------------------------------------------------------------
// 2. QUE NO SE LE HAYA COLADO EL DATO DE OTRO
// ---------------------------------------------------------------------------

/** Un asesor contra el que se mira si su dato se coló en el documento de otro. */
export type OtroAsesor = {
  advisorId: string
  nombre: string
  valores: Record<string, string>
}

export type ValorAjeno = {
  /** De quién es el dato. */
  asesor: string
  campo: string
  valor: string
}

/**
 * El largo mínimo para que un valor pueda considerarse "el dato de una
 * persona".
 *
 * Es el mismo `LARGO_DE_DATO_SOSPECHOSO` que ya usan la confirmación y la
 * versión nueva, y por el mismo motivo medido: un dato de tres letras o menos
 * —el "1" de "1 de marzo", un "AR", un "S/N"— aparece por todos lados en
 * cualquier contrato. Tratarlo como identidad de alguien frenaría la
 * aplicación por un texto que no es el dato de nadie.
 */
const LARGO_MINIMO = LARGO_DE_DATO_SOSPECHOSO

/**
 * Los valores que son **exclusivos** de UNA otra persona.
 *
 * ═══ Por qué "exclusivo" hay que definirlo con cuidado ═══
 *
 * Dos asesores pueden compartir legítimamente una zona: si Ana y Bruno trabajan
 * los dos en Palermo, que "Palermo" aparezca en el documento de Carlos no dice
 * nada de nadie. Un CUIT, en cambio, es de una sola persona.
 *
 * Entonces exclusivo = **ese valor lo tiene exactamente UN asesor** de todos los
 * que tienen este documento, y no lo tiene el asesor al que le estamos
 * generando. Se agrupa en minúsculas y sin espacios de borde para no perder la
 * coincidencia por un "palermo" contra un "Palermo": ahí el error caro es el
 * falso rojo, porque frena una aplicación correcta.
 *
 * El valor que se devuelve es el original, sin bajar a minúsculas: es el que
 * hay que buscar literal adentro del documento y el que el director tiene que
 * poder encontrar en el Word.
 */
export function valoresExclusivosDeOtros(otros: OtroAsesor[], propios: Record<string, string>): ValorAjeno[] {
  const clave = (v: string) => v.trim().toLowerCase()

  const mios = new Set<string>()
  for (const v of Object.values(propios)) {
    const c = clave(v ?? "")
    if (c !== "") mios.add(c)
  }

  /** Cada valor, con quiénes lo tienen. El primero que lo trajo se guarda entero. */
  const duenos = new Map<string, { asesores: Set<string>; ejemplo: ValorAjeno }>()
  for (const otro of otros) {
    for (const campo of Object.keys(otro.valores)) {
      const valor = (otro.valores[campo] ?? "").trim()
      if (valor.length <= LARGO_MINIMO) continue
      const c = clave(valor)
      if (mios.has(c)) continue
      const yaEsta = duenos.get(c)
      if (yaEsta) yaEsta.asesores.add(otro.advisorId)
      else duenos.set(c, { asesores: new Set([otro.advisorId]), ejemplo: { asesor: otro.nombre, campo, valor } })
    }
  }

  return [...duenos.values()].filter((d) => d.asesores.size === 1).map((d) => d.ejemplo)
}

export type DatoAjenoColado = ValorAjeno & {
  /** Dónde aparece, con el texto de alrededor, para que el director lo ubique. */
  lugares: string[]
}

/**
 * Los datos exclusivos de otra persona que aparecieron en el documento recién
 * generado — y que **no estaban en el documento viejo de esta persona**.
 *
 * ═══ Las dos condiciones, y por qué hacen falta las dos ═══
 *
 * La primera es obvia: si el CUIT de Ana quedó adentro del contrato de Bruno,
 * el contrato de Bruno no se guarda. Pasa de verdad — el molde se lleva tal
 * cual las notas al final y los cuadros de texto del asesor del que salió, y
 * los moldes `detectada` de la §7.2 ni siquiera tienen la comprobación de
 * `valoresQueSobrevivenEnElMolde` que sí hace la subida de versión.
 *
 * La segunda descarta el ruido: si ese mismo texto YA estaba en el documento
 * viejo de Bruno, entonces es una frase del contrato y no un dato que se le
 * coló ahora. Sin esta condición, un año o el nombre de un barrio que la
 * inmobiliaria nombra en una cláusula fija —y que da la casualidad de que un
 * solo asesor tiene cargado como dato— frenaría la aplicación de TODOS. Es una
 * comparación contra la única verdad de referencia que este endpoint tiene: el
 * `.docx` que subió el director, que **no se toca nunca**.
 *
 * Se busca con la misma regla de borde de palabra que usa todo el resto de la
 * etapa (`lugaresDeUnValor`), así que un CUIT no se encuentra adentro de otro
 * número más largo.
 */
export function datosDeOtroQueSeColaron(args: {
  exclusivosDeOtros: ValorAjeno[]
  partesDelGenerado: Record<string, string>
  partesDeSuOriginal: Record<string, string>
}): DatoAjenoColado[] {
  const salida: DatoAjenoColado[] = []
  for (const ajeno of args.exclusivosDeOtros) {
    const lugares = lugaresDeUnValor(args.partesDelGenerado, ajeno.valor)
    if (lugares.length === 0) continue
    if (lugaresDeUnValor(args.partesDeSuOriginal, ajeno.valor).length > 0) continue
    salida.push({ ...ajeno, lugares })
  }
  return salida
}

/** El mensaje de arriba, escrito. `null` cuando no se coló nada. */
export function avisoDeDatosDeOtro(colados: DatoAjenoColado[], nombre: string): string | null {
  if (colados.length === 0) return null
  const uno = colados.length === 1
  const detalle = colados
    .map((c) => `${c.campo} de ${c.asesor} ("${c.valor}"), acá: ${c.lugares.map((l) => `"${l}"`).join(" / ")}`)
    .join("; ")
  const quePaso = uno ? "un dato de otra persona quedó adentro" : "hay datos de otras personas que quedaron adentro"
  return (
    `No se le generó el documento a ${nombre}: ${quePaso}. ${detalle}. Ese texto viene del molde, así que le ` +
    `saldría a ${nombre} y a todos los demás. Casi siempre está en una nota al final o en un cuadro de texto: ` +
    `abrí el Word de la versión nueva, sacalo de ahí y volvé a subirla. Su documento no se tocó: sigue con la ` +
    `versión anterior.`
  )
}

// ---------------------------------------------------------------------------
// 3. QUE NO QUEDE UN HUECO SIN RELLENAR
// ---------------------------------------------------------------------------

/**
 * El peor resultado posible, y el más fácil de ver: un `{{ZONA}}` literal en un
 * contrato que va a la firma.
 *
 * Se lee con `huecosDe` sobre el documento YA generado. Si algo quedó ahí es
 * porque docxtemplater no lo reconoció como campo, y ninguna otra comprobación
 * lo mira: para la cuenta de aterrizaje ese hueco no es el valor de nadie.
 *
 * `null` cuando no quedó ninguno.
 */
export function avisoDeHuecosSinRellenar(huecos: string[], nombre: string): string | null {
  if (huecos.length === 0) return null
  const uno = huecos.length === 1
  return (
    `No se le generó el documento a ${nombre}: ${uno ? "quedó un lugar" : `quedaron ${huecos.length} lugares`} sin ` +
    `rellenar y el contrato saldría con ${uno ? "la marca" : "las marcas"} a la vista — ` +
    `${huecos.map((h) => `${DELIMITADORES.start}${h}${DELIMITADORES.end}`).join(", ")}. Revisá cómo está escrito ` +
    `${uno ? "ese campo" : "esos campos"} en el Word de la versión nueva y volvé a subirla. Su documento no se ` +
    `tocó: sigue con la versión anterior.`
  )
}

// ---------------------------------------------------------------------------
// 4. LA CUENTA CRUZADA, ACÁ COMO FRENO
// ---------------------------------------------------------------------------

/**
 * El mismo hallazgo que en la 7a —`camposQueParecenTextoFijo`, que se reusa tal
 * cual— pero dicho como freno y no como advertencia.
 *
 * ═══ Por qué allá avisa y acá frena ═══
 *
 * El §7.4.3 es una vista previa: el director todavía tiene que mirarla y decir
 * que sí, y los documentos de los otros son de la versión anterior, así que la
 * diferencia también puede venir de que reescribió el contrato. Avisar es lo
 * correcto ahí.
 *
 * Acá ya dijo que sí y lo que sigue es escribir. Si la zona de Ana es "Palermo"
 * y el contrato dice "nuestra oficina de Palermo", el molde quedó con `{{ZONA}}`
 * dos veces y el contrato de Bruno va a decir "nuestra oficina de Belgrano".
 * Ninguna de las otras tres comprobaciones lo puede ver: el dato aterrizó, no
 * hay dato ajeno, no quedó ningún hueco. Es la única que lo agarra.
 *
 * `null` cuando no hay ninguna sospecha.
 */
export function avisoDeTextoFijoQueFrena(sospechas: SospechaDeTextoFijo[], nombre: string): string | null {
  if (sospechas.length === 0) return null
  const uno = sospechas.length === 1
  const detalle = sospechas
    .map((s) => {
      const sobran = s.vecesEnElMolde - s.vecesEnElOtro
      const donde = s.lugares.length > 0 ? ` Aparece acá: ${s.lugares.map((l) => `"${l}"`).join(" / ")}.` : ""
      return (
        `${s.campo}: en su documento nuevo aparece ${s.vecesEnElMolde} veces, y en el de ${s.otroAsesor} el dato ` +
        `equivalente aparece ${s.vecesEnElOtro === 1 ? "1 sola vez" : `${s.vecesEnElOtro} veces`}, así que ` +
        `${sobran === 1 ? "sobra 1 aparición" : `sobran ${sobran} apariciones`}.${donde}`
      )
    })
    .join(" ")
  return (
    `No se le generó el documento a ${nombre}: ${uno ? "un dato suyo aparece" : "hay datos suyos que aparecen"} en ` +
    `un lugar donde probablemente vaya una frase FIJA del contrato, y no su dato. ${detalle} Si esa frase es del ` +
    `contrato y no el dato de la persona, cambiala en el Word para que no repita el dato y volvé a subir la ` +
    `versión. Su documento no se tocó: sigue con la versión anterior.`
  )
}

// ---------------------------------------------------------------------------
// El veredicto, y lo que el director lee cuando sale bien
// ---------------------------------------------------------------------------

/**
 * Qué comprobación frenó. El `codigo` es para la pantalla y para los tests; el
 * `mensaje` es lo que lee el director.
 */
export type MotivoDeFreno = {
  codigo: "no-aterrizo" | "dato-ajeno" | "hueco-sin-rellenar" | "texto-fijo"
  mensaje: string
}

/**
 * Las cuatro, juntas, sobre un documento ya generado.
 *
 * Se corren **todas** y se devuelven todas las que frenaron, en vez de cortar en
 * la primera: si el molde tiene dos problemas, el director los arregla los dos
 * de una y no descubre el segundo recién después de volver a subir el archivo.
 *
 * Que la lista venga vacía es lo ÚNICO que habilita a escribir.
 */
export function frenosDeLaGeneracion(args: {
  nombre: string
  huecosDelMolde: Record<string, number>
  datos: Record<string, string>
  partesDelGenerado: Record<string, string>
  partesDeSuOriginal: Record<string, string>
  huecosQueQuedaron: string[]
  exclusivosDeOtros: ValorAjeno[]
  sospechasDeTextoFijo: SospechaDeTextoFijo[]
}): MotivoDeFreno[] {
  const motivos: MotivoDeFreno[] = []

  const noAterrizaron = avisoDeCamposQueNoAterrizaron(
    camposQueNoAterrizaron({
      huecosDelMolde: args.huecosDelMolde,
      datos: args.datos,
      partesDelGenerado: args.partesDelGenerado,
    }),
    args.nombre,
  )
  if (noAterrizaron) motivos.push({ codigo: "no-aterrizo", mensaje: noAterrizaron })

  const ajenos = avisoDeDatosDeOtro(
    datosDeOtroQueSeColaron({
      exclusivosDeOtros: args.exclusivosDeOtros,
      partesDelGenerado: args.partesDelGenerado,
      partesDeSuOriginal: args.partesDeSuOriginal,
    }),
    args.nombre,
  )
  if (ajenos) motivos.push({ codigo: "dato-ajeno", mensaje: ajenos })

  const huecos = avisoDeHuecosSinRellenar(args.huecosQueQuedaron, args.nombre)
  if (huecos) motivos.push({ codigo: "hueco-sin-rellenar", mensaje: huecos })

  const textoFijo = avisoDeTextoFijoQueFrena(args.sospechasDeTextoFijo, args.nombre)
  if (textoFijo) motivos.push({ codigo: "texto-fijo", mensaje: textoFijo })

  return motivos
}

/** Lo que el director lee cuando a esa persona sí se le generó el documento. */
export function resumenDeLaGeneracion(args: { nombre: string; version: number }): string {
  return `${args.nombre} ya tiene su documento de la versión ${args.version}, con sus datos de siempre.`
}

// ---------------------------------------------------------------------------
// Poner la versión en uso (spec §7.5)
// ---------------------------------------------------------------------------

/**
 * Por qué NO se puede poner en uso la versión nueva todavía. `null` cuando sí
 * se puede.
 *
 * ═══ La regla que no se puede romper, y es hermana de la de la §7.3 ═══
 *
 * "Una plantilla con un solo asesor en rojo no pasa a `activa`" existe porque
 * la versión vigente es lo que la solapa lee para decir "está en uso". Acá es
 * lo mismo por la otra punta: si `version_actual` se pudiera mover con gente
 * atrás, la solapa diría que todos están en la versión nueva mientras el
 * contrato de esas personas sigue siendo el viejo. **La pantalla mentiría.**
 *
 * Los pausados y desvinculados no cuentan (spec §7.5): sus documentos no se
 * regeneran ni se tocan, así que exigirles estar en la versión nueva dejaría la
 * plantilla trabada para siempre.
 */
export function faltanAsesoresParaActivar(pendientes: string[]): string | null {
  if (pendientes.length === 0) return null
  const uno = pendientes.length === 1
  const quienes = uno ? "queda 1 asesor activo" : `quedan ${pendientes.length} asesores activos`
  return (
    `Todavía no se puede poner en uso esta versión: ${quienes} con el documento de otra versión — ` +
    `${pendientes.join(", ")}. Aplicásela ${uno ? "a esa persona" : "a esas personas"} y volvé a intentar. Si se ` +
    `activara igual, la pantalla diría que todos están en la versión nueva mientras su contrato sigue siendo el ` +
    `viejo.`
  )
}
