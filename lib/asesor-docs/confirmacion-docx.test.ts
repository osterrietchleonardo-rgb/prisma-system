import { describe, it, expect } from "vitest"
import PizZip from "pizzip"

import { ponerHuecosEnDocx, rellenarDocx, textoDeDocx, huecosDe } from "@/lib/plantillas/docx"
import { detectarHuecos } from "@/lib/plantillas/deteccion"
import { formDataDe, leerPropuestaConfirmada, reemplazosDelMolde } from "./confirmacion"
import { verificarContraElOriginal } from "./verificacion"

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
      const texto = await textoDeDocx(Buffer.from(armado.generate({ type: "nodebuffer" })))
      const original = await textoDeDocx(buffer(zips.get(p.id)!))
      const v = verificarContraElOriginal(original, texto)
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
