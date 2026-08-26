import { describe, it, expect } from "vitest"
import fs from "node:fs"
import PizZip from "pizzip"
import { ponerHueco, ponerHuecosEnDocx, rellenarDocx, huecosDe, textoDeDocx } from "./docx"

// ---------------------------------------------------------------------------
// Helpers para armar un .docx en memoria
// ---------------------------------------------------------------------------

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`

/** Un <w:r>: un pedazo de texto con su formato, sin atributos en el <w:r>. */
const run = (texto: string, formato = "") => `<w:r>${formato}<w:t xml:space="preserve">${texto}</w:t></w:r>`

/** Un <w:r> CON atributos, como escribe Word cada vez que alguien edita y
 * guarda (w:rsidRPr, w:rsidR...). El regex original exigía `<w:r>` pelado y
 * no lo reconocía. */
const runConAtributos = (texto: string, formato = "") =>
  `<w:r w:rsidRPr="00AB12CD" w:rsidR="00EF34GH">${formato}<w:t xml:space="preserve">${texto}</w:t></w:r>`

const NEGRITA = `<w:rPr><w:b/></w:rPr>`

/** Un run sin texto, como una imagen. Tiene que sobrevivir intacto pase lo
 * que pase alrededor. */
const IMAGEN = `<w:r><w:drawing><wp:inline><a:graphic><a:graphicData/></a:graphic></wp:inline></w:drawing></w:r>`

/** Un cuadro de texto: un <w:p> ADENTRO de otro <w:p>. Es lo que rompe
 * cualquier lectura del párrafo hecha con un regex no-codicioso. */
const cuadroDeTexto = (adentro: string) =>
  `<w:r><w:pict><v:shape><v:textbox><w:txbxContent><w:p>${run(adentro)}</w:p></w:txbxContent></v:textbox></v:shape></w:pict></w:r>`

// Las cinco construcciones que Word escribe SOLO, sin que nadie las pida, y
// que envuelven runs o viven entre ellos. Cada una deja un cierre sin
// apertura si la reconstrucción del párrafo recorta de un saque desde el
// primer run hasta el último.
const HIPERVINCULO = (adentro: string) => `<w:hyperlink r:id="rId9" w:history="1">${adentro}</w:hyperlink>`
const CONTROL_DE_CONTENIDO = (adentro: string) =>
  `<w:sdt><w:sdtPr><w:alias w:val="Asesor"/><w:id w:val="123"/></w:sdtPr><w:sdtContent>${adentro}</w:sdtContent></w:sdt>`
const CONTROL_DE_CAMBIOS = (adentro: string) =>
  `<w:ins w:id="7" w:author="Leonardo" w:date="2026-08-26T09:00:00Z">${adentro}</w:ins>`
const CAMPO_DE_WORD = (adentro: string) => `<w:fldSimple w:instr=" PAGE ">${adentro}</w:fldSimple>`
/** Los marcadores anclan referencias cruzadas y campos de firma: si
 * desaparecen, lo que apuntaba ahí queda apuntando a la nada. */
const MARCADOR = `<w:bookmarkStart w:id="1" w:name="_GoBack"/><w:bookmarkEnd w:id="1"/>`

/**
 * Parte un texto en un <w:r> POR CADA PALABRA Y CADA ESPACIO -- así es como
 * escribe Word de verdad. Medido contra un contrato real: 383 de 437
 * párrafos partidos en tres pedazos o más, y no en tres prolijos como
 * simulaba el brief original.
 */
function comoLoParteWord(texto: string, formato = ""): string {
  return texto
    .split(/(\s+)/)
    .filter((t) => t.length > 0)
    .map((t) => run(t, formato))
    .join("")
}

function armarDocx(
  bodyXml: string,
  extra?: { header?: string; footer?: string; footnotes?: string; comments?: string }
): PizZip {
  const base = "application/vnd.openxmlformats-officedocument.wordprocessingml"
  const overrides = [`<Override PartName="/word/document.xml" ContentType="${base}.document.main+xml"/>`]
  const zip = new PizZip()
  const word = zip.folder("word")!

  const parte = (nombre: string, tipo: string, raiz: string, contenido?: string) => {
    if (!contenido) return
    overrides.push(`<Override PartName="/word/${nombre}.xml" ContentType="${base}.${tipo}+xml"/>`)
    word.file(
      `${nombre}.xml`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:${raiz} xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${contenido}</w:${raiz}>`
    )
  }
  parte("header1", "header", "hdr", extra?.header)
  parte("footer1", "footer", "ftr", extra?.footer)
  parte("footnotes", "footnotes", "footnotes", extra?.footnotes)
  parte("comments", "comments", "comments", extra?.comments)

  const doc =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<w:body>${bodyXml}</w:body></w:document>`
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${overrides.join("")}</Types>`
  )
  zip.folder("_rels")!.file(".rels", RELS)
  word.file("document.xml", doc)
  return zip
}

