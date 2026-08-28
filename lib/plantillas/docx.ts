import PizZip from "pizzip"
import Docxtemplater from "docxtemplater"
import mammoth from "mammoth"

/**
 * docxtemplater usa { } por defecto. El diseño usa {{ }}, y sin esta config
 * falla con "Duplicate open tag": lee {{NOMBRE}} como { + {NOMBRE} + }.
 * Medido con una sonda antes de escribir esto.
 */
export const DELIMITADORES = { start: "{{", end: "}}" } as const

const OPCIONES = {
  delimiters: DELIMITADORES,
  paragraphLoop: true,
  linebreaks: true,
  /**
   * Sin esto, un dato faltante escribe la palabra "undefined" DENTRO del
   * documento -- no falla, no deja el hueco vacío. Un contrato que dice
   * "tu CUIT es undefined" es peor que uno que no sale.
   */
  nullGetter: () => "",
  /**
   * El director escribe los huecos a mano en Word, y ahí sale
   * "{{ NOMBRE }}" con un espacio de más muy fácil. Sin esto, docxtemplater
   * busca el dato bajo el nombre " NOMBRE " --con los espacios adentro--,
   * no lo encuentra, y el nullGetter deja el lugar en blanco: el contrato
   * sale a la firma sin el nombre del asesor y sin un solo aviso.
   *
   * El trim lo arregla de verdad, en vez de avisar que no anda. Comprobado
   * contra la librería real: para cuando llama al parser ya juntó el
   * nombre entero, aunque Word haya partido "{{ NOM" / "BRE " / "}}" en
   * tres <w:r> distintos -- que es el caso que importa, porque es el que
   * Word escribe siempre.
   *
   * El caso "." es el que documenta docxtemplater para su parser mínimo:
   * significa "el dato entero", y se deja pasar tal cual.
   */
  parser: (tag: string) => ({
    get: (scope: Record<string, string>) => {
      const nombre = tag.trim()
      if (nombre === ".") return scope
      /**
       * `hasOwnProperty` y no un `scope[nombre]` pelado. Un hueco llamado
       * {{constructor}} o {{__proto__}} saca de la cadena de prototipos
       * algo que no es el dato de nadie: el contrato salía diciendo
       * "[object Object]" y la app informaba ÉXITO. Con {{valueOf}} o
       * {{hasOwnProperty}} el rellenado directamente explotaba. Medido.
       *
       * El parser que trae docxtemplater ya hacía este chequeo; al
       * reemplazarlo por uno propio para poder hacerle trim al nombre,
       * había que traerlo con él.
       */
      return scope && Object.prototype.hasOwnProperty.call(scope, nombre) ? scope[nombre] : undefined
    },
  }),
}

/**
 * El texto plano del CUERPO del documento (mammoth no trae encabezado ni
 * pie). Sirve para comparar y para detectar al cargar una plantilla nueva
 * -- para el rellenado se usa rellenarDocx, que sí toca todo el paquete.
 */
export async function textoDeDocx(buffer: Buffer): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer })
  return value
}

// ---------------------------------------------------------------------------
// Patrones de XML
// ---------------------------------------------------------------------------

/**
 * El nombre de una etiqueta XML siempre termina en '>' (sin atributos) o en
 * un espacio (antes de sus atributos) -- nunca en cualquier otro caracter.
 * Por eso `(?:\s[^>]*)?` y no un `[^>]*` pelado: `<w:t[^>]*>` (sin el \s)
 * también matchea `<w:tbl>`, `<w:tc>` y `<w:tab/>`, porque `[^>]*` se come
 * el resto del nombre de la etiqueta ("bl", "c", "ab/"). Medido contra un
 * .docx real con tablas: sin el \s, "extraía" 130.793 caracteres de "texto"
 * cuando el texto real eran 29.901 -- 100.892 de basura XML, toda de las
 * tablas.
 */
const abre = (tag: string) => `<w:${tag}(?:\\s[^>]*)?>`
const cierra = (tag: string) => `<\\/w:${tag}>`
const autocierra = (tag: string) => `<w:${tag}(?:\\s[^>]*)?\\/>`

const RE_TEXTO = new RegExp(`${abre("t")}([\\s\\S]*?)${cierra("t")}`, "g")
/**
 * El formato del run. Contempla también el `<w:rPr/>` vacío, que Word
 * escribe: si solo se buscara la forma con cierre, ese caso caería como
 * contenido cualquiera y el run terminaría partido de más.
 */
const RE_RPR = new RegExp(`${autocierra("rPr")}|${abre("rPr")}[\\s\\S]*?${cierra("rPr")}`)
const RE_ABRE_RUN = new RegExp(`^${abre("r")}`)
const CIERRE_RUN = "</w:r>"

