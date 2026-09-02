import { describe, it, expect } from "vitest"
import PizZip from "pizzip"

import { ponerHuecosEnDocx, rellenarDocx, textoDeDocx, textoPorParte, huecosDe } from "@/lib/plantillas/docx"
import { detectarHuecos } from "@/lib/plantillas/deteccion"
import { formDataDe, leerPropuestaConfirmada, reemplazosDelMolde } from "./confirmacion"
import { verificarContraElOriginal, verificarDocumentoEntero } from "./verificacion"

/**
 * EL RECORRIDO ENTERO, contra .docx de verdad.
 *
 * Los otros tests miran cada pieza por separado y las tres estaban bien: los
 * nombres se saneaban, los reemplazos se armaban, la comparación distinguía lo
 * que tenía que distinguir. Y el conjunto no ponía UN SOLO CAMPO.
 *
 * El motivo: `ponerHuecosEnDocx` valida el hueco contra la forma `{{NOMBRE}}`
 * antes de tocar el XML, y le llegaba el nombre pelado. Devolvía los 11 campos
 * como faltantes con la leyenda "no tiene una forma válida" y el molde salía
 * idéntico al contrato de una sola persona. Lo descubrió un ensayo con tres
 * contratos reales, no los tests: ninguno cruzaba el límite entre este módulo
 * y `lib/plantillas/docx.ts`.
 *
 * Por eso este archivo existe y por eso arma .docx de verdad: es el único
 * lugar donde las dos mitades se tocan. Los .docx se arman a mano, partidos
 * en un `<w:r>` por palabra —así escribe Word— para que no dependa de ningún
 * archivo de afuera.
 */

// ---------------------------------------------------------------------------
// Un .docx mínimo, partido como lo parte Word
// ---------------------------------------------------------------------------

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`

/**
 * Un `<w:r>` por cada palabra Y por cada espacio, que es como guarda Word un
 * documento que alguien editó. Si el párrafo fuera un solo run, el reemplazo
 * sería un `indexOf` sobre el XML y no probaría nada de lo que importa.
 */
function parrafo(texto: string): string {
  const runs = texto
    .split(/(\s+)/)
    .filter((t) => t.length > 0)
    .map((t) => `<w:r w:rsidR="00A3F2B1"><w:t xml:space="preserve">${t}</w:t></w:r>`)
    .join("")
  return `<w:p w:rsidR="00B71C4D">${runs}</w:p>`
}

function docx(parrafos: string[]): PizZip {
  const base = "application/vnd.openxmlformats-officedocument.wordprocessingml"
  const zip = new PizZip()
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="${base}.document.main+xml"/></Types>`,
  )
  zip.folder("_rels")!.file(".rels", RELS)
  zip
    .folder("word")!
    .file(
      "document.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${parrafos.join("")}</w:body></w:document>`,
    )
  return zip
}

const buffer = (zip: PizZip) => Buffer.from(zip.generate({ type: "nodebuffer" }))

// ---------------------------------------------------------------------------
// Tres contratos que solo se diferencian en los datos de cada persona
// ---------------------------------------------------------------------------

const ANA = "11111111-1111-4111-8111-111111111111"
const BRUNO = "22222222-2222-4222-8222-222222222222"
const CARO = "33333333-3333-4333-8333-333333333333"
const TIPO = "44444444-4444-4444-8444-444444444444"

/**
 * Los datos están elegidos con la misma mala intención que los contratos de
 * prueba de producción: dos CUIT que arrancan igual (20-) y uno distinto, tres
 * razones sociales de largo distinto, y un nombre mucho más largo que los
 * otros dos.
 */
