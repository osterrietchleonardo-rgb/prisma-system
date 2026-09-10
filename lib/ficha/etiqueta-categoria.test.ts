import { describe, it, expect } from "vitest";
import { etiquetaDeCategoria } from "./etiqueta-categoria";

describe("etiquetaDeCategoria", () => {
  it("el director es Director/a, tenga o no clasificación", () => {
    expect(etiquetaDeCategoria("client_director", "director")).toBe("Director/a");
    expect(etiquetaDeCategoria(null, "director")).toBe("Director/a");
  });
  it("la clasificación del asesor sale legible", () => {
    expect(etiquetaDeCategoria("client_director", "asesor")).toBe("Client Director");
    expect(etiquetaDeCategoria("client_support", "asesor")).toBe("Client Support");
  });
  it("sin clasificación, Asesor/a", () => {
    expect(etiquetaDeCategoria(null, "asesor")).toBe("Asesor/a");
    expect(etiquetaDeCategoria("otra_cosa", "asesor")).toBe("Asesor/a");
  });
});