const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/**
 * Vuelve el texto de un <w:t> a como lo escribiría una persona: "&amp;" a
 * "&", etc. Hace falta porque el XML guarda "Pérez & Asociados" como
 * "Pérez &amp; Asociados", y lo que llega para buscar es lo primero, no lo
 * segundo -- sin este paso, cualquier valor con &, < o > no se encontraba
 * nunca (buscar contra el XML crudo y escribir con `escapar` eran, en los
 * hechos, dos funciones incompatibles entre sí).
 *
 * El orden importa: &amp; se resuelve ÚLTIMO. Si se resolviera primero,
 * "&amp;lt;" -- el escapado correcto del texto literal de cuatro
 * caracteres "&lt;" -- se leería mal: primero se volvería "&lt;" y ESE
 * resultado, sin querer, se volvería a interpretar como una entidad y
 * daría "<".
 */
const desescapar = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * QUÉ FORMA TIENE UN HUECO -- definido una sola vez, para dos usos:
 * validar el que nos mandan (huecoValido) y encontrar los que ya están
 * escritos en el documento (huecosDe).
 *
 * Estaba escrito dos veces y las dos versiones no coincidían: la de
 * huecosDe permitía espacios adentro ("{{ NOMBRE }}") y la de validación
 * no. Resultado medido: huecosDe listaba NOMBRE, la app le pedía ese dato
 * al director, y el contrato salía con el nombre en blanco sin un solo
 * aviso.
 *
 * Las dos coinciden ahora del lado PERMISIVO, no del estricto: los
 * espacios se aceptan en los dos lados porque el rellenado los resuelve de
 * verdad (ver el `parser` de OPCIONES). Ponerse estricto acá habría
 * cerrado la discrepancia dejando el mismo contrato en blanco, solo que
 * sin mencionarlo. El NOMBRE del hueco, en cambio, sigue siendo estricto:
 * solo letras, números y guión bajo.
 */
const NOMBRE_DE_HUECO = "[A-Za-z0-9_]+"
const ESPACIOS = "\\s*"
const APERTURA_DE_HUECO = escapeRegExp(DELIMITADORES.start)
const CIERRE_DE_HUECO = escapeRegExp(DELIMITADORES.end)

/**
 * Un hueco tiene que ser {{NOMBRE}}: solo letras, números y guión bajo
 * adentro de los delimitadores configurados, con o sin espacios pegados a
 * las llaves. Si se inyectara crudo un hueco con &, < o mal formado, el
 * .docx queda inválido -- se valida ACÁ, en la puerta, antes de tocar el
 * XML. Las dos formas se arman con las MISMAS piezas: no pueden
 * discrepar.
 */
const RE_HUECO_VALIDO = new RegExp(
  `^${APERTURA_DE_HUECO}${ESPACIOS}${NOMBRE_DE_HUECO}${ESPACIOS}${CIERRE_DE_HUECO}$`
)
const RE_HUECO_EN_TEXTO = new RegExp(
  `${APERTURA_DE_HUECO}${ESPACIOS}(${NOMBRE_DE_HUECO})${ESPACIOS}${CIERRE_DE_HUECO}`,
  "g"
)

function huecoValido(hueco: string): boolean {
  return RE_HUECO_VALIDO.test(hueco)
}

/**
 * ¿Este XML abre y cierra todas sus etiquetas, y en el orden correcto?
 *
 * Es la red de seguridad del módulo, no un detalle de prolijidad. Word abre
 * un .docx con una etiqueta de cierre sin apertura pidiendo REPARAR el
 * archivo; mammoth, en cambio, lo lee igual porque es tolerante, así que
 * leer el texto de la salida NO alcanza para saber que quedó sano. Y el
 * daño no se descubre en la app: se descubre el día de la firma.
 *
 * Se recorre a mano en vez de con un regex porque hay que saltear lo que
 * PARECE una etiqueta y no lo es: los comentarios, la declaración <?xml?>,
 * el CDATA, y sobre todo los ">" que viven adentro del valor de un
 * atributo.
 */