const GENTE = [
  { id: ANA, nombre: "Ana Ruiz", cuit: "27-31456789-4", razon: "Ruiz Propiedades S.A.", zona: "Villa Urquiza" },
  {
    id: BRUNO,
    nombre: "Bruno Sanguinetti Errázuriz",
    cuit: "20-28765432-1",
    razon: "Sanguinetti Servicios S.R.L.",
    zona: "Belgrano R",
  },
  { id: CARO, nombre: "Caro Peña", cuit: "20-33210987-6", razon: "Peña & Asociados S.A.S.", zona: "Saavedra" },
]

const contratoDe = (p: (typeof GENTE)[number]) =>
  docx([
    parrafo("CONTRATO DE PARTNERSHIP COMERCIAL INMOBILIARIO"),
    parrafo(
      `Y por la otra parte ${p.nombre}, mayor de edad, CUIT ${p.cuit}, quien actúa a través de ${p.razon}, en adelante EL ASESOR.`,
    ),
    parrafo(`Se asigna a EL ASESOR la zona de ${p.zona}, con captación preferente.`),
    parrafo(`Aclaración de la firma de EL ASESOR: ${p.nombre}`),
  ])

/** Lo mismo que hace el endpoint, de punta a punta, sin base ni Storage. */
async function recorridoCompleto() {
  const zips = new Map(GENTE.map((p) => [p.id, contratoDe(p)]))
  const docs = await Promise.all(
    GENTE.map(async (p) => ({ advisorId: p.id, texto: await textoDeDocx(buffer(zips.get(p.id)!)) })),
  )

  const deteccion = detectarHuecos(docs)
  const leido = leerPropuestaConfirmada({
    templateId: TIPO,
    moldeAdvisorId: deteccion.documentosUsados[0],
    huecos: deteccion.huecos.map((h, i) => ({
      id: `hueco-${h.indice}`,
      nombre: `CAMPO_${i + 1}`,
      contexto: h.contexto,
      valores: h.valores,
    })),
  })
  if (!leido.ok) throw new Error(`la propuesta se rechazó: ${leido.error}`)

  const { reemplazos, sinValorEnElMolde } = reemplazosDelMolde(leido.propuesta.huecos, leido.propuesta.moldeAdvisorId)
  const puesta = ponerHuecosEnDocx(zips.get(leido.propuesta.moldeAdvisorId)!, reemplazos)
  const colocados = new Set(puesta.puestos.map((x) => x.hueco))
  const noColocados = [...sinValorEnElMolde, ...reemplazos.filter((x) => !colocados.has(x.hueco)).map((x) => x.nombre)]

  const verificaciones = await Promise.all(
    GENTE.map(async (p) => {
      const datos = formDataDe(leido.propuesta.huecos, p.id)
      if (datos === null) return { quien: p.nombre, coincide: false, observacion: "no entró en la comparación" }
      const armado = rellenarDocx(puesta.zip, datos)
      // Las MISMAS partes que el molde toca, igual que el endpoint.
      const v = verificarDocumentoEntero(textoPorParte(zips.get(p.id)!), textoPorParte(armado))
      return { quien: p.nombre, ...v }
    }),
  )

  return { deteccion, leido, reemplazos, puesta, noColocados, verificaciones, zips }
}

// ---------------------------------------------------------------------------

