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
   * documento — no falla, no deja el hueco vacío. Un contrato que dice
   * "tu CUIT es undefined" es peor que uno que no sale.
   */
  nullGetter: () => "",
}

/** El texto plano del documento, para comparar y para detectar. */
export async function textoDeDocx(buffer: Buffer): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer })
  return value
}

const RE_RUN = /<w:r>[\s\S]*?<\/w:r>/g
const RE_TEXTO = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g
const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/**
 * Reemplaza `buscado` por `hueco` dentro de UN párrafo.
 *
 * Word parte el texto en pedazos (<w:r>) cada vez que cambia el formato, así
 * que "Juan Pérez" puede estar guardado como "Juan ", "Pé", "rez". Por eso no
 * sirve buscar sobre el XML.
 *
 * Se toca SOLO los pedazos que el texto buscado atraviesa. Aplanar el párrafo
 * entero también encontraría el texto, pero borraría negritas y títulos del
 * resto del párrafo — probado con una sonda.
 */
export function ponerHueco(
  xmlParrafo: string,
  buscado: string,
  hueco: string
): { xml: string; ok: boolean } {
  const runs = [...xmlParrafo.matchAll(RE_RUN)].map((m) => ({
    inicio: m.index!,
    fin: m.index! + m[0].length,
    xml: m[0],
    texto: [...m[0].matchAll(RE_TEXTO)].map((t) => t[1]).join(""),
  }))
  if (!runs.length) return { xml: xmlParrafo, ok: false }

  const completo = runs.map((r) => r.texto).join("")
  const at = completo.indexOf(buscado)
  if (at === -1) return { xml: xmlParrafo, ok: false }

  const hasta = at + buscado.length
  let acum = 0
  let primero = -1
  let ultimo = -1
  let inicioDelPrimero = 0
  for (let i = 0; i < runs.length; i++) {
    const desde = acum
    const finRun = acum + runs[i].texto.length
    if (primero === -1 && finRun > at) {
      primero = i
      inicioDelPrimero = desde
    }
    if (desde < hasta) ultimo = i
    acum = finRun
  }

  const finDelUltimo = runs.slice(0, ultimo + 1).reduce((s, r) => s + r.texto.length, 0)
  const prefijo = completo.slice(inicioDelPrimero, at)
  const sufijo = completo.slice(hasta, finDelUltimo)

  const formato = (runs[primero].xml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [""])[0]
  const run = (t: string) => `<w:r>${formato}<w:t xml:space="preserve">${escapar(t)}</w:t></w:r>`
  const reemplazo =
    (prefijo ? run(prefijo) : "") +
    `<w:r>${formato}<w:t xml:space="preserve">${hueco}</w:t></w:r>` +
    (sufijo ? run(sufijo) : "")

  return {
    xml: xmlParrafo.slice(0, runs[primero].inicio) + reemplazo + xmlParrafo.slice(runs[ultimo].fin),
    ok: true,
  }
}

/** Aplica varios reemplazos sobre todo el documento, párrafo por párrafo. */
export function ponerHuecosEnDocx(
  zip: PizZip,
  reemplazos: Array<{ buscado: string; hueco: string }>
): { zip: PizZip; puestos: string[]; faltantes: string[] } {
  let xml = zip.file("word/document.xml")!.asText()
  const puestos: string[] = []
  const faltantes: string[] = []

  // Los más largos primero: si un valor contiene a otro, hay que reemplazar
  // el grande antes, o el chico lo parte por la mitad.
  const orden = [...reemplazos].sort((a, b) => b.buscado.length - a.buscado.length)

  for (const { buscado, hueco } of orden) {
    let encontrado = false
    xml = xml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g, (parrafo) => {
      if (encontrado) return parrafo
      const r = ponerHueco(parrafo, buscado, hueco)
      if (r.ok) encontrado = true
      return r.xml
    })
    ;(encontrado ? puestos : faltantes).push(hueco)
  }

  const salida = new PizZip(zip.generate({ type: "nodebuffer" }))
  salida.file("word/document.xml", xml)
  return { zip: salida, puestos, faltantes }
}

/** Rellena la plantilla con los datos de un asesor. */
export function rellenarDocx(zip: PizZip, datos: Record<string, string>): PizZip {
  const copia = new PizZip(zip.generate({ type: "nodebuffer" }))
  const d = new Docxtemplater(copia, OPCIONES)
  d.render(datos)
  return d.getZip()
}

/** Los nombres de los huecos que tiene la plantilla, sin repetir. */
export function huecosDe(zip: PizZip): string[] {
  const xml = zip.file("word/document.xml")!.asText()
  // Se saca el marcado para que un hueco partido por Word se lea entero.
  const texto = [...xml.matchAll(RE_TEXTO)].map((m) => m[1]).join("")
  const nombres = [...texto.matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)].map((m) => m[1])
  return [...new Set(nombres)]
}