function xmlBalanceado(xml: string): boolean {
  const pila: string[] = []
  let i = 0
  while (i < xml.length) {
    const at = xml.indexOf("<", i)
    if (at === -1) break

    // -1 = no era esto; -2 = empezó y nunca terminó; >0 = dónde sigue.
    const saltar = (marca: string, hasta: string) => {
      if (!xml.startsWith(marca, at)) return -1
      const fin = xml.indexOf(hasta, at + marca.length)
      return fin === -1 ? -2 : fin + hasta.length
    }
    let salto = saltar("<!--", "-->")
    if (salto === -1) salto = saltar("<![CDATA[", "]]>")
    if (salto === -1) salto = saltar("<?", "?>")
    if (salto === -1) salto = saltar("<!", ">")
    if (salto === -2) return false
    if (salto > 0) {
      i = salto
      continue
    }

    // Etiqueta normal: termina en el primer ">" que NO esté adentro de las
    // comillas de un atributo.
    let j = at + 1
    let comilla = ""
    while (j < xml.length) {
      const c = xml[j]
      if (comilla) {
        if (c === comilla) comilla = ""
      } else if (c === '"' || c === "'") {
        comilla = c
      } else if (c === ">") {
        break
      }
      j++
    }
    if (j >= xml.length) return false
    const cuerpo = xml.slice(at + 1, j)
    i = j + 1
    if (cuerpo.endsWith("/")) continue // autocerrada: ni abre ni cierra nada
    if (cuerpo.startsWith("/")) {
      if (pila.pop() !== cuerpo.slice(1).trim()) return false
      continue
    }
    pila.push(cuerpo.split(/[\s/]/)[0])
  }
  return pila.length === 0
}

/**
 * Si el caracter pegado a un lado del match es una letra o un número, el
 * match está partiendo una palabra por la mitad -- "Norte" adentro de
 * "Norteeste" encuentra igual, reemplaza igual, y el domicilio queda roto
 * sin ningún aviso. No alcanza el \b de los regex porque \w no incluye
 * acentos (una "Pérez" quedaría con el borde mal puesto). Esto NO limita lo
 * que hay ADENTRO del texto buscado -- un CUIT trae guiones a propósito
 * ("20-12345678-9") y se sigue encontrando entero; la condición es sobre lo
 * que hay JUSTO AFUERA, a cada lado.
 */
const ES_LETRA_O_NUMERO = /[\p{L}\p{N}]/u
function partePalabra(completo: string, inicio: number, fin: number): boolean {
  const antes = completo[inicio - 1]
  const despues = completo[fin]
  return (
    (antes !== undefined && ES_LETRA_O_NUMERO.test(antes)) ||
    (despues !== undefined && ES_LETRA_O_NUMERO.test(despues))
  )
}

/** Todas las apariciones de `buscado` en `completo`, sin solaparse,
 * salteando las que parten una palabra por la mitad. */
function todasLasApariciones(completo: string, buscado: string): Array<{ inicio: number; fin: number }> {
  const apariciones: Array<{ inicio: number; fin: number }> = []
  let desde = 0
  while (desde <= completo.length) {
    const at = completo.indexOf(buscado, desde)
    if (at === -1) break
    const fin = at + buscado.length
    if (partePalabra(completo, at, fin)) {
      desde = at + 1 // seguimos un caracter más adelante, no saltamos el largo entero
      continue
    }
    apariciones.push({ inicio: at, fin })
    // El Math.max es lo que hace que este bucle NO PUEDA quedarse quieto.
    // Con un buscado vacío `fin` es igual a `at`, y un `desde = fin` pelado
    // deja el cursor donde estaba: el proceso se cuelga para siempre. Que
    // la única defensa contra eso fuera la guarda de ponerHueco era frágil
    // -- si alguien la sacaba, el pedido no fallaba: se congelaba. Y un
    // test que solo puede colgarse o pasar no protege nada.
    desde = Math.max(fin, at + 1)
  }
  return apariciones
}

/**
 * Encuentra los rangos [inicio, fin) de las etiquetas `<w:TAG>` de nivel
 * superior -- las que NO están anidadas adentro de otra igual.
 *
 * Hace falta porque Word anida <w:p> dentro de <w:p> (y <w:r> dentro de
 * <w:r>) cuando hay un cuadro de texto, una forma o un membrete: la
 * etiqueta de afuera trae, adentro de un <w:pict>/<w:txbxContent>, una
 * copia entera de la misma etiqueta. Un regex no-codicioso simple del tipo
 * /<w:p>[\s\S]*?<\/w:p>/ corta en el PRIMER cierre que encuentra, que es
 * el de ADENTRO -- deja el cierre de afuera colgado, y el XML que se
 * reconstruye después queda desbalanceado: Word lo abre pidiendo reparar
 * el archivo.
 *
 * Se resuelve llevando la cuenta de aperturas y cierres (profundidad),
 * igual que un parser de paréntesis: cuando la profundidad vuelve a 0 se
 * cerró la etiqueta de afuera, y ESE es el rango completo que se
 * devuelve, con lo anidado adentro intacto. Se marca `anidado: true` para
 * que quien llama sepa que ahí adentro hay contenido que no conviene
 * tocar (ver extraerRuns).
 */