const xmlDe = (zip: PizZip) => zip.file("word/document.xml")!.asText()
// El patrón exige el borde de la etiqueta: `<w:t[^>]*>` (sin el \s) también
// matchea `<w:tab/>` y `<w:tbl>` -- que es exactamente el error que este
// archivo documenta. Ni siquiera los helpers del test pueden usarlo.
const textoDeXml = (xml: string) =>
  [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join("")
const textoDe = (zip: PizZip) => textoDeXml(xmlDe(zip))
const textoDeParte = (zip: PizZip, ruta: string) => textoDeXml(zip.file(ruta)!.asText())

/**
 * ¿Abren y cierran TODAS las etiquetas, en orden?
 *
 * Escrito acá a propósito, con otra técnica que la del módulo (un regex en
 * vez de un recorrido a mano): si compartieran implementación, compartirían
 * también el error, y el test diría que está sano justo cuando no lo está.
 *
 * Contar solo los <w:p> --como hacía la versión anterior de este test-- deja
 * pasar un </w:hyperlink> huérfano sin despeinarse. Word abre ese archivo
 * pidiendo repararlo; mammoth, en cambio, lo lee igual porque es tolerante.
 */
/** Las entidades XML resueltas, para comparar textos y no representaciones. */
const sinEntidades = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")

function balanceado(xml: string): boolean {
  const limpio = xml.replace(/<\?[\s\S]*?\?>/g, "").replace(/<!--[\s\S]*?-->/g, "")
  const pila: string[] = []
  for (const m of limpio.matchAll(/<(\/?)([A-Za-z_][\w:.\-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g)) {
    const [, barra, nombre, resto] = m
    if (barra) {
      if (pila.pop() !== nombre) return false
    } else if (!resto.trimEnd().endsWith("/")) {
      pila.push(nombre)
    }
  }
  return pila.length === 0
}

// El caso realista: Word partió "El asesor Juan Pérez con CUIT
// 20-12345678-9 acuerda." PALABRA POR PALABRA, y el párrafo tiene además un
// título en negrita que NO se puede perder.
const PARRAFO_REALISTA =
  `<w:p>` +
  comoLoParteWord("CLÁUSULA 1. ", NEGRITA) +
  comoLoParteWord("El asesor Juan Pérez con CUIT 20-12345678-9 acuerda.") +
  `</w:p>`

const TEXTO_ORIGINAL = "CLÁUSULA 1. El asesor Juan Pérez con CUIT 20-12345678-9 acuerda."

// ---------------------------------------------------------------------------

describe("ponerHueco — el texto que Word parte de verdad (palabra por palabra)", () => {
  it("encuentra y reemplaza un texto partido en muchos pedazos", () => {
    const r = ponerHueco(PARRAFO_REALISTA, "Juan Pérez", "{{NOMBRE}}")
    expect(r.ok).toBe(true)
    expect(r.veces).toBe(1)
    expect(r.xml).toContain("{{NOMBRE}}")
  })

  it("CONSERVA el formato del resto del párrafo -- la negrita queda SOLO en el título", () => {
    // Test estructural, no de "contiene la cadena <w:b/>": si alguien
    // aplanara el párrafo entero, la negrita se corre de más (le queda a
    // todo) o se pierde (no le queda a nadie). Con el algoritmo correcto,
    // solo el título queda en negrita y el cierre del párrafo ("acuerda")
    // sigue sin ella.
    const r = ponerHueco(PARRAFO_REALISTA, "Juan Pérez", "{{NOMBRE}}")
    const corridas = [...r.xml.matchAll(/<w:r[\s\S]*?<\/w:r>/g)].map((m) => m[0])
    const conNegrita = corridas.filter((c) => c.includes("<w:b/>"))
    const sinNegrita = corridas.filter((c) => !c.includes("<w:b/>"))
    expect(conNegrita.length).toBeGreaterThan(0)
    for (const c of conNegrita) expect(c).not.toContain("acuerda")
    expect(sinNegrita.some((c) => c.includes("acuerda"))).toBe(true)
  })

  it("también reemplaza un texto que quedó entero (el CUIT)", () => {
    const r = ponerHueco(PARRAFO_REALISTA, "20-12345678-9", "{{CUIT}}")
    expect(r.ok).toBe(true)
    expect(r.xml).toContain("{{CUIT}}")
  })

  it("avisa cuando el texto no está, en vez de romper", () => {
    const r = ponerHueco(PARRAFO_REALISTA, "Pedro Gómez", "{{NOMBRE}}")
    expect(r.ok).toBe(false)
    expect(r.xml).toBe(PARRAFO_REALISTA)
  })

  it("un buscado vacío no rompe nada: '' encuentra en cualquier posición, así que se guarda antes", () => {
    // El párrafo TERMINA en un caracter que no es letra ni número, y eso no
    // es decorativo: es lo único que destapa el problema. Con "Hola" a
    // secas, el borde de palabra descarta solo la aparición del final y no
    // queda ninguna, así que el test pasaba igual sin la guarda -- una luz
    // verde comprada. Con "Hola." el vacío SÍ "aparece" después del punto.
    const parrafo = `<w:p>${run("Hola.")}</w:p>`
    const r = ponerHueco(parrafo, "", "{{X}}")
    expect(r.ok).toBe(false)
    expect(r.veces).toBe(0)
    expect(r.xml).toBe(parrafo)
  })

  it("un hueco con forma inválida (sin cerrar, con &, vacío) no se inyecta crudo en el XML", () => {
    const parrafo = `<w:p>${run("Juan Pérez firma.")}</w:p>`
    for (const huecoRaro of ["{{NOMBRE", "NOMBRE}}", "{{}}", "{{NOMBRE Y APELLIDO}}", "{{NOMBRE&APELLIDO}}"]) {
      const r = ponerHueco(parrafo, "Juan Pérez", huecoRaro)
      expect(r.ok).toBe(false)
      expect(r.xml).toBe(parrafo)
    }
  })

  it("el MISMO valor dos veces en el MISMO párrafo se reemplaza las dos veces", () => {
    // Que estén en párrafos distintos no alcanza como prueba: ahí cada
    // párrafo se procesa por separado y una sola aparición por párrafo
    // sumaría dos igual. La cuenta de apariciones dentro de UN párrafo solo
    // se ejercita con las dos juntas acá adentro.
    const zip = armarDocx(`<w:p>${run("Firman Juan Pérez y Juan Pérez, en dos calidades.")}</w:p>`)
    const r = ponerHuecosEnDocx(zip, [{ buscado: "Juan Pérez", hueco: "{{NOMBRE}}" }])
    expect(r.puestos).toEqual([{ buscado: "Juan Pérez", hueco: "{{NOMBRE}}", veces: 2 }])

    const salida = rellenarDocx(r.zip, { NOMBRE: "María González" })
    expect(textoDe(salida)).toBe("Firman María González y María González, en dos calidades.")
  })
})

describe("ponerHueco — runs con atributos y contenido sin texto", () => {
  it("un run CON atributos (w:rsidRPr) se reconoce, y lo que tiene adentro nunca se pierde", () => {
    // Antes: RE_RUN exigía <w:r> pelado. No matcheaba éste, y todo lo que
    // quedara "en el medio" del rango reemplazado se borraba sin aviso.
    // Acá el medio tiene contenido real que tiene que sobrevivir intacto.
    const parrafo = `<w:p>${run("Juan ")}${runConAtributos("MUY IMPORTANTE ")}${run("Pérez")}${run(" firma.")}</w:p>`
    const r = ponerHueco(parrafo, "Pérez", "{{APELLIDO}}")
    expect(r.ok).toBe(true)
    expect(r.xml).toContain("MUY IMPORTANTE")
    expect(r.xml).toContain("{{APELLIDO}}")
  })

  it("con el run reconocido como texto real, 'Juan Pérez' ya NO se encuentra pegado", () => {
    const parrafo = `<w:p>${run("Juan ")}${runConAtributos("MUY IMPORTANTE ")}${run("Pérez")}${run(" firma.")}</w:p>`
    const r = ponerHueco(parrafo, "Juan Pérez", "{{NOMBRE}}")
    expect(r.ok).toBe(false)
  })

  it("los atributos del <w:r> sobreviven al run que SÍ se reescribe", () => {
    const parrafo = `<w:p>${runConAtributos("Contrato de Juan Pérez, asesor.")}</w:p>`
    const r = ponerHueco(parrafo, "Juan Pérez", "{{NOMBRE}}")
    expect(r.ok).toBe(true)
    expect(r.xml).toContain("{{NOMBRE}}")
    expect(r.xml).toContain(`w:rsidRPr="00AB12CD"`)
  })

  it("una imagen en el medio del match no se pierde, aunque el match la atraviese", () => {
    // La imagen no aporta texto ("Juan" + imagen + " Pérez" da "Juan Pérez"
    // seguido igual), así que el match SÍ la atraviesa -- y tiene que
    // sobrevivir en el resultado, no desaparecer.
    const parrafo = `<w:p>${run("Juan")}${IMAGEN}${run(" Pérez")}</w:p>`
    const r = ponerHueco(parrafo, "Juan Pérez", "{{NOMBRE}}")
    expect(r.ok).toBe(true)
    expect(r.xml).toContain("<w:drawing>")
  })
})

describe("ponerHueco — lo que NO es texto y vive DENTRO del mismo run que el texto", () => {
  // La propiedad "nunca se parte ni se pierde, esté donde esté, incluso en
  // el medio de un match" valía para un run entero sin texto. Tiene que
  // valer igual un escalón más abajo: para un <w:tab/> o un <w:br/> que
  // conviven con el texto adentro del MISMO <w:r>. Reescribir el run como
  // <w:r>{rPr}<w:t>…</w:t></w:r> se los llevaba puestos en silencio.

  it("un <w:tab/> al principio del run sobrevive al reemplazo", () => {
    const parrafo = `<w:p><w:r><w:tab/><w:t xml:space="preserve">Juan Pérez</w:t></w:r></w:p>`
    const r = ponerHueco(parrafo, "Juan Pérez", "{{NOMBRE}}")
    expect(r.ok).toBe(true)
    expect(r.xml).toContain("<w:tab/>")
    expect(textoDeXml(r.xml)).toBe("{{NOMBRE}}")
    expect(balanceado(r.xml)).toBe(true)
  })

  it("un <w:tab/> EN EL MEDIO del texto que se reemplaza se queda en su lugar", () => {
    // El match cruza la tabulación: "Juan" + tab + " Pérez" se lee "Juan
    // Pérez" de corrido. La tabulación no se descarta ni se manda al final:
    // sigue entre lo que quedó antes y lo que quedó después.
    const parrafo = `<w:p><w:r><w:t xml:space="preserve">Juan</w:t><w:tab/><w:t xml:space="preserve"> Pérez, asesor.</w:t></w:r></w:p>`
    const r = ponerHueco(parrafo, "Juan Pérez", "{{NOMBRE}}")
    expect(r.ok).toBe(true)
    expect(r.xml).toContain("<w:tab/>")
    expect(r.xml.indexOf("{{NOMBRE}}")).toBeLessThan(r.xml.indexOf("<w:tab/>"))
    expect(textoDeXml(r.xml)).toBe("{{NOMBRE}}, asesor.")
    expect(balanceado(r.xml)).toBe(true)
  })

  it("un <w:br/> al final del run sobrevive al reemplazo", () => {
    const parrafo = `<w:p><w:r><w:t xml:space="preserve">Juan Pérez</w:t><w:br/></w:r></w:p>`
    const r = ponerHueco(parrafo, "Juan Pérez", "{{NOMBRE}}")
    expect(r.ok).toBe(true)
    expect(r.xml).toContain("<w:br/>")
    expect(balanceado(r.xml)).toBe(true)
  })

  it("un <w:rPr/> vacío no se confunde con contenido y el formato se sigue emitiendo", () => {
    const parrafo = `<w:p><w:r><w:rPr/><w:t xml:space="preserve">Juan Pérez firma.</w:t></w:r></w:p>`
    const r = ponerHueco(parrafo, "Juan Pérez", "{{NOMBRE}}")
    expect(r.ok).toBe(true)
    expect(textoDeXml(r.xml)).toBe("{{NOMBRE}} firma.")
    expect(balanceado(r.xml)).toBe(true)
  })
})

describe("ponerHueco — la red de seguridad: nunca éxito habiendo roto el archivo", () => {
  it("si el párrafo reconstruido no queda balanceado, se devuelve el original y NO se informa éxito", () => {
    // Este párrafo ya viene roto (le falta el </w:hyperlink>): no hay forma
    // de devolverlo sano. Antes que entregar un .docx que Word abre
    // pidiendo repararlo, se deja intacto y el valor cae en `faltantes`,
    // donde el director lo ve. Vale para cualquier construcción que no
    // hayamos previsto, no solo para ésta.
    const parrafo = `<w:p><w:hyperlink r:id="rId9">${run("Juan Pérez firma.")}</w:p>`
    const r = ponerHueco(parrafo, "Juan Pérez", "{{NOMBRE}}")
    expect(r.ok).toBe(false)
    expect(r.veces).toBe(0)
    expect(r.xml).toBe(parrafo)
  })
})

describe("ponerHueco — escapado consistente en las dos direcciones", () => {
  it("encuentra un valor con & aunque el XML lo guarde escapado como &amp;", () => {
    const parrafo = `<w:p>${run("Estudio Pérez &amp; Asociados presente.")}</w:p>`
    const r = ponerHueco(parrafo, "Pérez & Asociados", "{{ESTUDIO}}")
    expect(r.ok).toBe(true)
    expect(r.xml).toContain("{{ESTUDIO}}")
  })

  it("el prefijo y el sufijo con & se escriben una sola vez -- nunca &amp;amp;", () => {
    const parrafo = `<w:p>${run("A &amp; Juan Pérez &amp; B")}</w:p>`
    const r = ponerHueco(parrafo, "Juan Pérez", "{{NOMBRE}}")
    expect(r.ok).toBe(true)
    expect(r.xml).toContain("A &amp; ")
    expect(r.xml).toContain(" &amp; B")
    expect(r.xml).not.toContain("&amp;amp;")
  })
})

describe("ponerHueco — el sufijo conserva SU PROPIO formato", () => {
  it("el sufijo de un reemplazo que cruza dos runs con formato distinto NO hereda la negrita del que empezó", () => {
    const parrafo = `<w:p>${run("Contrato de Juan ", NEGRITA)}${run("Pérez, asesor de zona.")}</w:p>`
    const r = ponerHueco(parrafo, "Juan Pérez", "{{NOMBRE}}")
    expect(r.ok).toBe(true)
    const corridas = [...r.xml.matchAll(/<w:r[\s\S]*?<\/w:r>/g)].map((m) => m[0])
    const conSufijo = corridas.find((c) => c.includes("asesor de zona"))
    expect(conSufijo).toBeDefined()
    expect(conSufijo).not.toContain("<w:b/>")
  })
})

describe("el límite de palabra: no se reemplaza adentro de otra palabra", () => {
  it("'Norte' NO toca 'Norteeste' -- partiría el domicilio por la mitad", () => {
    const zip = armarDocx(`<w:p>${run("Domicilio Norteeste 123.")}</w:p>`)
    const r = ponerHuecosEnDocx(zip, [{ buscado: "Norte", hueco: "{{ZONA}}" }])
    expect(r.puestos).toEqual([])
    expect(r.faltantes).toEqual(["Norte"])
  })

  it("pero SÍ reemplaza 'Norte' cuando aparece como palabra propia, en el mismo documento", () => {
    const zip = armarDocx(`<w:p>${run("Domicilio Norteeste 123, zona Norte.")}</w:p>`)
    const r = ponerHuecosEnDocx(zip, [{ buscado: "Norte", hueco: "{{ZONA}}" }])
    expect(r.puestos).toEqual([{ buscado: "Norte", hueco: "{{ZONA}}", veces: 1 }])
  })

  it("un CUIT con guiones se encuentra entero -- el límite es por AFUERA del valor, no adentro", () => {
    const zip = armarDocx(`<w:p>${run("CUIT: 20-12345678-9.")}</w:p>`)
    const r = ponerHuecosEnDocx(zip, [{ buscado: "20-12345678-9", hueco: "{{CUIT}}" }])
    expect(r.puestos).toEqual([{ buscado: "20-12345678-9", hueco: "{{CUIT}}", veces: 1 }])
  })
})

describe("ponerHuecosEnDocx — las tablas no contaminan el texto", () => {
  const TABLA =
    `<w:tbl>` +
    `<w:tr><w:tc>${`<w:p>${run("Asesor")}</w:p>`}</w:tc><w:tc>${`<w:p>${run("Juan Pérez")}</w:p>`}</w:tc></w:tr>` +
    `</w:tbl>`

  it("huecosDe no confunde <w:tbl>/<w:tc> con <w:t> -- el patrón exige el borde de la etiqueta", () => {
    const zip = armarDocx(TABLA + `<w:p>${run("Hola {{NOMBRE}}.")}</w:p>`)
    expect(huecosDe(zip)).toEqual(["NOMBRE"])
  })

  it("huecosDe tampoco confunde <w:tab/> con <w:t> aunque parta un hueco al medio", () => {
    // Sin el borde de la etiqueta, `<w:t[^>]*>` matchea `<w:tab/>` y se
    // traga el `<w:t>` siguiente como si fuera texto: el hueco partido
    // queda con basura XML en el medio y no se reconoce más.
    const zip = armarDocx(`<w:p><w:r><w:t>Hola {{NOM</w:t><w:tab/><w:t>BRE}}, firmá.</w:t></w:r></w:p>`)
    expect(huecosDe(zip)).toEqual(["NOMBRE"])
  })

  it("un valor que vive DENTRO de una celda de tabla se encuentra igual que en cualquier párrafo", () => {
    // Las tablas no anidan <w:p> dentro de <w:p> -- cada celda es un
    // párrafo de nivel superior más, así que no hace falta nada especial.
    const zip = armarDocx(TABLA)
    const r = ponerHuecosEnDocx(zip, [{ buscado: "Juan Pérez", hueco: "{{NOMBRE}}" }])
    expect(r.puestos).toEqual([{ buscado: "Juan Pérez", hueco: "{{NOMBRE}}", veces: 1 }])
  })
})

describe("ponerHuecosEnDocx — las construcciones que Word escribe solo", () => {
  // Hipervínculos, controles de contenido, control de cambios, campos y
  // marcadores ENVUELVEN runs o viven entre ellos. Ninguno se pide: Word
  // los escribe cuando alguien pega un mail, activa "controlar cambios" o
  // inserta un número de página. Reconstruir el párrafo de un saque, desde
  // el primer run hasta el último, se los lleva puestos y deja los cierres
  // sin apertura: Word abre el archivo pidiendo repararlo, y la función
  // devolvía ok: true.
  const CUERPO =
    `<w:p>${HIPERVINCULO(run("contacto@vakdor.com"))}${run(" — Juan Pérez, asesor.")}</w:p>` +
    `<w:p>${run("Escribile a Juan Pérez a ")}${HIPERVINCULO(run("juan@vakdor.com"))}</w:p>` +
    `<w:p>${CONTROL_DE_CONTENIDO(run("Juan Pérez"))}${run(" acepta.")}</w:p>` +
    `<w:p>${CONTROL_DE_CAMBIOS(run("Juan Pérez"))}${run(" firma.")}</w:p>` +
    `<w:p>${CAMPO_DE_WORD(run("1"))}${run(" — Juan Pérez")}</w:p>` +
    `<w:p>${MARCADOR}${run("Domicilio de Juan Pérez.")}${MARCADOR}</w:p>` +
    `<w:p>${cuadroDeTexto("logo")}${run("Contrato de Juan Pérez.")}</w:p>`

  it("el XML de salida queda balanceado -- TODAS las etiquetas, no solo los <w:p>", () => {
    const zip = armarDocx(CUERPO)
    expect(balanceado(xmlDe(zip))).toBe(true) // el fixture arranca sano
    const r = ponerHuecosEnDocx(zip, [{ buscado: "Juan Pérez", hueco: "{{NOMBRE}}" }])
    expect(balanceado(xmlDe(r.zip))).toBe(true)
  })

  it("ninguna de esas construcciones se pierde, y el reemplazo entra en las siete", () => {
    const zip = armarDocx(CUERPO)
    const r = ponerHuecosEnDocx(zip, [{ buscado: "Juan Pérez", hueco: "{{NOMBRE}}" }])
    expect(r.puestos).toEqual([{ buscado: "Juan Pérez", hueco: "{{NOMBRE}}", veces: 7 }])

    const salidaXml = xmlDe(r.zip)
    expect((salidaXml.match(/<\/w:hyperlink>/g) || []).length).toBe(2)
    expect(salidaXml).toContain("<w:sdtContent>")
    expect(salidaXml).toContain(`<w:ins w:id="7"`)
    expect(salidaXml).toContain(`<w:fldSimple w:instr=" PAGE ">`)
    expect((salidaXml.match(/_GoBack/g) || []).length).toBe(2)
    expect(salidaXml).toContain("<w:txbxContent>")
  })

  it("y el documento se rellena después sin rastro del nombre viejo", () => {
    const zip = armarDocx(CUERPO)
    const r = ponerHuecosEnDocx(zip, [{ buscado: "Juan Pérez", hueco: "{{NOMBRE}}" }])
    const salida = rellenarDocx(r.zip, { NOMBRE: "María González" })
    const texto = textoDe(salida)
    expect(texto).not.toContain("Juan Pérez")
    expect((texto.match(/María González/g) || []).length).toBe(7)
  })
})

describe("ponerHuecosEnDocx — un cuadro de texto anidado nunca corrompe el archivo", () => {
  it("el XML sigue balanceado aunque haya un cuadro de texto adentro del párrafo", () => {
    const parrafo = `<w:p>${run("Texto normal antes. ")}${cuadroDeTexto("Adentro del cuadro: Juan Pérez")}${run(" Texto normal después.")}</w:p>`
    const zip = armarDocx(parrafo)
    const r = ponerHuecosEnDocx(zip, [{ buscado: "Juan Pérez", hueco: "{{NOMBRE}}" }])
    expect(balanceado(xmlDe(r.zip))).toBe(true)
  })

  it("no revisa por dentro del cuadro de texto -- y lo AVISA en vez de fingir que revisó todo", () => {
    const parrafo = `<w:p>${run("Texto normal antes. ")}${cuadroDeTexto("Adentro del cuadro: Juan Pérez")}${run(" Texto normal después.")}</w:p>`
    const zip = armarDocx(parrafo)
    const r = ponerHuecosEnDocx(zip, [{ buscado: "Juan Pérez", hueco: "{{NOMBRE}}" }])
    expect(r.faltantes).toEqual(["Juan Pérez"])
    expect(r.advertencias.length).toBeGreaterThan(0)
  })

  it("avisa del cuadro de texto AUNQUE no haya ni un reemplazo pedido", () => {
    // La detección corre sobre el documento, no adentro del bucle de
    // reemplazos: sin reemplazos el bucle no se ejecuta ni una vez, y el
    // aviso salía vacío sobre un documento lleno de cuadros de texto.
    // Callado justo donde hay algo que decir.
    const parrafo = `<w:p>${run("Antes. ")}${cuadroDeTexto("Juan Pérez")}</w:p>`
    const zip = armarDocx(parrafo)
    expect(ponerHuecosEnDocx(zip, []).advertencias.length).toBeGreaterThan(0)
    // Y lo mismo si el único pedido tiene el hueco mal escrito.
    const conHuecoRaro = ponerHuecosEnDocx(zip, [{ buscado: "Juan Pérez", hueco: "{{NO CIERRA" }])
    expect(conHuecoRaro.advertencias.length).toBeGreaterThan(0)
  })

  it("el texto normal ALREDEDOR de un cuadro de texto se sigue reemplazando bien", () => {
    const parrafo = `<w:p>${run("Contrato de ")}${run("Juan Pérez")}${run(", asesor.")}${cuadroDeTexto("logo de la inmobiliaria")}</w:p>`
    const zip = armarDocx(parrafo)
    const r = ponerHuecosEnDocx(zip, [{ buscado: "Juan Pérez", hueco: "{{NOMBRE}}" }])
    expect(r.puestos).toEqual([{ buscado: "Juan Pérez", hueco: "{{NOMBRE}}", veces: 1 }])
  })
})

describe("ponerHuecosEnDocx — reemplaza TODAS las apariciones", () => {
  it("si el nombre está en la cláusula Y en la firma, las dos cambian -- si no, el contrato de María sale firmado por Juan", () => {
    const zip = armarDocx(
      `<w:p>${run("Firma del asesor: Juan Pérez.")}</w:p>` +
        `<w:p>${run("Cláusula de honorarios para Juan Pérez.")}</w:p>`
    )
    const r = ponerHuecosEnDocx(zip, [{ buscado: "Juan Pérez", hueco: "{{NOMBRE}}" }])
    expect(r.puestos).toEqual([{ buscado: "Juan Pérez", hueco: "{{NOMBRE}}", veces: 2 }])

    const salida = rellenarDocx(r.zip, { NOMBRE: "María González" })
    const texto = textoDe(salida)
    expect(texto).toContain("Firma del asesor: María González.")
    expect(texto).toContain("Cláusula de honorarios para María González.")
    expect(texto).not.toContain("Juan Pérez")
  })
})

describe("ponerHuecosEnDocx — un valor que contiene a otro", () => {
  it("'Juan Pérez' se consume antes que 'Juan' -- el chico no lo parte por la mitad", () => {
    const zip = armarDocx(`<w:p>${run("Estimado Juan Pérez, este contrato es para Juan.")}</w:p>`)
    const r = ponerHuecosEnDocx(zip, [
      { buscado: "Juan", hueco: "{{NOMBRE}}" },
      { buscado: "Juan Pérez", hueco: "{{NOMBRE_COMPLETO}}" },
    ])
    // Orden esperado: el más largo primero, porque así procesa
    // ponerHuecosEnDocx -- no se ordena en el test para no tapar justamente
    // lo que se está probando.
    expect(r.puestos).toEqual([
      { buscado: "Juan Pérez", hueco: "{{NOMBRE_COMPLETO}}", veces: 1 },
      { buscado: "Juan", hueco: "{{NOMBRE}}", veces: 1 },
    ])

    const salida = rellenarDocx(r.zip, { NOMBRE_COMPLETO: "María González", NOMBRE: "María" })
    expect(textoDe(salida)).toBe("Estimado María González, este contrato es para María.")
  })
})

describe("ponerHuecosEnDocx — dos valores distintos apuntando al mismo hueco", () => {
  it("el que NO está en el documento se informa como faltante, no como puesto", () => {
    // La cuenta iba por hueco, no por valor buscado: los dos pedidos se
    // llevaban el mismo número y el director veía dos valores colocados
    // donde se colocó uno. Con "JUAN PÉREZ" en mayúsculas --el típico
    // segundo intento de un director que no sabe si el documento respeta
    // mayúsculas-- la app le decía que sí, que también estaba.
    const zip = armarDocx(`<w:p>${run("El asesor Juan Pérez acuerda.")}</w:p>`)
    const r = ponerHuecosEnDocx(zip, [
      { buscado: "Juan Pérez", hueco: "{{NOMBRE}}" },
      { buscado: "JUAN PÉREZ", hueco: "{{NOMBRE}}" },
    ])
    expect(r.puestos).toEqual([{ buscado: "Juan Pérez", hueco: "{{NOMBRE}}", veces: 1 }])
    expect(r.faltantes).toEqual(["JUAN PÉREZ"])
  })
})

describe("ponerHuecosEnDocx / huecosDe / rellenarDocx — encabezado y pie", () => {
  it("ponerHuecosEnDocx pone el hueco también en el encabezado y en el pie", () => {
    const zip = armarDocx(`<w:p>${run("Cuerpo del contrato.")}</w:p>`, {
      header: `<w:p>${run("Contrato de Juan Pérez")}</w:p>`,
      footer: `<w:p>${run("CUIT 20-12345678-9")}</w:p>`,
    })
    const r = ponerHuecosEnDocx(zip, [
      { buscado: "Juan Pérez", hueco: "{{NOMBRE}}" },
      { buscado: "20-12345678-9", hueco: "{{CUIT}}" },
    ])
    expect(r.puestos.map((p) => p.hueco).sort()).toEqual(["{{CUIT}}", "{{NOMBRE}}"])
    expect(textoDeParte(r.zip, "word/header1.xml")).toContain("{{NOMBRE}}")
    expect(textoDeParte(r.zip, "word/footer1.xml")).toContain("{{CUIT}}")
  })

  it("huecosDe encuentra un hueco que vive solo en el encabezado", () => {
    const zip = armarDocx(`<w:p>${run("Cuerpo.")}</w:p>`, {
      header: `<w:p>${run("Membrete: {{NOMBRE}}")}</w:p>`,
    })
    expect(huecosDe(zip)).toEqual(["NOMBRE"])
  })

  it("rellenarDocx (docxtemplater real) rellena el encabezado y el pie solo, sin nada especial de nuestro lado", () => {
    const zip = armarDocx(`<w:p>${run("Cuerpo: {{NOMBRE}}.")}</w:p>`, {
      header: `<w:p>${run("Membrete: {{NOMBRE}}")}</w:p>`,
      footer: `<w:p>${run("Pie: {{CUIT}}")}</w:p>`,
    })
    const salida = rellenarDocx(zip, { NOMBRE: "Juan Pérez", CUIT: "20-12345678-9" })
    expect(textoDeParte(salida, "word/header1.xml")).toContain("Juan Pérez")
    expect(textoDeParte(salida, "word/footer1.xml")).toContain("20-12345678-9")
  })
})

describe("ponerHuecosEnDocx / huecosDe — notas al pie y comentarios", () => {
  // Las dos mitades tienen que mirar las mismas partes del paquete: si
  // rellenarDocx rellena una nota al pie y nosotros no le ponemos el hueco,
  // el dato del asesor nunca llega ahí y nadie lo dice.
  it("un valor que vive en una nota al pie se encuentra, se marca y se rellena", () => {
    const zip = armarDocx(`<w:p>${run("Cuerpo del contrato.")}</w:p>`, {
      footnotes: `<w:footnote w:id="2"><w:p>${run("Comisiones acordadas con Juan Pérez.")}</w:p></w:footnote>`,
    })
    const r = ponerHuecosEnDocx(zip, [{ buscado: "Juan Pérez", hueco: "{{NOMBRE}}" }])
    expect(r.puestos).toEqual([{ buscado: "Juan Pérez", hueco: "{{NOMBRE}}", veces: 1 }])
    expect(huecosDe(r.zip)).toEqual(["NOMBRE"])

    const salida = rellenarDocx(r.zip, { NOMBRE: "María González" })
    expect(textoDeParte(salida, "word/footnotes.xml")).toContain("María González")
  })

  it("lo mismo con un comentario del margen", () => {
    const zip = armarDocx(`<w:p>${run("Cuerpo del contrato.")}</w:p>`, {
      comments: `<w:comment w:id="1" w:author="Leonardo"><w:p>${run("Revisar con Juan Pérez.")}</w:p></w:comment>`,
    })
    const r = ponerHuecosEnDocx(zip, [{ buscado: "Juan Pérez", hueco: "{{NOMBRE}}" }])
    expect(r.puestos).toEqual([{ buscado: "Juan Pérez", hueco: "{{NOMBRE}}", veces: 1 }])

    const salida = rellenarDocx(r.zip, { NOMBRE: "María González" })
    expect(textoDeParte(salida, "word/comments.xml")).toContain("María González")
  })
})

describe("huecosDe — sin huecos fantasma entre párrafos", () => {
  it("un {{ al final de un párrafo y un }} al principio del siguiente NO arman un hueco fantasma", () => {
    const zip = armarDocx(
      `<w:p>${run("Poné las llaves así: {{")}</w:p>` + `<w:p>${run("NOMBRE}} en el lugar correspondiente.")}</w:p>`
    )
    expect(huecosDe(zip)).toEqual([])
  })

  it("lista los huecos que tiene la plantilla", () => {
    const zip = armarDocx(`<w:p>${run("Hola {{NOMBRE}}, CUIT {{CUIT}}, zona {{ZONA}}.")}</w:p>`)
    expect(huecosDe(zip).sort()).toEqual(["CUIT", "NOMBRE", "ZONA"])
  })

  it("encuentra un hueco aunque Word lo haya partido", () => {
    const zip = armarDocx(`<w:p>${run("Hola {{NOM")}${run("BRE}}, firmá.")}</w:p>`)
    expect(huecosDe(zip)).toEqual(["NOMBRE"])
  })

  it("no repite un hueco que aparece dos veces", () => {
    const zip = armarDocx(`<w:p>${run("{{NOMBRE}} ... firma: {{NOMBRE}}")}</w:p>`)
    expect(huecosDe(zip)).toEqual(["NOMBRE"])
  })

  it("un hueco con espacios adentro ({{ NOMBRE }}) se lista con el nombre limpio", () => {
    const zip = armarDocx(`<w:p>${run("Hola {{ NOMBRE }}, firmá.")}</w:p>`)
    expect(huecosDe(zip)).toEqual(["NOMBRE"])
  })
})

describe("el hueco escrito a mano, con un espacio de más", () => {
  // El director escribe los huecos en Word, y "{{ NOMBRE }}" con un
  // espacio de más sale solo. Antes el documento se rellenaba con ese lugar
  // EN BLANCO y sin un aviso: docxtemplater buscaba el dato bajo el nombre
  // " NOMBRE ", con los espacios adentro, y no lo encontraba. Un contrato
  // firmado sin el nombre del asesor.

  it("se rellena con el valor correcto, aunque Word lo haya partido en pedazos", () => {
    // Partido en tres <w:r> --"{{ NOM", "BRE ", "}}"-- que es como lo
    // guarda Word de verdad. Es EL caso que importa: si el nombre del hueco
    // se juntara después de buscar el dato, el trim no alcanzaría.
    const zip = armarDocx(`<w:p>${run("Hola {{ NOM")}${run("BRE ")}${run("}}, firmá.")}</w:p>`)
    const salida = rellenarDocx(zip, { NOMBRE: "María González" })
    expect(textoDe(salida)).toBe("Hola María González, firmá.")
  })

  it("y también entero, en el encabezado y todo", () => {
    const zip = armarDocx(`<w:p>${run("Cuerpo: {{  CUIT  }}.")}</w:p>`, {
      header: `<w:p>${run("Membrete: {{ NOMBRE }}")}</w:p>`,
    })
    const salida = rellenarDocx(zip, { NOMBRE: "María González", CUIT: "27-98765432-1" })
    expect(textoDe(salida)).toBe("Cuerpo: 27-98765432-1.")
    expect(textoDeParte(salida, "word/header1.xml")).toContain("María González")
  })

  it("un hueco con espacios que NO tiene dato sigue quedando vacío, nunca 'undefined'", () => {
    const zip = armarDocx(`<w:p>${run("Hola {{ NOMBRE }}, tu CUIT es {{ CUIT }}.")}</w:p>`)
    const salida = rellenarDocx(zip, { NOMBRE: "Juan" })
    expect(textoDe(salida)).toBe("Hola Juan, tu CUIT es .")
  })

  it("el circuito entero: se pone el hueco, se lista y se rellena", () => {
    const zip = armarDocx(`<w:p>${run("El asesor Juan Pérez acuerda.")}</w:p>`)
    const r = ponerHuecosEnDocx(zip, [{ buscado: "Juan Pérez", hueco: "{{ NOMBRE }}" }])
    expect(r.puestos).toEqual([{ buscado: "Juan Pérez", hueco: "{{ NOMBRE }}", veces: 1 }])
    expect(huecosDe(r.zip)).toEqual(["NOMBRE"])
    expect(textoDe(rellenarDocx(r.zip, { NOMBRE: "María González" }))).toBe(
      "El asesor María González acuerda."
    )
  })
})

describe("el viaje de ida y vuelta", () => {
  it("rellenar con los MISMOS datos devuelve el documento original", () => {
    // Es la red de seguridad del spec §7.3: si esto no da idéntico, la
    // plantilla no se publica. Ahora contra el párrafo partido COMO LO
    // PARTE WORD DE VERDAD, no el de tres pedazos prolijos del brief.
    const zip = armarDocx(PARRAFO_REALISTA)
    const puesto = ponerHuecosEnDocx(zip, [
      { buscado: "Juan Pérez", hueco: "{{NOMBRE}}" },
      { buscado: "20-12345678-9", hueco: "{{CUIT}}" },
    ])
    expect(puesto.faltantes).toEqual([])
    const salida = rellenarDocx(puesto.zip, { NOMBRE: "Juan Pérez", CUIT: "20-12345678-9" })
    expect(textoDe(salida)).toBe(TEXTO_ORIGINAL)
  })

  it("rellenar con los datos de otro asesor da su documento, con el formato intacto", () => {
    const zip = armarDocx(PARRAFO_REALISTA)
    const puesto = ponerHuecosEnDocx(zip, [
      { buscado: "Juan Pérez", hueco: "{{NOMBRE}}" },
      { buscado: "20-12345678-9", hueco: "{{CUIT}}" },
    ])
    const salida = rellenarDocx(puesto.zip, { NOMBRE: "María González", CUIT: "27-98765432-1" })
    expect(textoDe(salida)).toBe("CLÁUSULA 1. El asesor María González con CUIT 27-98765432-1 acuerda.")
    expect(xmlDe(salida)).toContain("<w:b/>")
  })
})

describe("un dato faltante NUNCA escribe 'undefined' en el documento", () => {
  it("deja el hueco vacío en vez de la palabra undefined", () => {
    // Medido con una sonda contra la librería real: sin configurar nada,
    // docxtemplater escribe literalmente "undefined" en el documento.
    // Un contrato que dice "tu CUIT es undefined" es peor que uno que no sale.
    const zip = armarDocx(`<w:p>${run("Hola {{NOMBRE}}, tu CUIT es {{CUIT}}.")}</w:p>`)
    const salida = rellenarDocx(zip, { NOMBRE: "Juan" })
    const texto = textoDe(salida)
    expect(texto).not.toContain("undefined")
    expect(texto).toBe("Hola Juan, tu CUIT es .")
  })
})

describe("ponerHuecosEnDocx", () => {
  it("informa cuáles pudo poner (y cuántas veces) y cuáles no", () => {
    const zip = armarDocx(PARRAFO_REALISTA)
    const r = ponerHuecosEnDocx(zip, [
      { buscado: "Juan Pérez", hueco: "{{NOMBRE}}" },
      { buscado: "NO ESTÁ EN EL DOCUMENTO", hueco: "{{FANTASMA}}" },
    ])
    expect(r.puestos).toEqual([{ buscado: "Juan Pérez", hueco: "{{NOMBRE}}", veces: 1 }])
    expect(r.faltantes).toEqual(["NO ESTÁ EN EL DOCUMENTO"])
  })
})

describe("mensajes claros cuando el archivo no es un .docx válido", () => {
  it("huecosDe avisa con un mensaje entendible, no un TypeError críptico", () => {
    const zip = new PizZip()
    zip.file("cualquier-cosa.txt", "esto no es un word")
    expect(() => huecosDe(zip)).toThrow(/no es un \.docx válido/)
  })

  it("rellenarDocx avisa igual", () => {
    const zip = new PizZip()
    zip.file("cualquier-cosa.txt", "esto no es un word")
    expect(() => rellenarDocx(zip, {})).toThrow(/no es un \.docx válido/)
  })
})

// ---------------------------------------------------------------------------
// Camino opcional: si hay un .docx real a mano (nunca en el repo -- puede
// traer datos de un cliente), se corre también contra él. Sin la variable
// de entorno, este bloque no corre y no rompe nada.
// ---------------------------------------------------------------------------

const RUTA_DOCX_REAL = process.env.PLANTILLA_DOCX_REAL

describe.runIf(!!RUTA_DOCX_REAL)("contra un .docx real (opcional, vía PLANTILLA_DOCX_REAL)", () => {
  it("huecosDe no revienta contra un documento real", () => {
    const buffer = fs.readFileSync(RUTA_DOCX_REAL as string)
    const zip = new PizZip(buffer)
    expect(() => huecosDe(zip)).not.toThrow()
  })

  it("ponerHuecosEnDocx con un texto que casi seguro no está no revienta, y lo informa como faltante", () => {
    const buffer = fs.readFileSync(RUTA_DOCX_REAL as string)
    const zip = new PizZip(buffer)
    const r = ponerHuecosEnDocx(zip, [
      { buscado: "XXXXX-TEXTO-QUE-NO-EXISTE-XXXXX", hueco: "{{NO_EXISTE}}" },
    ])
    expect(r.faltantes).toContain("XXXXX-TEXTO-QUE-NO-EXISTE-XXXXX")
  })

  it("con palabras sacadas del propio documento: entra el hueco, el XML queda sano y vuelve igual", () => {
    // Los fixtures de arriba simulan lo que hace Word. Éste usa lo que Word
    // hizo de verdad, en un contrato con condiciones comerciales reales:
    // se eligen palabras del propio texto, se convierten en huecos y se
    // rellenan con el mismo valor. Si el texto vuelve idéntico y todas las
    // partes quedan balanceadas, la mecánica no rompió nada.
    const buffer = fs.readFileSync(RUTA_DOCX_REAL as string)
    const zip = new PizZip(buffer)

    const antes = zip.file("word/document.xml")!.asText()
    const palabras = [...new Set([...antes.matchAll(/>([^<>]{0,200})</g)].flatMap((m) => m[1].match(/\p{L}{9,}/gu) || []))].slice(0, 15)
    expect(palabras.length).toBeGreaterThan(0)

    const r = ponerHuecosEnDocx(
      zip,
      palabras.map((p, i) => ({ buscado: p, hueco: `{{P${i}}}` }))
    )
    expect(r.puestos.length).toBeGreaterThan(0)

    for (const nombre of Object.keys(r.zip.files)) {
      if (!nombre.startsWith("word/") || !nombre.endsWith(".xml")) continue
      expect(balanceado(r.zip.file(nombre)!.asText()), `${nombre} quedó desbalanceado`).toBe(true)
    }

    const datos = Object.fromEntries(palabras.map((p, i) => [`P${i}`, p]))
    const salida = rellenarDocx(r.zip, datos)
    // Se comparan los textos DESESCAPADOS, no el XML crudo: el original
    // escribe las comillas como &quot; y nosotros las devolvemos como " --
    // las dos formas son XML válido y dicen exactamente lo mismo. Comparar
    // el crudo marcaría en rojo una diferencia que no existe.
    expect(sinEntidades(textoDeParte(salida, "word/document.xml"))).toBe(sinEntidades(textoDeXml(antes)))
  })

  it("y el texto que lee mammoth vuelve idéntico al original", async () => {
    const buffer = fs.readFileSync(RUTA_DOCX_REAL as string)
    const original = await textoDeDocx(buffer)
    const zip = new PizZip(buffer)
    const antes = zip.file("word/document.xml")!.asText()
    const palabras = [...new Set([...antes.matchAll(/>([^<>]{0,200})</g)].flatMap((m) => m[1].match(/\p{L}{9,}/gu) || []))].slice(0, 15)
    const r = ponerHuecosEnDocx(
      zip,
      palabras.map((p, i) => ({ buscado: p, hueco: `{{P${i}}}` }))
    )
    const datos = Object.fromEntries(palabras.map((p, i) => [`P${i}`, p]))
    const salida = rellenarDocx(r.zip, datos)
    expect(await textoDeDocx(salida.generate({ type: "nodebuffer" }))).toBe(original)
  })
})
