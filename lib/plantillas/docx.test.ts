import { describe, it, expect } from "vitest"
import fs from "node:fs"
import PizZip from "pizzip"
import { ponerHueco, ponerHuecosEnDocx, rellenarDocx, huecosDe } from "./docx"

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

function armarDocx(bodyXml: string, extra?: { header?: string; footer?: string }): PizZip {
  const overrides = [
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>`,
  ]
  if (extra?.header) {
    overrides.push(
      `<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>`
    )
  }
  if (extra?.footer) {
    overrides.push(
      `<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>`
    )
  }
  const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${overrides.join("")}</Types>`
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}</w:body></w:document>`
  const zip = new PizZip()
  zip.file("[Content_Types].xml", ct)
  zip.folder("_rels")!.file(".rels", RELS)
  zip.folder("word")!.file("document.xml", doc)
  if (extra?.header) {
    zip
      .folder("word")!
      .file(
        "header1.xml",
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${extra.header}</w:hdr>`
      )
  }
  if (extra?.footer) {
    zip
      .folder("word")!
      .file(
        "footer1.xml",
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${extra.footer}</w:ftr>`
      )
  }
  return zip
}

const xmlDe = (zip: PizZip) => zip.file("word/document.xml")!.asText()
const textoDeXml = (xml: string) =>
  [...xml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join("")
const textoDe = (zip: PizZip) => textoDeXml(xmlDe(zip))
const textoDeParte = (zip: PizZip, ruta: string) => textoDeXml(zip.file(ruta)!.asText())

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
    const parrafo = `<w:p>${run("Hola")}</w:p>`
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

describe("ponerHueco — escapado consistente en las dos direcciones", () => {
  it("encuentra un valor con & aunque el XML lo guarde escapado como &amp;", () => {
    const parrafo = `<w:p>${run("Estudio Pérez &amp; Asociados presente.")}</w:p>`
    const r = ponerHueco(parrafo, "Pérez & Asociados", "{{ESTUDIO}}")
    expect(r.ok).toBe(true)
    expect(r.xml).toContain("{{ESTUDIO}}")
  })

  it("el prefijo y el sufijo con & se escriben una sola vez -- nunca &amp;amp;", () => {
    const parrafo = `<w:p>${run("A & Juan Pérez & B")}</w:p>`
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

  it("un valor que vive DENTRO de una celda de tabla se encuentra igual que en cualquier párrafo", () => {
    // Las tablas no anidan <w:p> dentro de <w:p> -- cada celda es un
    // párrafo de nivel superior más, así que no hace falta nada especial.
    const zip = armarDocx(TABLA)
    const r = ponerHuecosEnDocx(zip, [{ buscado: "Juan Pérez", hueco: "{{NOMBRE}}" }])
    expect(r.puestos).toEqual([{ buscado: "Juan Pérez", hueco: "{{NOMBRE}}", veces: 1 }])
  })
})

describe("ponerHuecosEnDocx — un cuadro de texto anidado nunca corrompe el archivo", () => {
  const cuadroDeTexto = (adentro: string) =>
    `<w:r><w:pict><v:shape><v:textbox><w:txbxContent><w:p>${run(adentro)}</w:p></w:txbxContent></v:textbox></v:shape></w:pict></w:r>`

  it("el XML sigue balanceado (mismas aperturas que cierres de <w:p>) aunque haya un cuadro de texto adentro", () => {
    const parrafo = `<w:p>${run("Texto normal antes. ")}${cuadroDeTexto("Adentro del cuadro: Juan Pérez")}${run(" Texto normal después.")}</w:p>`
    const zip = armarDocx(parrafo)
    const r = ponerHuecosEnDocx(zip, [{ buscado: "Juan Pérez", hueco: "{{NOMBRE}}" }])
    const xmlFinal = xmlDe(r.zip)
    const aperturas = (xmlFinal.match(/<w:p(?:\s[^>]*)?>/g) || []).length
    const cierres = (xmlFinal.match(/<\/w:p>/g) || []).length
    expect(aperturas).toBe(cierres)
  })

  it("no revisa por dentro del cuadro de texto -- y lo AVISA en vez de fingir que revisó todo", () => {
    const parrafo = `<w:p>${run("Texto normal antes. ")}${cuadroDeTexto("Adentro del cuadro: Juan Pérez")}${run(" Texto normal después.")}</w:p>`
    const zip = armarDocx(parrafo)
    const r = ponerHuecosEnDocx(zip, [{ buscado: "Juan Pérez", hueco: "{{NOMBRE}}" }])
    expect(r.faltantes).toEqual(["Juan Pérez"])
    expect(r.advertencias.length).toBeGreaterThan(0)
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
})