describe("el recorrido entero contra .docx de verdad", () => {
  it("los campos ENTRAN en el documento molde", async () => {
    /**
     * EL TEST QUE FALTABA. Con el nombre pelado en vez de {{NOMBRE}},
     * `puestos` vuelve vacío y `faltantes` dice "no tiene una forma válida"
     * para todos. Nada más se rompe: la detección encuentra los datos, los
     * nombres se sanean, el .docx se guarda. Y no sirve para nada.
     */
    const { puesta, reemplazos, noColocados } = await recorridoCompleto()

    expect(reemplazos.length).toBeGreaterThan(0)
    expect(puesta.puestos.length).toBe(reemplazos.length)
    expect(puesta.faltantes).toEqual([])
    expect(noColocados).toEqual([])
  })

  it("lo que se marca es lo que después se puede leer y rellenar", async () => {
    // Si los dos no coinciden, el contrato sale con un "{{NOMBRE}}" impreso.
    const { puesta, leido } = await recorridoCompleto()
    expect(huecosDe(puesta.zip).sort()).toEqual(leido.propuesta.huecos.map((h) => h.nombre).sort())
  })

  it("los tres asesores coinciden con su archivo original", async () => {
    const { verificaciones } = await recorridoCompleto()
    for (const v of verificaciones) {
      expect(v.coincide, `${v.quien}: ${v.observacion}`).toBe(true)
    }
  })

  it("el molde ya NO dice el nombre de la persona que sirvió de molde", async () => {
    /**
     * El molde es el .docx de Ana con sus datos cambiados por campos. Si su
     * nombre quedara adentro, el contrato de Bruno saldría firmado por Ana —
     * que es exactamente el fallo que la verificación existe para atajar.
     */
    const { puesta } = await recorridoCompleto()
    const texto = await textoDeDocx(Buffer.from(puesta.zip.generate({ type: "nodebuffer" })))
    expect(texto).not.toContain("Ana Ruiz")
    expect(texto).not.toContain("27-31456789-4")
    // Y el texto fijo sigue estando.
    expect(texto).toContain("CONTRATO DE PARTNERSHIP COMERCIAL INMOBILIARIO")
  })

  it("si se borra un campo al revisar, ese asesor queda EN ROJO", async () => {
    /**
     * La otra mitad de la red de seguridad: el director saca un campo que sí
     * era un dato de cada persona. Ahí el contrato de los demás sale con el
     * dato del molde, y tiene que verse.
     */
    const zips = new Map(GENTE.map((p) => [p.id, contratoDe(p)]))
    const docs = await Promise.all(
      GENTE.map(async (p) => ({ advisorId: p.id, texto: await textoDeDocx(buffer(zips.get(p.id)!)) })),
    )
    const deteccion = detectarHuecos(docs)

    /**
     * Se borra el campo del CUIT, que aparece UNA sola vez. El del nombre no
     * serviría para este test: aparece en la cláusula y en la firma, así que
     * la detección propone dos campos y borrar uno deja el otro, que —como
     * `ponerHuecosEnDocx` reemplaza todas las apariciones— igual cubre los dos
     * lugares. Es la conducta correcta y está probada abajo; acá haría que el
     * test pasara por el motivo equivocado.
     */
    const sinElCuit = deteccion.huecos
      .filter((h) => h.valores[ANA] !== "27-31456789-4")
      .map((h, i) => ({
        id: `hueco-${h.indice}`,
        nombre: `CAMPO_${i + 1}`,
        contexto: h.contexto,
        valores: h.valores,
      }))
    expect(sinElCuit.length).toBe(deteccion.huecos.length - 1)

    const leido = leerPropuestaConfirmada({
      templateId: TIPO,
      moldeAdvisorId: deteccion.documentosUsados[0],
      huecos: sinElCuit,
    })
    if (!leido.ok) throw new Error(leido.error)

    const { reemplazos } = reemplazosDelMolde(leido.propuesta.huecos, leido.propuesta.moldeAdvisorId)
    const puesta = ponerHuecosEnDocx(zips.get(leido.propuesta.moldeAdvisorId)!, reemplazos)

    const bruno = GENTE.find((p) => p.id === BRUNO)!
    const datos = formDataDe(leido.propuesta.huecos, bruno.id)!
    const armado = rellenarDocx(puesta.zip, datos)
    const texto = await textoDeDocx(Buffer.from(armado.generate({ type: "nodebuffer" })))
    const original = await textoDeDocx(buffer(zips.get(bruno.id)!))

    const v = verificarContraElOriginal(original, texto)
    expect(v.coincide).toBe(false)
    // El contrato de Bruno saldría con el CUIT de Ana.
    expect(v.observacion).toContain("27-31456789-4")
  })

  it("un dato que aparece dos veces se reemplaza en LOS DOS lugares", async () => {
    /**
     * El nombre está en la cláusula de arriba y en la aclaración de la firma.
     * Si solo se cambiara el primero, el contrato de Bruno saldría firmado por
     * Ana — y la firma es justo la parte que nadie relee.
     */
    const { puesta, verificaciones } = await recorridoCompleto()
    const nombreDeAna = puesta.puestos.find((x) => x.buscado === "Ana Ruiz")
    expect(nombreDeAna?.veces).toBe(2)
    expect(verificaciones.every((v) => v.coincide)).toBe(true)
  })

  it("los dos campos del mismo nombre se guardan como UNO solo", async () => {
    /**
     * Sin juntarlos, el segundo pide reemplazar un texto que el primero ya se
     * llevó: vuelve como "no se pudo marcar" y traba la plantilla entera por
     * algo que no está mal.
     */
    const { deteccion, leido } = await recorridoCompleto()
    expect(leido.propuesta.huecos.length).toBeLessThan(deteccion.huecos.length)
    expect(leido.advertencias.some((a) => a.includes("dice exactamente lo mismo"))).toBe(true)
  })
})