function segmentosDeNivelSuperior(
  xml: string,
  tag: string
): Array<{ inicio: number; fin: number; anidado: boolean }> {
  const RE = new RegExp(`${autocierra(tag)}|${abre(tag)}|${cierra(tag)}`, "g")
  const segmentos: Array<{ inicio: number; fin: number; anidado: boolean }> = []
  let profundidad = 0
  let inicioActual = 0
  let anidado = false
  let m: RegExpExecArray | null
  while ((m = RE.exec(xml))) {
    const esCierre = m[0].startsWith("</")
    const esAutocierre = !esCierre && m[0].endsWith("/>")
    if (esAutocierre) {
      if (profundidad === 0) {
        segmentos.push({ inicio: m.index, fin: m.index + m[0].length, anidado: false })
      } else {
        anidado = true
      }
      continue
    }
    if (!esCierre) {
      if (profundidad === 0) {
        inicioActual = m.index
        anidado = false
      } else {
        anidado = true
      }
      profundidad++
    } else {
      profundidad = Math.max(0, profundidad - 1)
      if (profundidad === 0) {
        segmentos.push({ inicio: inicioActual, fin: m.index + m[0].length, anidado })
      }
    }
  }
  return segmentos
}

/**
 * Un run NO es "un formato y un texto": es una secuencia ORDENADA de
 * pedazos. Word mete adentro del mismo <w:r>, conviviendo con el texto,
 * cosas que no son texto -- un <w:tab/>, un <w:br/>, un <w:drawing>, un
 * <w:noBreakHyphen/>. Modelarlo como "un texto" y reescribirlo como
 * <w:r>{rPr}<w:t>…</w:t></w:r> borra todo lo demás sin decir nada: la
 * tabulación del renglón de la firma, el salto de línea del domicilio.
 *
 * Por eso cada pedazo es una de dos cosas: `texto` (el contenido de un
 * <w:t>, ya desescapado) u `opaco` (cualquier otro hijo del run, guardado
 * como XML crudo y copiado tal cual). El <w:rPr> no es un pedazo: es el
 * formato del run, y se vuelve a emitir con cada pedazo que se reescriba.
 */
type Pedazo = { tipo: "texto"; texto: string } | { tipo: "opaco"; xml: string }

type Run = {
  inicio: number
  fin: number
  xml: string
  /** La etiqueta de apertura tal cual vino, con sus atributos (w:rsidRPr y
   * compañía). Se reusa al reescribir el run para no perderlos. */
  abridor: string
  formato: string
  pedazos: Pedazo[]
  texto: string
}

function pedazosDeRun(cuerpo: string): Pedazo[] {
  const pedazos: Pedazo[] = []
  let cursor = 0
  for (const m of cuerpo.matchAll(RE_TEXTO)) {
    const at = m.index ?? 0
    if (at > cursor) pedazos.push({ tipo: "opaco", xml: cuerpo.slice(cursor, at) })
    pedazos.push({ tipo: "texto", texto: desescapar(m[1]) })
    cursor = at + m[0].length
  }
  if (cursor < cuerpo.length) pedazos.push({ tipo: "opaco", xml: cuerpo.slice(cursor) })
  return pedazos
}

/**
 * Los <w:r> de nivel superior de un párrafo, con su texto ya desescapado.
 *
 * Un run con OTRO <w:r> anidado adentro es un cuadro de texto o una forma
 * (ver segmentosDeNivelSuperior): no se lee su texto -- podría ni
 * pertenecer a este párrafo -- y se preserva como UN SOLO bloque opaco, sin
 * mirar adentro. Un run así queda con `texto: ""`, y por eso nunca se parte
 * ni se pierde: en ponerHueco, un run sin texto se copia siempre tal cual,
 * esté donde esté.
 */
function extraerRuns(xmlParrafo: string): Run[] {
  return segmentosDeNivelSuperior(xmlParrafo, "r").map((seg) => {
    const xml = xmlParrafo.slice(seg.inicio, seg.fin)
    const abridor = (xml.match(RE_ABRE_RUN) || [""])[0]
    const base = { inicio: seg.inicio, fin: seg.fin, xml, abridor }
    // Sin apertura reconocible o sin cierre propio (un <w:r/> vacío) no hay
    // interior que leer; anidado, no se quiere leer.
    if (seg.anidado || !abridor || !xml.endsWith(CIERRE_RUN)) {
      return { ...base, formato: "", pedazos: [], texto: "" }
    }
    const interior = xml.slice(abridor.length, xml.length - CIERRE_RUN.length)
    /**
     * El formato solo cuenta si el <w:rPr> es el PRIMER hijo del run, que
     * es donde OOXML lo exige. Buscándolo en cualquier parte, un run que
     * tenga colgado un <w:pict> con un párrafo formateado adentro le ROBA
     * ese <w:rPr> y se lo aplica a todo lo que reescribimos. Medido: salía
     * el {{NOMBRE}} en negrita y un <w:pPr></w:pPr> vacío, balanceado y con
     * ok: true -- la red de seguridad no lo agarra porque mide balance, no
     * si el formato es el que corresponde.
     *
     * Si aparece más adentro no se toca: queda dentro de su pedazo opaco y
     * se copia tal cual, que es su lugar.
     */
    const rpr = RE_RPR.exec(interior)
    const formato = rpr && rpr.index === 0 ? rpr[0] : ""
    const cuerpo = interior.slice(formato.length)
    const pedazos = pedazosDeRun(cuerpo)
    const texto = pedazos.map((p) => (p.tipo === "texto" ? p.texto : "")).join("")
    return { ...base, formato, pedazos, texto }
  })
}

