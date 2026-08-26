import { describe, it, expect } from "vitest";
import {
  validarArchivo,
  rutaDeArchivo,
  nombreVisible,
  MAX_BYTES,
} from "./reglas";

const UN_MB = 1024 * 1024;

describe("validarArchivo — sección plantillas (solo .docx)", () => {
  it("acepta un .docx", () => {
    expect(validarArchivo("Contrato.docx", UN_MB, "plantilla")).toEqual({ ok: true, extension: "docx" });
  });

  it("acepta sin importar mayúsculas en la extensión", () => {
    expect(validarArchivo("Contrato.DOCX", UN_MB, "plantilla")).toEqual({ ok: true, extension: "docx" });
  });

  it("rechaza un .doc viejo, y explica por qué", () => {
    const r = validarArchivo("Contrato.doc", UN_MB, "plantilla");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      // El mensaje tiene que decirle qué hacer, no solo que no se puede.
      expect(r.error).toContain(".doc");
      expect(r.error.toLowerCase()).toContain("guardar como");
    }
  });

  it("rechaza un PDF en la sección de plantillas", () => {
    const r = validarArchivo("Contrato.pdf", UN_MB, "plantilla");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.toLowerCase()).toContain("word");
  });

  it("rechaza un archivo sin extensión", () => {
    expect(validarArchivo("Contrato", UN_MB, "plantilla").ok).toBe(false);
  });
});

describe("validarArchivo — sección información (.docx o .pdf)", () => {
  it("acepta un .docx", () => {
    expect(validarArchivo("Manual.docx", UN_MB, "info")).toEqual({ ok: true, extension: "docx" });
  });

  it("acepta un .pdf", () => {
    expect(validarArchivo("Manual.pdf", UN_MB, "info")).toEqual({ ok: true, extension: "pdf" });
  });

  it("acepta un .doc viejo, porque acá no se rellena nada", () => {
    expect(validarArchivo("Manual.doc", UN_MB, "info")).toEqual({ ok: true, extension: "doc" });
  });

  it("rechaza una imagen", () => {
    const r = validarArchivo("foto.jpg", UN_MB, "info");
    expect(r.ok).toBe(false);
  });
});

describe("validarArchivo — tamaño", () => {
  it("rechaza un archivo que pasa el tope, en las dos secciones", () => {
    const grande = MAX_BYTES + 1;
    for (const seccion of ["plantilla", "info"] as const) {
      const r = validarArchivo("Contrato.docx", grande, seccion);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.toLowerCase()).toContain("pesa");
    }
  });

  it("acepta un archivo justo en el tope", () => {
    expect(validarArchivo("Contrato.docx", MAX_BYTES, "plantilla").ok).toBe(true);
  });

  it("rechaza un archivo vacío", () => {
    const r = validarArchivo("Contrato.docx", 0, "plantilla");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.toLowerCase()).toContain("vacío");
  });
});

describe("rutaDeArchivo", () => {
  it("separa por agencia, asesor y sección", () => {
    expect(rutaDeArchivo("AG", "AS", "plantilla", "ID1", "docx")).toBe("asesores/AG/AS/plantillas/ID1.docx");
    expect(rutaDeArchivo("AG", "AS", "info", "ID2", "pdf")).toBe("asesores/AG/AS/info/ID2.pdf");
  });

  it("no usa el nombre del archivo original en la ruta", () => {
    // El nombre lo pone el usuario: puede traer acentos, espacios, barras o
    // repetirse. La ruta se arma con el id, que es único y siempre seguro.
    const ruta = rutaDeArchivo("AG", "AS", "info", "ID3", "pdf");
    expect(ruta).not.toContain(" ");
    expect(ruta.split("/").length).toBe(5);
  });
});

describe("nombreVisible", () => {
  it("saca la extensión", () => {
    expect(nombreVisible("Contrato de Asesor.docx")).toBe("Contrato de Asesor");
  });

  it("deja el nombre tal cual si no tiene extensión", () => {
    expect(nombreVisible("Contrato")).toBe("Contrato");
  });

  it("solo saca la última extensión", () => {
    expect(nombreVisible("acuerdo.v2.docx")).toBe("acuerdo.v2");
  });

  it("recorta espacios", () => {
    expect(nombreVisible("  Manual.pdf  ")).toBe("Manual");
  });
});