describe("las partes que mammoth no lee", () => {
  /** El mismo .docx, pero con encabezado. */
  function conEncabezado(parrafos: string[], encabezado: string): PizZip {
    const base = "application/vnd.openxmlformats-officedocument.wordprocessingml"
    const zip = docx(parrafos)
    zip.file(
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="${base}.document.main+xml"/><Override PartName="/word/header1.xml" ContentType="${base}.header+xml"/></Types>`,
    )
    zip
      .folder("word")!
      .file(
        "header1.xml",
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${parrafo(encabezado)}</w:hdr>`,
      )
    return zip
  }

  it("textoPorParte SÍ trae el encabezado; textoDeDocx no", async () => {
    /**
     * Este par es el que explica el agujero entero: la comprobación usaba
     * mammoth, mammoth lee el cuerpo, y todo lo que estuviera en el encabezado
     * pasaba en verde.
     */
    const zip = conEncabezado([parrafo("Cuerpo del contrato.")], "Legajo interno 8892")

    const soloCuerpo = await textoDeDocx(buffer(zip))
    expect(soloCuerpo).not.toContain("8892")

    const todo = textoPorParte(zip)
    expect(Object.keys(todo)).toContain("word/header1.xml")
    expect(todo["word/header1.xml"]).toContain("8892")
  })

  it("un legajo que vive SOLO en el encabezado deja al otro asesor en rojo", () => {
    const deAna = conEncabezado([parrafo("Contrato de Ana Ruiz, CUIT 27-31456789-4.")], "Legajo interno 8892")
    const deBruno = conEncabezado([parrafo("Contrato de Bruno Sosa, CUIT 20-28765432-1.")], "Legajo interno 4471")

    // El molde sale del .docx de Ana; el legajo NO es campo porque la
    // detección nunca lo vio.
    const puesta = ponerHuecosEnDocx(deAna, [
      { buscado: "Ana Ruiz", hueco: "{{NOMBRE}}" },
      { buscado: "27-31456789-4", hueco: "{{CUIT}}" },
    ])
    const armado = rellenarDocx(puesta.zip, { NOMBRE: "Bruno Sosa", CUIT: "20-28765432-1" })

    // El cuerpo solo daría verde. El documento entero, no.
    expect(verificarContraElOriginal(textoPorParte(deBruno)["word/document.xml"], textoPorParte(armado)["word/document.xml"]).coincide).toBe(true)

    const v = verificarDocumentoEntero(textoPorParte(deBruno), textoPorParte(armado))
    expect(v.coincide).toBe(false)
    expect(v.observacion).toContain("encabezado")
    expect(v.observacion).toContain("4471")
  })
})

// ---------------------------------------------------------------------------
// LA REGRESIÓN, POR EL CAMINO DE VERDAD
// ---------------------------------------------------------------------------

