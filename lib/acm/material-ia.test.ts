import { describe, it, expect } from "vitest";
import { promptReparto, promptAcomodar, parsearReparto, parsearAcomodado } from "./material-ia";
import { TOPES } from "./material";

describe("promptReparto", () => {
  it("le prohíbe inventar y le exige dejar vacío lo que no encuentra", () => {
    const p = promptReparto(["texto del carpetón"]);
    expect(p.toLowerCase()).toContain("vacía");
    expect(p.toLowerCase()).toContain("no inventes");
  });

  it("pide español rioplatense, porque hay material en inglés", () => {
    expect(promptReparto(["Our Company"]).toLowerCase()).toContain("rioplatense");
  });

  it("nombra las cuatro secciones y sus topes", () => {
    const p = promptReparto(["x"]);
    for (const clave of ["quienes_somos", "como_comercializamos", "como_preparar", "roles_venta"]) {
      expect(p).toContain(clave);
    }
    expect(p).toContain(String(TOPES.quienes_somos));
  });

  it("mete el texto de todos los archivos, separados", () => {
    const p = promptReparto(["uno", "dos"]);
    expect(p).toContain("uno");
    expect(p).toContain("dos");
  });
});

describe("promptAcomodar", () => {
  it("le prohíbe agregar datos que el director no escribió", () => {
    const p = promptAcomodar("quienes_somos", "Somos Central, 13 años.");
    expect(p.toLowerCase()).toContain("no agregues");
    expect(p).toContain("Somos Central, 13 años.");
  });
});

describe("parsearReparto", () => {
  it("lee el JSON aunque venga envuelto en backticks", () => {
    const r = parsearReparto('```json\n{"quienes_somos":"Somos Central."}\n```');
    expect(r.quienes_somos).toBe("Somos Central.");
  });

  it("deja vacías las secciones que la IA no devolvió", () => {
    const r = parsearReparto('{"quienes_somos":"Hola"}');
    expect(r.como_preparar).toBe("");
    expect(r.roles_venta).toBe("");
  });

  it("descarta secciones inventadas por la IA", () => {
    const r = parsearReparto('{"quienes_somos":"Hola","nuestros_premios":"no va"}');
    expect(r).not.toHaveProperty("nuestros_premios");
  });

  it("recorta al tope aunque la IA se pase", () => {
    const r = parsearReparto(JSON.stringify({ roles_venta: "a".repeat(3000) }));
    expect(r.roles_venta).toHaveLength(TOPES.roles_venta);
  });

  it("con una respuesta que no es JSON devuelve las cuatro vacías en vez de romper", () => {
    const r = parsearReparto("Perdón, no pude procesar el archivo.");
    expect(r).toEqual({ quienes_somos: "", como_comercializamos: "", como_preparar: "", roles_venta: "" });
  });
});

describe("parsearAcomodado", () => {
  it("devuelve el texto recortado al tope de esa sección", () => {
    expect(parsearAcomodado('{"texto":"Listo."}', "quienes_somos")).toBe("Listo.");
    expect(parsearAcomodado(JSON.stringify({ texto: "a".repeat(999) }), "roles_venta")).toHaveLength(TOPES.roles_venta);
  });

  it("acepta también una respuesta en texto plano", () => {
    expect(parsearAcomodado("Somos Central.", "quienes_somos")).toBe("Somos Central.");
  });
});
