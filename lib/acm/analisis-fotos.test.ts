import { describe, it, expect } from "vitest";
import {
  extraerAnalisisFotos,
  scoreComparacionFotos,
  ajustePorScore,
  aplicarAjuste,
  contextoParaPrompt,
} from "./analisis-fotos";

describe("extraerAnalisisFotos", () => {
  it("parsea un JSON completo con clasificación", () => {
    const crudo = JSON.stringify({
      analisis: "razonamiento interno",
      descripcion: "Departamento luminoso.",
      fotos_muestran_interior: true,
      motivo_no_evaluable: null,
      estado_conservacion: "bueno",
      calidad_terminaciones: "estandar",
      luminosidad: "alta",
    });
    const r = extraerAnalisisFotos(crudo);
    expect(r.descripcion).toBe("Departamento luminoso.");
    expect(r.atributos).toEqual({
      fotos_muestran_interior: true,
      motivo_no_evaluable: null,
      estado_conservacion: "bueno",
      calidad_terminaciones: "estandar",
      luminosidad: "alta",
    });
  });

  it("saca el cerco de markdown si el modelo lo agrega igual", () => {
    const j = JSON.stringify({
      analisis: "x",
      descripcion: "Texto real.",
      fotos_muestran_interior: true,
      estado_conservacion: "bueno",
      calidad_terminaciones: "estandar",
      luminosidad: "alta",
    });
    const r = extraerAnalisisFotos("```json\n" + j + "\n```");
    expect(r.descripcion).toBe("Texto real.");
    expect(r.atributos?.estado_conservacion).toBe("bueno");
  });

  it("JSON roto: descripcion vacía y atributos null", () => {
    const r = extraerAnalisisFotos("esto no es JSON");
    expect(r.descripcion).toBe("");
    expect(r.atributos).toBeNull();
  });

  it("vacío: descripcion vacía y atributos null", () => {
    const r = extraerAnalisisFotos("");
    expect(r.descripcion).toBe("");
    expect(r.atributos).toBeNull();
  });

  it("sin el bloque de clasificación (fotos_muestran_interior ausente): atributos null, descripcion se conserva", () => {
    const r = extraerAnalisisFotos(JSON.stringify({ analisis: "x", descripcion: "Una descripción." }));
    expect(r.descripcion).toBe("Una descripción.");
    expect(r.atributos).toBeNull();
  });

  it("gotcha calibracion-final.md: motivo_no_evaluable se fuerza a null cuando fotos_muestran_interior=true", () => {
    const r = extraerAnalisisFotos(
      JSON.stringify({
        analisis: "x",
        descripcion: "Texto.",
        fotos_muestran_interior: true,
        motivo_no_evaluable: "motivo_no_evaluable", // el bug real observado en la ronda 3
        estado_conservacion: "bueno",
        calidad_terminaciones: "estandar",
        luminosidad: "alta",
      })
    );
    expect(r.atributos?.motivo_no_evaluable).toBeNull();
  });

  it("fotos_muestran_interior=false: conserva el motivo real", () => {
    const r = extraerAnalisisFotos(
      JSON.stringify({
        analisis: "x",
        descripcion: "",
        fotos_muestran_interior: false,
        motivo_no_evaluable: "Solo renders de pozo.",
        estado_conservacion: null,
        calidad_terminaciones: null,
        luminosidad: null,
      })
    );
    expect(r.atributos?.fotos_muestran_interior).toBe(false);
    expect(r.atributos?.motivo_no_evaluable).toBe("Solo renders de pozo.");
    // Los 3 atributos ordinales caen a "sin_evidencia" si no vienen en el enum esperado (acá
    // vienen null, que no es un valor válido del enum).
    expect(r.atributos?.estado_conservacion).toBe("sin_evidencia");
  });

  it("valor de enum inválido cae a sin_evidencia en vez de romper", () => {
    const r = extraerAnalisisFotos(
      JSON.stringify({
        analisis: "x",
        descripcion: "Texto.",
        fotos_muestran_interior: true,
        estado_conservacion: "impecable", // no es un valor del enum
        calidad_terminaciones: "estandar",
        luminosidad: "alta",
      })
    );
    expect(r.atributos?.estado_conservacion).toBe("sin_evidencia");
  });
});

