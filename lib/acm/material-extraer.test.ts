import { describe, it, expect } from "vitest";
import { extensionDe, MAX_ARCHIVO } from "./material-extraer";

describe("extensionDe", () => {
  it("reconoce pdf y docx sin importar mayúsculas", () => {
    expect(extensionDe("Our Company 2025.PDF")).toBe("pdf");
    expect(extensionDe("bienvenida.docx")).toBe("docx");
  });

  it("rechaza lo que no sabe leer", () => {
    expect(extensionDe("presentacion.pptx")).toBeNull();
    expect(extensionDe("foto.jpg")).toBeNull();
    expect(extensionDe("sin-extension")).toBeNull();
  });

  it("no se confunde con puntos en el nombre", () => {
    expect(extensionDe("Central v2.1 - final.pdf")).toBe("pdf");
  });
});

describe("MAX_ARCHIVO", () => {
  it("es 25 MB, el mismo tope que Contratos", () => {
    expect(MAX_ARCHIVO).toBe(25 * 1024 * 1024);
  });
});