/**
 * Reemplaza TODAS las apariciones de `buscado` por `hueco` dentro de UN
 * párrafo.
 *
 * Word parte el texto en pedazos (<w:r>) cada vez que cambia el formato --
 * y en un documento real lo hace por cada palabra y cada espacio, no en
 * tres pedazos prolijos -- así que "Juan Pérez" puede estar guardado en
 * trece partes. Por eso no sirve buscar sobre el XML: se arma el texto
 * completo del párrafo (`completo`) y se busca ahí.
 *
 * Se toca SOLO lo que el texto buscado atraviesa. El resto -- incluido lo
 * que no tiene texto, como una imagen o un cuadro de texto -- se copia tal
 * cual, en el mismo lugar. Aplanar el párrafo entero también encontraría
 * el texto, pero fusionaría runs con formato distinto y borraría negritas
 * y títulos del resto del párrafo: probado con una sonda, y hay un test
 * ("el texto vecino NO se vuelve negrita") que se rompe si alguien lo hace.
 */
export function ponerHueco(
  xmlParrafo: string,
  buscado: string,
  hueco: string
): { xml: string; ok: boolean; veces: number } {
  // Guardas: "".indexOf() da 0 en cualquier posición -- sin esto, buscar el
  // vacío "encuentra" en cada caracter del párrafo y arma un hueco por
  // caracter. Y un hueco con forma rara ({{}} vacío, sin cerrar, con &)
  // nunca se inyecta crudo dentro del XML.
  if (!buscado || !huecoValido(hueco)) {
    return { xml: xmlParrafo, ok: false, veces: 0 }
  }

  const runs = extraerRuns(xmlParrafo)
  if (!runs.length) return { xml: xmlParrafo, ok: false, veces: 0 }

  const completo = runs.map((r) => r.texto).join("")
  const apariciones = todasLasApariciones(completo, buscado)
  if (!apariciones.length) return { xml: xmlParrafo, ok: false, veces: 0 }

  const runDeTexto = (texto: string, r: Run) =>
    `${r.abridor}${r.formato}<w:t xml:space="preserve">${escapar(texto)}</w:t></w:r>`
  const runDeHueco = (r: Run) =>
    `${r.abridor}${r.formato}<w:t xml:space="preserve">${escapar(hueco)}</w:t></w:r>`
  /**
   * Un pedazo opaco sale en SU PROPIO run, con el mismo formato: un <w:r>
   * que contiene solo un <w:tab/> es OOXML válido, y así la tabulación
   * queda exactamente donde estaba aunque el reemplazo le pase por encima.
   * Si el pedazo son solo espacios entre etiquetas va suelto: envolverlo en
   * un run inventaría contenido que el documento no tenía.
   */
  const runOpaco = (crudo: string, r: Run) =>
    crudo.trim() === "" ? crudo : `${r.abridor}${r.formato}${crudo}</w:r>`

  const piezas: string[] = []
  let cursorXml = 0 // por dónde va la copia textual del XML del párrafo
  let pos = 0 // por dónde va la lectura del texto del párrafo
  let mi = 0 // índice de la próxima aparición a procesar

  for (const r of runs) {
    // Todo lo que hay ENTRE dos runs, y todo lo que los ENVUELVE, se copia
    // textual: un <w:hyperlink>, un <w:sdt> (control de contenido), un
    // <w:ins> (control de cambios), un <w:fldSimple>, un <w:bookmarkStart>
    // -- construcciones que Word escribe solo, sin que nadie las pida.
    // Recortar de un saque desde el primer run hasta el último parece lo
    // mismo y no lo es: se lleva puestas esas etiquetas y deja los cierres
    // sin apertura. Medido: el .docx sale roto y Word pide repararlo.
    piezas.push(xmlParrafo.slice(cursorXml, r.inicio))
    cursorXml = r.fin

    const finDelRun = pos + r.texto.length
    // Un run que ningún reemplazo toca se copia entero, byte por byte: es
    // más barato y, sobre todo, no hay forma de perderle nada adentro.
    if (r.texto.length === 0 || mi >= apariciones.length || apariciones[mi].inicio >= finDelRun) {
      piezas.push(r.xml)
      pos = finDelRun
      continue
    }

    for (const p of r.pedazos) {
      if (p.tipo === "opaco") {
        piezas.push(runOpaco(p.xml, r))
        continue
      }
      const finDelPedazo = pos + p.texto.length
      let off = 0
      while (off < p.texto.length) {
        const abs = pos + off
        const ap = mi < apariciones.length ? apariciones[mi] : null
        if (ap && abs >= ap.inicio && abs < ap.fin) {
          if (abs === ap.inicio) piezas.push(runDeHueco(r))
          const hasta = Math.min(ap.fin, finDelPedazo)
          off = hasta - pos
          if (hasta === ap.fin) mi++
          continue
        }
        // Literal hasta la próxima aparición (o el fin del pedazo): con el
        // formato de ESTE run, no el del primero que tocó el match -- así el
        // sufijo de un reemplazo que cruza dos runs con formato distinto no
        // hereda la negrita del que empezó el match.
        const limite = ap ? Math.min(ap.inicio, finDelPedazo) : finDelPedazo
        const texto = p.texto.slice(off, limite - pos)
        if (texto) piezas.push(runDeTexto(texto, r))
        off = limite - pos
      }
      pos = finDelPedazo
    }
  }
  piezas.push(xmlParrafo.slice(cursorXml)) // la cola del párrafo, tal cual

  const xml = piezas.join("")

  // La cura estructural, y la regla que ordena el módulo: NUNCA devolver
  // éxito habiendo hecho el trabajo mal. Si el párrafo reconstruido quedó
  // desbalanceado -- por una construcción de Word que no previmos, hoy o
  // dentro de un año -- se devuelve el original intacto y el valor cae en
  // `faltantes`, donde el director lo ve. Un documento roto con luz verde
  // no se descubre hasta el día de la firma.
  if (!xmlBalanceado(xml)) return { xml: xmlParrafo, ok: false, veces: 0 }

  return { xml, ok: true, veces: apariciones.length }
}