describe("scoreComparacionFotos", () => {
  it("mismo estado y misma luminosidad → score 100", () => {
    const r = scoreComparacionFotos(
      { estado_conservacion: "excelente", luminosidad: "alta" },
      { estado_conservacion: "excelente", luminosidad: "alta" }
    );
    expect(r?.score).toBe(100);
    expect(r?.soloEstado).toBe(false);
  });

  it("extremos opuestos (excelente/alta vs a_reciclar/baja) → score 0", () => {
    const r = scoreComparacionFotos(
      { estado_conservacion: "excelente", luminosidad: "alta" },
      { estado_conservacion: "a_reciclar", luminosidad: "baja" }
    );
    expect(r?.score).toBe(0);
  });

  it("estado_conservacion sin_evidencia en el sujeto → null (no se inventa un ajuste)", () => {
    const r = scoreComparacionFotos(
      { estado_conservacion: "sin_evidencia", luminosidad: "alta" },
      { estado_conservacion: "bueno", luminosidad: "alta" }
    );
    expect(r).toBeNull();
  });

  it("estado_conservacion sin_evidencia en el comparable → null", () => {
    const r = scoreComparacionFotos(
      { estado_conservacion: "bueno", luminosidad: "alta" },
      { estado_conservacion: "sin_evidencia", luminosidad: "alta" }
    );
    expect(r).toBeNull();
  });

  it("luminosidad sin_evidencia de un lado → usa solo estado_conservacion (peso 100%)", () => {
    const r = scoreComparacionFotos(
      { estado_conservacion: "excelente", luminosidad: "sin_evidencia" },
      { estado_conservacion: "bueno", luminosidad: "alta" }
    );
    // excelente vs bueno: distancia 1/3 → 67
    expect(r?.score).toBe(67);
    expect(r?.soloEstado).toBe(true);
  });

  it("el caso a224fba0 de calibracion-final.md: estado un escalón peor pesa más que luminosidad igual", () => {
    // Sujeto excelente/alta vs comparable bueno/alta (misma luminosidad, un escalón menos de estado).
    const r = scoreComparacionFotos(
      { estado_conservacion: "excelente", luminosidad: "alta" },
      { estado_conservacion: "bueno", luminosidad: "alta" }
    );
    // estado: 67 (70%) + luminosidad: 100 (30%) = 46.9 + 30 = 76.9 → 77
    expect(r?.score).toBe(77);
  });
});

describe("ajustePorScore", () => {
  it("score 100 → +5 (tope máximo)", () => {
    expect(ajustePorScore(100).delta).toBe(5);
  });

  it("score 80 (piso de la banda alta) → +4", () => {
    expect(ajustePorScore(80).delta).toBe(4);
  });

  it("score 47 (banda neutra) → 0", () => {
    expect(ajustePorScore(47).delta).toBe(0);
  });

  it("score 0 → -5 (tope mínimo)", () => {
    expect(ajustePorScore(0).delta).toBe(-5);
  });

  it("nunca se pasa de ±5", () => {
    for (let s = 0; s <= 100; s += 5) {
      const { delta } = ajustePorScore(s);
      expect(delta).toBeGreaterThanOrEqual(-5);
      expect(delta).toBeLessThanOrEqual(5);
    }
  });

  it("siempre trae un texto (nunca un número sin motivo)", () => {
    expect(ajustePorScore(50).texto.length).toBeGreaterThan(0);
    expect(ajustePorScore(10).texto.length).toBeGreaterThan(0);
    expect(ajustePorScore(90).texto.length).toBeGreaterThan(0);
  });
});

describe("aplicarAjuste", () => {
  it("suma el delta y acota a 0-100", () => {
    expect(aplicarAjuste(94, -5)).toBe(89);
    expect(aplicarAjuste(97, 5)).toBe(100); // no se pasa de 100
    expect(aplicarAjuste(2, -5)).toBe(0); // no baja de 0
  });
});

describe("contextoParaPrompt", () => {
  it("arma el string con los datos presentes, en el orden esperado", () => {
    const t = contextoParaPrompt({ tipo_propiedad: "departamento", barrio: "Belgrano", m2_cubiertos: 60, dormitorios: 2, banos: 1 });
    expect(t).toBe("Tipo: departamento · Barrio: Belgrano · Superficie cubierta: 60 m² · Dormitorios: 2 · Baños: 1");
  });

  it("omite los campos ausentes sin dejar separadores sueltos", () => {
    const t = contextoParaPrompt({ barrio: "Palermo" });
    expect(t).toBe("Barrio: Palermo");
  });

  it("vacío si no hay ningún dato", () => {
    expect(contextoParaPrompt({})).toBe("");
  });
});
