import { describe, it, expect } from "vitest";
import { sujetoToEmbeddingText } from "./subject";
import type { Sujeto } from "@/lib/tasacion/types";

const base = {
  tipo_propiedad: "departamento",
  barrio: "Belgrano",
  direccion: "Cuba 2500",
  dormitorios: 2,
  banos: 1,
  m2_cubiertos: 60,
  m2_semicubiertos: 0,
} as unknown as Partial<Sujeto>;

describe("sujetoToEmbeddingText", () => {
  it("sin descripción se comporta igual que antes", () => {
    const t = sujetoToEmbeddingText(base);
    expect(t).toContain("Belgrano");
    expect(t).toContain("3 ambientes");
    expect(t).not.toContain("undefined");
  });

  it("suma la descripción de la IA al final", () => {
    const t = sujetoToEmbeddingText({ ...base, descripcion_ia: "Muy luminoso, cocina original." });
    expect(t).toContain("Muy luminoso, cocina original.");
    expect(t.indexOf("Muy luminoso")).toBeGreaterThan(t.indexOf("Belgrano"));
  });

  it("ignora una descripción vacía o de puros espacios", () => {
    expect(sujetoToEmbeddingText({ ...base, descripcion_ia: "   " })).toBe(sujetoToEmbeddingText(base));
  });
});