/**
 * Los archivos de texto del paquete .docx a revisar.
 *
 * La lista sale de [Content_Types].xml y es EXACTAMENTE la misma que
 * rellena docxtemplater (está en su propio código, en filetypes.js:
 * encabezado, cuerpo, pie, notas al pie y comentarios). Que las dos
 * mitades miren lo mismo es lo que evita el peor final: poner un hueco en
 * una parte que después nadie rellena, y que el contrato salga a la firma
 * con un "{{NOMBRE}}" impreso.
 *
 * Por eso word/endnotes.xml queda AFUERA a propósito, aunque también sea
 * texto del documento: docxtemplater no lo rellena. Un valor que viva solo
 * en una nota final se informa como faltante -- que es la verdad -- en vez
 * de quedar a medio hacer.
 */
const TIPOS_DE_PARTE_CON_TEXTO = [
  "wordprocessingml.header+xml",
  "wordprocessingml.footer+xml",
  "wordprocessingml.footnotes+xml",
  "wordprocessingml.comments+xml",
]

function partesDeTextoDeDocx(zip: PizZip): string[] {
  const rutas = new Set<string>()
  if (zip.file("word/document.xml")) rutas.add("word/document.xml")

  const tipos = zip.file("[Content_Types].xml")
  if (tipos) {
    for (const m of tipos.asText().matchAll(/<Override\b([^>]*)\/>/g)) {
      const parte = /PartName\s*=\s*"([^"]*)"/.exec(m[1])?.[1]
      const tipo = /ContentType\s*=\s*"([^"]*)"/.exec(m[1])?.[1]
      if (!parte || !tipo) continue
      if (!TIPOS_DE_PARTE_CON_TEXTO.some((t) => tipo.endsWith(t))) continue
      rutas.add(parte.replace(/^\//, ""))
    }
  }

  // No hay red por nombre de archivo, a propósito. Un word/headerN.xml que
  // el paquete NO declara es una parte que docxtemplater tampoco rellena
  // (medido): ponerle el hueco ahí sería dejar un "{{NOMBRE}}" impreso en
  // el membrete del contrato. Es el mismo motivo por el que endnotes queda
  // afuera de ESTA lista: no se rellena, así que no se le pone hueco.
  //
  // Ojo, que la frase anterior decía "se informa como faltante" y no era
  // cierto: un valor que vive SOLO en una nota al final nunca llega a ser
  // hueco (la detección compara el cuerpo), así que no puede figurar entre
  // los faltantes. Lo que lo agarra es la comparación: textoPorParte SÍ lee
  // las notas al final justamente para eso, y la diferencia sale en rojo.

  return [...rutas].filter((r) => zip.file(r))
}

