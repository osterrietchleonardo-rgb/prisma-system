import { describe, expect, it } from "vitest";
import { antiguedadDesdeChecklist, antiguedadSujeto, fmtAntiguedad } from "./antiguedad";
import type { ChecklistItem } from "@/lib/tasacion/types";

const item = (comp_val: string): ChecklistItem[] => [
  { dimension: "antiguedad", label: "Antigüedad", sujeto_val: "—", comp_val, estado: "na", peso: 14, score: null },
];

describe("fmtAntiguedad", () => {
  it("muestra años, a estrenar y en pozo", () => {
    expect(fmtAntiguedad(12)).toBe("12 años");
    expect(fmtAntiguedad(1)).toBe("1 año");
    expect(fmtAntiguedad(0)).toBe("A estrenar");
    expect(fmtAntiguedad(-1)).toBe("En pozo");
  });

  it("sin dato no inventa nada", () => {
    expect(fmtAntiguedad(null)).toBe("—");
    expect(fmtAntiguedad(undefined)).toBe("—");
  });
});

describe("antiguedadDesdeChecklist", () => {
  it("recupera el dato de una búsqueda guardada antes de sep-2026", () => {
    expect(antiguedadDesdeChecklist(item("12 años"))).toBe(12);
    expect(antiguedadDesdeChecklist(item("1 años"))).toBe(1);
    expect(antiguedadDesdeChecklist(item("A estrenar"))).toBe(0);
    expect(antiguedadDesdeChecklist(item("En pozo"))).toBe(-1);
  });

  it("sin dato, o sin checklist, devuelve null", () => {
    expect(antiguedadDesdeChecklist(item("—"))).toBeNull();
    expect(antiguedadDesdeChecklist([])).toBeNull();
    expect(antiguedadDesdeChecklist(undefined)).toBeNull();
  });
});

describe("antiguedadSujeto", () => {
  it("el estado de obra le gana a los años", () => {
    expect(antiguedadSujeto({ antiguedad_anios: 30, en_pozo: true })).toBe(-1);
    expect(antiguedadSujeto({ antiguedad_anios: 30, a_estrenar: true })).toBe(0);
  });

  it("el 0 del formulario sin tildar 'A estrenar' es que no lo cargó", () => {
    expect(antiguedadSujeto({ antiguedad_anios: 0 })).toBeNull();
    expect(antiguedadSujeto({ antiguedad_anios: 25 })).toBe(25);
  });
});
