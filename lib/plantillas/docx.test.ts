import { describe, it, expect } from "vitest";
import PizZip from "pizzip";
import { ponerHueco, ponerHuecosEnDocx, rellenarDocx, huecosDe } from "./docx";

const CT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

/** Un <w:r>: un pedazo de texto con su formato. */
const run = (texto: string, formato = "") =>
  `<w:r>${formato}<w:t xml:space="preserve">${texto}</w:t></w:r>`;
const NEGRITA = `<w:rPr><w:b/></w:rPr>`;

function armarDocx(bodyXml: string): PizZip {
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}</w:body></w:document>`;
  const zip = new PizZip();
  zip.file("[Content_Types].xml", CT);
  zip.folder("_rels")!.file(".rels", RELS);
  zip.folder("word")!.file("document.xml", doc);
  return zip;
}

const xmlDe = (zip: PizZip) => zip.file("word/document.xml")!.asText();
const textoDe = (zip: PizZip) =>
  [...xmlDe(zip).matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join("");

// El caso que importa: Word partió "Juan Pérez" en tres pedazos, y el párrafo
// tiene además un título en negrita que NO se puede perder.
const PARRAFO_PARTIDO =
  `<w:p>` +
  run("CLÁUSULA 1. ", NEGRITA) +
  run("El asesor ") +
  run("Juan ") +
  run("Pé") +
  run("rez") +
  run(" con CUIT ") +
  run("20-12345678-9") +
  run(" acuerda.") +
  `</w:p>`;

const TEXTO_ORIGINAL = "CLÁUSULA 1. El asesor Juan Pérez con CUIT 20-12345678-9 acuerda.";

describe("ponerHueco — el texto que Word partió", () => {
  it("encuentra y reemplaza un texto partido en varios pedazos", () => {
    const r = ponerHueco(PARRAFO_PARTIDO, "Juan Pérez", "{{NOMBRE}}");
    expect(r.ok).toBe(true);
    expect(r.xml).toContain("{{NOMBRE}}");
  });

  it("CONSERVA el formato del resto del párrafo", () => {
    // Si esto falla, el documento del asesor pierde negritas, títulos y tablas.
    const r = ponerHueco(PARRAFO_PARTIDO, "Juan Pérez", "{{NOMBRE}}");
    expect(r.xml).toContain("<w:b/>");
  });

  it("también reemplaza un texto que quedó entero", () => {
    const r = ponerHueco(PARRAFO_PARTIDO, "20-12345678-9", "{{CUIT}}");
    expect(r.ok).toBe(true);
    expect(r.xml).toContain("{{CUIT}}");
  });

  it("avisa cuando el texto no está, en vez de romper", () => {
    const r = ponerHueco(PARRAFO_PARTIDO, "Pedro Gómez", "{{NOMBRE}}");
    expect(r.ok).toBe(false);
    expect(r.xml).toBe(PARRAFO_PARTIDO);
  });
});

describe("el viaje de ida y vuelta", () => {
  it("rellenar con los MISMOS datos devuelve el documento original", () => {
    // Es la red de seguridad del spec §7.3: si esto no da idéntico, la
    // plantilla no se publica.
    const zip = armarDocx(PARRAFO_PARTIDO);
    const puesto = ponerHuecosEnDocx(zip, [
      { buscado: "Juan Pérez", hueco: "{{NOMBRE}}" },
      { buscado: "20-12345678-9", hueco: "{{CUIT}}" },
    ]);
    expect(puesto.faltantes).toEqual([]);
    const salida = rellenarDocx(puesto.zip, { NOMBRE: "Juan Pérez", CUIT: "20-12345678-9" });
    expect(textoDe(salida)).toBe(TEXTO_ORIGINAL);
  });

  it("rellenar con los datos de otro asesor da su documento, con el formato intacto", () => {
    const zip = armarDocx(PARRAFO_PARTIDO);
    const puesto = ponerHuecosEnDocx(zip, [
      { buscado: "Juan Pérez", hueco: "{{NOMBRE}}" },
      { buscado: "20-12345678-9", hueco: "{{CUIT}}" },
    ]);
    const salida = rellenarDocx(puesto.zip, { NOMBRE: "María González", CUIT: "27-98765432-1" });
    expect(textoDe(salida)).toBe(
      "CLÁUSULA 1. El asesor María González con CUIT 27-98765432-1 acuerda."
    );
    expect(xmlDe(salida)).toContain("<w:b/>");
  });
});

describe("un dato faltante NUNCA escribe 'undefined' en el documento", () => {
  it("deja el hueco vacío en vez de la palabra undefined", () => {
    // Medido con una sonda contra la librería real: sin configurar nada,
    // docxtemplater escribe literalmente "undefined" en el documento.
    // Un contrato que dice "tu CUIT es undefined" es peor que uno que no sale.
    const zip = armarDocx(`<w:p>${run("Hola {{NOMBRE}}, tu CUIT es {{CUIT}}.")}</w:p>`);
    const salida = rellenarDocx(zip, { NOMBRE: "Juan" });
    const texto = textoDe(salida);
    expect(texto).not.toContain("undefined");
    expect(texto).toBe("Hola Juan, tu CUIT es .");
  });
});

describe("huecosDe", () => {
  it("lista los huecos que tiene la plantilla", () => {
    const zip = armarDocx(`<w:p>${run("Hola {{NOMBRE}}, CUIT {{CUIT}}, zona {{ZONA}}.")}</w:p>`);
    expect(huecosDe(zip).sort()).toEqual(["CUIT", "NOMBRE", "ZONA"]);
  });

  it("encuentra un hueco aunque Word lo haya partido", () => {
    // Si el director escribe {{NOMBRE}} en Word, Word puede partirlo al guardar.
    const zip = armarDocx(`<w:p>${run("Hola {{NOM") + run("BRE}}, firmá.")}</w:p>`);
    expect(huecosDe(zip)).toEqual(["NOMBRE"]);
  });

  it("no repite un hueco que aparece dos veces", () => {
    const zip = armarDocx(`<w:p>${run("{{NOMBRE}} ... firma: {{NOMBRE}}")}</w:p>`);
    expect(huecosDe(zip)).toEqual(["NOMBRE"]);
  });
});

describe("ponerHuecosEnDocx", () => {
  it("informa cuáles pudo poner y cuáles no", () => {
    const zip = armarDocx(PARRAFO_PARTIDO);
    const r = ponerHuecosEnDocx(zip, [
      { buscado: "Juan Pérez", hueco: "{{NOMBRE}}" },
      { buscado: "NO ESTÁ EN EL DOCUMENTO", hueco: "{{FANTASMA}}" },
    ]);
    expect(r.puestos).toEqual(["{{NOMBRE}}"]);
    expect(r.faltantes).toEqual(["{{FANTASMA}}"]);
  });
});