function exigirDocxValido(zip: PizZip, accion: string) {
  if (!zip.file("word/document.xml")) {
    throw new Error(
      `${accion}: el archivo no tiene word/document.xml, así que no es un .docx válido ` +
        `(¿es un .doc viejo, un PDF, o se subió otro tipo de archivo?)`
    )
  }
}

/**
 * Aplica varios reemplazos sobre TODO el documento -- cuerpo, encabezado y
 * pie -- reemplazando TODAS las apariciones de cada uno, no solo la
 * primera: si el nombre está en la cláusula y en la firma, las dos tienen
 * que cambiar, o el contrato de María sale firmado por Juan.
 */
export function ponerHuecosEnDocx(
  zip: PizZip,
  reemplazos: Array<{ buscado: string; hueco: string }>
): {
  zip: PizZip
  puestos: Array<{ buscado: string; hueco: string; veces: number }>
  faltantes: string[]
  advertencias: string[]
} {
  exigirDocxValido(zip, "ponerHuecosEnDocx")

  // Los más largos primero: si un valor contiene a otro ("Juan Pérez"
  // contiene a "Juan"), hay que consumir el grande antes de que el chico lo
  // parta por la mitad -- después de reemplazar "Juan Pérez", ya no queda
  // un "Juan" suelto ahí para que el chico lo encuentre mal.
  const orden = [...reemplazos].sort((a, b) => b.buscado.length - a.buscado.length)

  const salida = new PizZip(zip.generate({ type: "nodebuffer" }))
  const partes = partesDeTextoDeDocx(salida)

  // Una cuenta POR PEDIDO, no por hueco. Dos valores distintos que apuntan
  // al mismo hueco ("Juan Pérez" y "JUAN PÉREZ" -> {{NOMBRE}}) son dos
  // pedidos distintos: si el documento dice solo uno, el otro tiene que
  // aparecer en faltantes. Contándolo por hueco los dos se llevaban el
  // mismo número y el director veía dos valores colocados donde se colocó
  // uno. Va por posición en `orden` para que ni un buscado repetido los
  // confunda.
  const vecesPorPedido = new Array<number>(orden.length).fill(0)
  const archivosConAnidado = new Set<string>()

  for (const ruta of partes) {
    const archivo = salida.file(ruta)
    if (!archivo) continue
    let xml = archivo.asText()

    // Los cuadros de texto se buscan sobre el DOCUMENTO, no adentro del
    // bucle de reemplazos: estando adentro, un pedido sin reemplazos (o con
    // todos inválidos) devolvía `advertencias: []` sobre un documento lleno
    // de cuadros de texto. Callado justo donde había algo que decir.
    if (segmentosDeNivelSuperior(xml, "p").some((seg) => seg.anidado)) archivosConAnidado.add(ruta)

    for (let i = 0; i < orden.length; i++) {
      const { buscado, hueco } = orden[i]
      if (!buscado || !huecoValido(hueco)) continue

      const segmentos = segmentosDeNivelSuperior(xml, "p")
      let xmlNuevo = ""
      let cursorXml = 0
      for (const seg of segmentos) {
        xmlNuevo += xml.slice(cursorXml, seg.inicio)
        const r = ponerHueco(xml.slice(seg.inicio, seg.fin), buscado, hueco)
        xmlNuevo += r.xml
        vecesPorPedido[i] += r.veces
        cursorXml = seg.fin
      }
      xmlNuevo += xml.slice(cursorXml)
      xml = xmlNuevo
    }

    salida.file(ruta, xml)
  }

  const puestos: Array<{ buscado: string; hueco: string; veces: number }> = []
  const faltantes: string[] = []
  for (let i = 0; i < orden.length; i++) {
    const { buscado, hueco } = orden[i]
    if (!buscado) {
      faltantes.push("(vacío -- se ignoró)")
      continue
    }
    if (!huecoValido(hueco)) {
      faltantes.push(`${buscado} (el hueco "${hueco}" no tiene una forma válida)`)
      continue
    }
    if (vecesPorPedido[i] > 0) puestos.push({ buscado, hueco, veces: vecesPorPedido[i] })
    else faltantes.push(buscado)
  }

  // Nunca callado: si hubo un cuadro de texto o una forma que no se revisó
  // por dentro (ver segmentosDeNivelSuperior), acá queda dicho -- no se
  // finge que se revisó todo el documento.
  const advertencias: string[] = []
  if (archivosConAnidado.size > 0) {
    advertencias.push(
      `Hay cuadros de texto o formas en ${[...archivosConAnidado].join(", ")} que no se revisaron por ` +
        `dentro, para no arriesgar romper el archivo. Si el dato tiene que ir ahí, hay que ponerlo a mano.`
    )
  }

  return { zip: salida, puestos, faltantes, advertencias }
}

