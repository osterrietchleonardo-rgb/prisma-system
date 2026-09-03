import { describe, it, expect } from "vitest";
import { buildChecklist, type SubScores } from "./checklist";

// ACM Fase 2 (3-sep-2026): el checklist gana cocheras (10), piso (6), orientación (5) y
// disposición (5). Los pesos de acá DEBEN coincidir con los de acm_match_roomix — si se
// tocan allá, este test es el que grita.

const SUB: SubScores = {
  sc_zona: 100,
  sc_superficie: 90,
  sc_ambientes: 100,
  sc_dormitorios: 100,
  sc_banos: 100,
  sc_antiguedad: 80,
  sc_amenities: 100,
  sc_semantica: 75,
  sc_cocheras: 100,
  sc_piso: 50,
  sc_orientacion: null,
  sc_disposicion: 0,
};

const SUJETO = {
  tipo: "Departamento", zona: "Belgrano", m2: 70, ambientes: 3, dormitorios: 2, banos: 1,
  antiguedad: 5, amenities: ["Pileta"], cocheras: true, piso: 3, orientacion: "N", disposicion: "frente",
};
const COMP = {
  tipo: "Departamento", zona: "Belgrano", m2: 68, ambientes: 3, dormitorios: 2, banos: 1,
  antiguedad: 9, amenities: ["Pileta"], cocheras: 1, piso: 5, orientacion: null, disposicion: "contrafrente",
};

describe("buildChecklist con las dimensiones de la fase 2", () => {
  const items = buildChecklist({ sub: SUB, operacion: "venta", pesoSemantica: 10, sujeto: SUJETO, comp: COMP });
  const por = (d: string) => items.find((i) => i.dimension === d)!;

  it("las 4 filas nuevas existen, con sus pesos espejados del SQL", () => {
    expect(por("cocheras").peso).toBe(10);
    expect(por("piso").peso).toBe(6);
    expect(por("orientacion").peso).toBe(0); // sin dato del comparable → el peso no aplica
    expect(por("disposicion").peso).toBe(5);
  });

  it("los estados salen del score: match / parcial / na / distinto", () => {
    expect(por("cocheras").estado).toBe("match");     // 100
    expect(por("piso").estado).toBe("parcial");       // 50 (a ±2 pisos)
    expect(por("orientacion").estado).toBe("na");     // null
    expect(por("disposicion").estado).toBe("distinto"); // 0 (frente vs contrafrente)
  });

  it("los valores del sujeto y del comparable se leen como texto humano", () => {
    expect(por("cocheras").sujeto_val).toBe("Sí");
    // sc_cocheras=100 (rescatado o real) → el comparable muestra "Sí", no el número crudo:
    // el asesor lee la conclusión de la comparación, coherente con el 100%.
    expect(por("cocheras").comp_val).toBe("Sí");
    expect(por("piso").sujeto_val).toBe("Piso 3");
    expect(por("piso").comp_val).toBe("Piso 5");
    expect(por("orientacion").comp_val).toBe("—");
    expect(por("disposicion").comp_val).toBe("contrafrente");
  });

  it("las filas viejas siguen intactas (regresión)", () => {
    expect(por("superficie").score).toBe(90);
    expect(por("antiguedad").peso).toBe(14);
    expect(items.map((i) => i.dimension)).toContain("semantica");
  });

  it("una búsqueda vieja guardada (sin sub-scores nuevos) no rompe: filas en na", () => {
    const viejos = buildChecklist({
      sub: { ...SUB, sc_cocheras: undefined, sc_piso: undefined, sc_orientacion: undefined, sc_disposicion: undefined } as any,
      operacion: "venta", pesoSemantica: 10,
      sujeto: { ...SUJETO, cocheras: undefined, piso: undefined, orientacion: undefined, disposicion: undefined } as any,
      comp: { ...COMP, cocheras: undefined, piso: undefined, orientacion: undefined, disposicion: undefined } as any,
    });
    const c = viejos.find((i) => i.dimension === "cocheras")!;
    expect(c.estado).toBe("na");
    expect(c.peso).toBe(0);
  });
});
