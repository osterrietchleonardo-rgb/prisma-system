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
 * también matchea `<w:tbl>` y `<w:tc>`, porque `[^>]*` se come el resto del
 * nombre de la etiqueta ("bl", "c"). Medido contra un .docx real con
 * tablas: sin el \s, "extraía" 130.793 caracteres de "texto" cuando el
 * texto real eran 29.901 -- 100.892 de basura XML, toda de las tablas.
 */
const abre = (tag: string) => `<w:${tag}(?:\\s[^>]*)?>`
const cierra = (tag: string) => `<\\/w:${tag}>`
const autocierra = (tag: string) => `<w:${tag}(?:\\s[^>]*)?\\/>`

const RE_TEXTO = new RegExp(`${abre("t")}([\\s\\S]*?)${cierra("t")}`, "g")
const RE_RPR = new RegExp(`${abre("rPr")}[\\s\\S]*?${cierra("rPr")}`)

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
 * Un hueco tiene que ser exactamente {{NOMBRE}}: solo letras, números y
 * guión bajo adentro de los delimitadores configurados. Si se inyectara
 * crudo un hueco con &, < o mal formado, el .docx queda inválido -- se
 * valida ACÁ, en la puerta, antes de tocar el XML.
 */
const RE_HUECO_VALIDO = new RegExp(
  `^${escapeRegExp(DELIMITADORES.start)}[A-Za-z0-9_]+${escapeRegExp(DELIMITADORES.end)}$`
)
function huecoValido(hueco: string): boolean {
  return RE_HUECO_VALIDO.test(hueco)
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
    desde = fin
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

type Run = { inicio: number; fin: number; xml: string; formato: string; texto: string }

/**
 * Los <w:r> de nivel superior de un párrafo, con su texto ya desescapado.
 *
 * Un run con OTRO <w:r> anidado adentro es un cuadro de texto o una forma
 * (ver segmentosDeNivelSuperior): no se lee su texto -- podría ni
 * pertenecer a este párrafo -- y se preserva como un bloque opaco, igual
 * que una imagen o un salto de línea. Un run así queda con `texto: ""`, y
 * por eso nunca se parte ni se pierde: en ponerHueco, un run sin texto se
 * copia siempre tal cual, esté donde esté.
 */
function extraerRuns(xmlParrafo: string): Run[] {
  return segmentosDeNivelSuperior(xmlParrafo, "r").map((seg) => {
    const xml = xmlParrafo.slice(seg.inicio, seg.fin)
    const texto = seg.anidado ? "" : desescapar([...xml.matchAll(RE_TEXTO)].map((t) => t[1]).join(""))
    const formato = (xml.match(RE_RPR) || [""])[0]
    return { inicio: seg.inicio, fin: seg.fin, xml, formato, texto }
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

  const runDeTexto = (texto: string, formato: string) =>
    `<w:r>${formato}<w:t xml:space="preserve">${escapar(texto)}</w:t></w:r>`
  const runDeHueco = (formato: string) => `<w:r>${formato}<w:t xml:space="preserve">${escapar(hueco)}</w:t></w:r>`

  const piezas: string[] = []
  let cursor = 0
  let mi = 0 // índice de la próxima aparición a procesar

  for (const r of runs) {
    if (r.texto.length === 0) {
      // Sin texto (imagen, salto, cuadro de texto anidado...): no hay nada
      // que buscar adentro, y JAMÁS se descarta -- se copia tal cual, quede
      // donde quede respecto de un reemplazo en curso.
      piezas.push(r.xml)
      continue
    }
    let local = 0
    const len = r.texto.length
    while (local < len) {
      const abs = cursor + local
      const enCurso = mi < apariciones.length && abs >= apariciones[mi].inicio && abs < apariciones[mi].fin
      if (enCurso) {
        const ap = apariciones[mi]
        if (abs === ap.inicio) piezas.push(runDeHueco(r.formato))
        const hasta = Math.min(ap.fin, cursor + len)
        local = hasta - cursor
        if (hasta === ap.fin) mi++
        continue
      }
      // Literal hasta la próxima aparición (o el fin del run): con el
      // formato de ESTE run, no el del primero que tocó el match -- así el
      // sufijo de un reemplazo que cruza dos runs con formato distinto no
      // hereda la negrita del que empezó el match.
      const limite = mi < apariciones.length ? Math.min(apariciones[mi].inicio, cursor + len) : cursor + len
      const texto = r.texto.slice(local, limite - cursor)
      if (texto) piezas.push(runDeTexto(texto, r.formato))
      local = limite - cursor
    }
    cursor += len
  }

  const xml = xmlParrafo.slice(0, runs[0].inicio) + piezas.join("") + xmlParrafo.slice(runs[runs.length - 1].fin)
  return { xml, ok: true, veces: apariciones.length }
}

/**
 * Los archivos de texto del paquete .docx a revisar: el cuerpo siempre, y
 * el encabezado/pie si el documento los tiene.
 *
 * Word los nombra headerN.xml / footerN.xml siempre que los crea, así que
 * alcanza con buscar por ese patrón sin tener que leer
 * [Content_Types].xml. docxtemplater, al RELLENAR (ver rellenarDocx), ya
 * los procesa solo con que el .docx los declare ahí -- eso lo hace
 * cualquier Word real. Lo que esta función resuelve es la mitad que
 * depende de nosotros: poner el hueco ahí adentro en primer lugar, porque
 * ponerHuecosEnDocx no es docxtemplater.
 */
function partesDeTextoDeDocx(zip: PizZip): string[] {
  const principal = zip.file("word/document.xml") ? ["word/document.xml"] : []
  const encabezadosYPies = zip.file(/^word\/(header|footer)\d*\.xml$/).map((f) => f.name)
  return [...principal, ...encabezadosYPies]
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

  const vecesPorHueco = new Map<string, number>()
  const archivosConAnidado = new Set<string>()

  for (const ruta of partes) {
    const archivo = salida.file(ruta)
    if (!archivo) continue
    let xml = archivo.asText()

    for (const { buscado, hueco } of orden) {
      if (!buscado || !huecoValido(hueco)) continue

      const segmentos = segmentosDeNivelSuperior(xml, "p")
      let xmlNuevo = ""
      let cursorXml = 0
      let vecesAqui = 0
      for (const seg of segmentos) {
        xmlNuevo += xml.slice(cursorXml, seg.inicio)
        if (seg.anidado) archivosConAnidado.add(ruta)
        const r = ponerHueco(xml.slice(seg.inicio, seg.fin), buscado, hueco)
        xmlNuevo += r.xml
        vecesAqui += r.veces
        cursorXml = seg.fin
      }
      xmlNuevo += xml.slice(cursorXml)
      xml = xmlNuevo
      if (vecesAqui > 0) vecesPorHueco.set(hueco, (vecesPorHueco.get(hueco) || 0) + vecesAqui)
    }

    salida.file(ruta, xml)
  }

  const puestos: Array<{ buscado: string; hueco: string; veces: number }> = []
  const faltantes: string[] = []
  for (const { buscado, hueco } of orden) {
    if (!buscado) {
      faltantes.push("(vacío -- se ignoró)")
      continue
    }
    if (!huecoValido(hueco)) {
      faltantes.push(`${buscado} (el hueco "${hueco}" no tiene una forma válida)`)
      continue
    }
    const veces = vecesPorHueco.get(hueco) || 0
    if (veces > 0) puestos.push({ buscado, hueco, veces })
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
 * docxtemplater procesa también encabezado y pie solo, sin que haga falta
 * nada especial acá: lo hace en cuanto [Content_Types].xml los declara con
 * el content-type de header/footer, que es lo que trae cualquier .docx
 * real armado por Word.
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
 * revisando cuerpo, encabezado y pie.
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
    // que no existe. ||| no es letra, número ni el espacio que \s*
    // permite adentro del patrón, así que corta la lectura ahí en vez de
    // unir dos párrafos en un solo hueco inventado.
    const texto = segmentos
      .map((seg) => desescapar([...xml.slice(seg.inicio, seg.fin).matchAll(RE_TEXTO)].map((t) => t[1]).join("")))
      .join("|||")
    for (const m of texto.matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)) nombres.add(m[1])
  }
  return [...nombres]
}