/**
 * Estos tests van sobre `.docx` reales y `textoPorParte`, que es por donde pasa
 * producción. El equivalente en `verificacion.test.ts` compara dos strings, y
 * eso fue exactamente lo que dejó pasar la regresión: la sentencia
 * `verificarContraElOriginal("Uno.\n\n\nDos.", "Uno.\nDos.") === true` seguía
 * en verde mientras producción mandaba "|||" en vez de "\n".
 */
describe("el documento entero, armado con .docx de verdad", () => {
  const BASE = "application/vnd.openxmlformats-officedocument.wordprocessingml"

  /** Un `<w:p>` sin un solo `<w:t>`: el Enter de más, tal como lo escribe Word. */
  const parrafoVacio = () => `<w:p w:rsidR="00B71C4D"><w:pPr><w:spacing w:after="0"/></w:pPr></w:p>`

  /** Un cuadro de texto: un `<w:p>` ADENTRO de otro `<w:p>`. */
  const cuadroDeTexto = (adentro: string) =>
    `<w:p w:rsidR="00B71C4D"><w:r><w:pict><v:shape><v:textbox><w:txbxContent>${parrafo(adentro)}</w:txbxContent></v:textbox></v:shape></w:pict></w:r></w:p>`

  /** Un .docx con las partes que se le pidan además del cuerpo. */
  function docxCon(
    parrafos: string[],
    extras: { encabezado?: string; notaAlFinal?: string; comentario?: string; rutaEncabezado?: string } = {},
  ): PizZip {
    const zip = docx(parrafos)
    const word = zip.folder("word")!
    const overrides = [`<Override PartName="/word/document.xml" ContentType="${BASE}.document.main+xml"/>`]

    if (extras.encabezado !== undefined) {
      const ruta = extras.rutaEncabezado ?? "header1.xml"
      overrides.push(`<Override PartName="/word/${ruta}" ContentType="${BASE}.header+xml"/>`)
      word.file(
        ruta,
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${parrafo(extras.encabezado)}</w:hdr>`,
      )
    }
    if (extras.notaAlFinal !== undefined) {
      // Con la boilerplate de Word adelante: los separadores no tienen <w:t>.
      word.file(
        "endnotes.xml",
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:endnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:endnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:endnote><w:endnote w:id="1">${parrafo(extras.notaAlFinal)}</w:endnote></w:endnotes>`,
      )
    }
    if (extras.comentario !== undefined) {
      overrides.push(`<Override PartName="/word/comments.xml" ContentType="${BASE}.comments+xml"/>`)
      word.file(
        "comments.xml",
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:comment w:id="1" w:author="Leonardo">${parrafo(extras.comentario)}</w:comment></w:comments>`,
      )
    }

    zip.file(
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/>${overrides.join("")}</Types>`,
    )
    return zip
  }

  it("EL ENTER DE MÁS no es una diferencia", () => {
    /**
     * El párrafo vacío es lo más común que hay en un Word, y la detección no
     * puede convertirlo en campo: `diffWords` ignora los espacios. Un rojo acá
     * es un rojo que el director no tiene cómo arreglar — y el criterio de
     * `verificacion.ts` lo lista textualmente entre lo que pasa en verde.
     */
    const conEnter = docxCon([parrafo("Contrato de Ana."), parrafoVacio(), parrafo("Firma.")])
    const sinEnter = docxCon([parrafo("Contrato de Ana."), parrafo("Firma.")])

    const r = verificarDocumentoEntero(textoPorParte(conEnter), textoPorParte(sinEnter))
    expect(r.coincide, r.observacion ?? "").toBe(true)
  })

  it("dos Enter de más tampoco", () => {
    const con = docxCon([parrafo("Uno."), parrafoVacio(), parrafoVacio(), parrafo("Dos.")])
    const sin = docxCon([parrafo("Uno."), parrafo("Dos.")])
    expect(verificarDocumentoEntero(textoPorParte(con), textoPorParte(sin)).coincide).toBe(true)
  })

  it("pero dos palabras pegadas contra dos separadas SIGUEN siendo distintas", () => {
    // El borde del criterio: se colapsan tandas de espacios, no se borran.
    const a = docxCon([parrafo("Juan Pérez firma.")])
    const b = docxCon([parrafo("JuanPérez firma.")])
    expect(verificarDocumentoEntero(textoPorParte(a), textoPorParte(b)).coincide).toBe(false)
  })

  it("el separador de párrafos NUNCA llega al mensaje del director", () => {
    const a = docxCon([parrafo("Aclaración de la firma: Ana Ruiz"), parrafo("Fin.")])
    const b = docxCon([parrafo("Aclaración de la firma: Bruno Sosa"), parrafo("Fin.")])
    const r = verificarDocumentoEntero(textoPorParte(a), textoPorParte(b))
    expect(r.coincide).toBe(false)
    expect(r.observacion).not.toContain("|||")
    expect(r.observacion).toContain("Ana Ruiz")
  })

  it("textoPorParte SÍ lee las notas al final, y una distinta queda en rojo", () => {
    /**
     * La sexta vía a `activa`: la plantilla no rellena las notas al final, así
     * que el molde se lleva la del asesor molde al documento de todos.
     */
    const deAna = docxCon([parrafo("Contrato.")], { notaAlFinal: "Legajo interno 8892" })
    const deBruno = docxCon([parrafo("Contrato.")], { notaAlFinal: "Legajo interno 4471" })

    expect(textoPorParte(deAna)["word/endnotes.xml"]).toContain("8892")

    const r = verificarDocumentoEntero(textoPorParte(deBruno), textoPorParte(deAna))
    expect(r.coincide).toBe(false)
    expect(r.observacion).toContain("notas al final")
  })

  it("un .docx sin notas al final de verdad no inventa una diferencia", () => {
    // La boilerplate de separadores de Word no tiene <w:t>: texto vacío.
    const conBoilerplate = docxCon([parrafo("Contrato.")], { notaAlFinal: "" })
    const sinNada = docxCon([parrafo("Contrato.")])
    expect(verificarDocumentoEntero(textoPorParte(conBoilerplate), textoPorParte(sinNada)).coincide).toBe(true)
  })

  it("textoPorParte lee lo que hay dentro de un cuadro de texto", () => {
    /**
     * El cartel decía que los cuadros de texto quedaban afuera de la
     * comprobación y no era cierto: `segmentosDeNivelSuperior` devuelve el
     * `<w:p>` externo entero, con lo anidado adentro.
     */
    const zip = docxCon([parrafo("Cuerpo."), cuadroDeTexto("Legajo 8892")])
    expect(textoPorParte(zip)["word/document.xml"]).toContain("8892")
  })

  it("el mismo membrete guardado como header1 o header2 no es una diferencia", () => {
    const a = docxCon([parrafo("Contrato.")], { encabezado: "VAKDOR PROPIEDADES", rutaEncabezado: "header1.xml" })
    const b = docxCon([parrafo("Contrato.")], { encabezado: "VAKDOR PROPIEDADES", rutaEncabezado: "header2.xml" })
    expect(verificarDocumentoEntero(textoPorParte(a), textoPorParte(b)).coincide).toBe(true)
  })

  it("un comentario de Word distinto queda en rojo, y dice que se borra en el Word", () => {
    const a = docxCon([parrafo("Contrato.")], { comentario: "Hablar con Ana" })
    const b = docxCon([parrafo("Contrato.")], { comentario: "Hablar con Bruno" })
    const r = verificarDocumentoEntero(textoPorParte(a), textoPorParte(b))
    expect(r.coincide).toBe(false)
    expect(r.observacion).toContain("borrá el comentario")
  })
})
