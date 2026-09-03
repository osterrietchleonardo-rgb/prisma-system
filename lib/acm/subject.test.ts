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

// El corte a mercado_avisos (2-sep-2026): los comparables de la red dejaron la taxonomía
// schema.org de roomix (Apartment/House/Accommodation) y pasaron a los tipos reales de
// ZonaProp en castellano (Departamento, Casa, PH, Local comercial, Terrenos, Oficina
// comercial…). Estos tests simulan el `r.tipo ilike patron` de acm_match_roomix: si los
// patrones no matchean el vocabulario real, el ACM devuelve CERO comparables de la red.
import { roomixTypePatterns } from "./subject";

const ilikeMatchea = (valor: string, patrones: string[]) =>
  patrones.some((p) => new RegExp("^" + p.replaceAll("%", ".*") + "$", "i").test(valor));

describe("roomixTypePatterns contra los tipos reales de mercado_avisos", () => {
  it("departamento matchea 'Departamento'", () => {
    expect(ilikeMatchea("Departamento", roomixTypePatterns("departamento"))).toBe(true);
  });
  it("casa matchea 'Casa'", () => {
    expect(ilikeMatchea("Casa", roomixTypePatterns("casa"))).toBe(true);
  });
  it("ph matchea 'PH'", () => {
    expect(ilikeMatchea("PH", roomixTypePatterns("ph"))).toBe(true);
  });
  it("terreno matchea 'Terrenos'", () => {
    expect(ilikeMatchea("Terrenos", roomixTypePatterns("terreno"))).toBe(true);
  });
  it("local matchea 'Local comercial' y 'Fondo de comercio'", () => {
    expect(ilikeMatchea("Local comercial", roomixTypePatterns("local"))).toBe(true);
    expect(ilikeMatchea("Fondo de comercio", roomixTypePatterns("local"))).toBe(true);
  });
  it("oficina matchea 'Oficina comercial'", () => {
    expect(ilikeMatchea("Oficina comercial", roomixTypePatterns("oficina"))).toBe(true);
  });
});

// ACM Fase 2 (3-sep-2026): las dimensiones nuevas viajan como parámetros propios de la
// función SQL. Los mappers traducen del vocabulario del form al de mercado_avisos
// (verificado contra producción: orientacion N/NE/E/SE/S/SO/O/NO · disposicion
// frente/contrafrente/lateral/interno).
import { sujetoCochera, orientacionParam, disposicionParam, COCHERA_PATRON, amenityTokens } from "./subject";

describe("fase 2: mappers nuevos del sujeto", () => {
  it("cochera: cualquiera de los dos switches la pide", () => {
    expect(sujetoCochera({ amenidades: { cochera_cubierta: true } as any })).toBe(true);
    expect(sujetoCochera({ amenidades: { cochera_descubierta: true } as any })).toBe(true);
    expect(sujetoCochera({ amenidades: {} as any })).toBe(false);
    expect(sujetoCochera({})).toBe(false);
  });

  it("orientación viaja en el vocabulario de la base (N/NE/…)", () => {
    expect(orientacionParam({ orientacion: "norte" } as any)).toBe("N");
    expect(orientacionParam({ orientacion: "oeste" } as any)).toBe("O");
    expect(orientacionParam({ orientacion: "so" } as any)).toBe("SO");
    expect(orientacionParam({ orientacion: "nd" } as any)).toBeNull();
    expect(orientacionParam({})).toBeNull();
  });

  it("vista → disposición solo cuando la base la distingue", () => {
    expect(disposicionParam({ vista: "frente" } as any)).toBe("frente");
    expect(disposicionParam({ vista: "contrafrente" } as any)).toBe("contrafrente");
    expect(disposicionParam({ vista: "panoramica" } as any)).toBeNull();
    expect(disposicionParam({ vista: "nd" } as any)).toBeNull();
    expect(disposicionParam({})).toBeNull();
  });

  it("la cochera ya no genera patrón de amenities (ahora puntúa sola, peso 10)", () => {
    const tokens = amenityTokens({ cochera_cubierta: true, pileta: true } as any);
    expect(tokens.some((t) => /cocher/.test(t))).toBe(false);
    expect(tokens.some((t) => /pileta/.test(t))).toBe(true);
  });

  it("el patrón de defensa por texto existe y pesca las variantes", () => {
    for (const palabra of ["cochera", "garage", "garaje", "estacionamiento"]) {
      expect(new RegExp(COCHERA_PATRON, "i").test(palabra)).toBe(true);
    }
  });
});