/**
 * Rellena la plantilla con los datos de un asesor.
 *
 * docxtemplater procesa también encabezado, pie, notas al pie y
 * comentarios solo, sin que haga falta nada especial acá: lo hace en
 * cuanto [Content_Types].xml los declara, que es lo que trae cualquier
 * .docx real armado por Word.
 */
export function rellenarDocx(zip: PizZip, datos: Record<string, string>): PizZip {
  exigirDocxValido(zip, "rellenarDocx")
  const copia = new PizZip(zip.generate({ type: "nodebuffer" }))
  const d = new Docxtemplater(copia, OPCIONES)
  d.render(datos)
  return d.getZip()
}

/**
 * Los nombres de los huecos que tiene la plantilla, sin repetir --
 * revisando las mismas partes del paquete que después se rellenan.
 */
export function huecosDe(zip: PizZip): string[] {
  exigirDocxValido(zip, "huecosDe")
  const nombres = new Set<string>()
  for (const ruta of partesDeTextoDeDocx(zip)) {
    const archivo = zip.file(ruta)
    if (!archivo) continue
    const xml = archivo.asText()
    const segmentos = segmentosDeNivelSuperior(xml, "p")
    // Separador ||| entre párrafos: sin él, un {{ al final de un
    // párrafo y un }} al principio del siguiente arman un hueco fantasma
    // que no existe. ||| no es letra, número ni guión bajo, así que corta
    // la lectura ahí en vez de unir dos párrafos en un solo hueco
    // inventado.
    const texto = segmentos
      .map((seg) => desescapar([...xml.slice(seg.inicio, seg.fin).matchAll(RE_TEXTO)].map((t) => t[1]).join("")))
      .join("|||")
    for (const m of texto.matchAll(RE_HUECO_EN_TEXTO)) nombres.add(m[1])
  }
  return [...nombres]
}

/**
 * La parte del paquete que guarda `word/endnotes.xml`: las notas al FINAL.
 *
 * Va aparte de `partesDeTextoDeDocx` a propósito, porque ese recorrido es el
 * de las partes que docxtemplater RELLENA, y las notas al final no están —
 * está dicho más arriba y sigue siendo cierto.
 *
 * Pero hay que poder leerlas igual: el molde se lleva las notas al final del
 * asesor que hizo de molde, tal cual, al documento de todos los demás. Si esa
 * nota tiene el legajo de una persona, el contrato de otra sale con ese
 * número. Sin poder leerlas no hay forma de darse cuenta.
 */
const RUTA_NOTAS_AL_FINAL = "word/endnotes.xml"

/**
 * El texto plano de cada parte con texto del paquete, por ruta.
 *
 * Existe para que la verificación de la Etapa C pueda comparar el documento
 * ENTERO. `textoDeDocx` usa mammoth, que lee solo el cuerpo: un dato que viva
 * únicamente en el encabezado no se detecta, no se convierte en hueco, y la
 * comparación contra el cuerpo daba VERDE mientras el contrato de una persona
 * salía con el legajo de otra. Medido.
 *
 * Cubre lo que rellena docxtemplater (`partesDeTextoDeDocx`: cuerpo,
 * encabezado, pie, notas al pie y comentarios) **más las notas al final**, que
 * no se rellenan y justamente por eso hay que compararlas: el molde se las
 * lleva de una persona a todas.
 *
 * Los párrafos se unen con un SALTO DE LÍNEA y no con el "|||" que usa
 * `huecosDe`. No es un detalle: ese separador existe allá para que un "{{" al
 * final de un párrafo y un "}}" al principio del siguiente no armen un hueco
 * fantasma, y acá no se buscan huecos, se compara. Un "|||" no es un espacio,
 * así que sobrevivía a la normalización y **un párrafo vacío de más —el Enter
 * de más, lo más común que hay en un Word— pasaba a ser un rojo imposible de
 * arreglar**, además de aparecer con las barras a la vista en el mensaje que
 * lee el director. Medido.
 *
 * Es puramente aditivo: no cambia la conducta de nada de lo que ya existía.
 */
export function textoPorParte(zip: PizZip): Record<string, string> {
  exigirDocxValido(zip, "textoPorParte")
  const salida: Record<string, string> = {}
  const rutas = [...partesDeTextoDeDocx(zip)]
  if (zip.file(RUTA_NOTAS_AL_FINAL) && !rutas.includes(RUTA_NOTAS_AL_FINAL)) rutas.push(RUTA_NOTAS_AL_FINAL)

  for (const ruta of rutas) {
    const archivo = zip.file(ruta)
    if (!archivo) continue
    const xml = archivo.asText()
    salida[ruta] = segmentosDeNivelSuperior(xml, "p")
      .map((seg) => desescapar([...xml.slice(seg.inicio, seg.fin).matchAll(RE_TEXTO)].map((t) => t[1]).join("")))
      .join("\n")
  }
  return salida
}
