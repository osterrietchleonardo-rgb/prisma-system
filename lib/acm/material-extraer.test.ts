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
  it("es 50 MB", () => {
    expect(MAX_ARCHIVO).toBe(50 * 1024 * 1024);
  });

  it("entra el carpetón institucional más pesado de Central, que pesa 25,45 MB", () => {
    // Con el tope viejo de 25 MB este archivo quedaba afuera por 0,45 MB. Medido sobre el
    // archivo real: "Our Company 2025 - Central.pdf".
    expect(MAX_ARCHIVO).toBeGreaterThan(26_685_910);
  });
});
