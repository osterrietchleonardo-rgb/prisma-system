import { describe, it, expect } from "vitest";
import { SECCIONES, normalizarMaterial, seccionesParaFicha, TOPES } from "./material";

describe("SECCIONES", () => {
  it("son cuatro, en el orden en que se muestran en la configuración", () => {
    expect(SECCIONES.map((s) => s.clave)).toEqual([
      "quienes_somos", "como_comercializamos", "como_preparar", "roles_venta",
    ]);
  });

  it("cada una dice qué subir y dónde sale, para guiar al director", () => {
    for (const s of SECCIONES) {
      expect(s.ayuda.length).toBeGreaterThan(20);
      expect(s.donde.length).toBeGreaterThan(5);
    }
  });
});

describe("normalizarMaterial", () => {
  it("de una agencia sin nada configurado devuelve la forma vacía", () => {
    expect(normalizarMaterial(undefined)).toEqual({
      archivos: [],
      secciones: { quienes_somos: "", como_comercializamos: "", como_preparar: "", roles_venta: "" },
    });
  });

  it("recorta cada sección a su tope", () => {
    const largo = "a".repeat(5000);
    const m = normalizarMaterial({ secciones: { quienes_somos: largo, roles_venta: largo } });
    expect(m.secciones.quienes_somos).toHaveLength(TOPES.quienes_somos);
    expect(m.secciones.roles_venta).toHaveLength(TOPES.roles_venta);
  });

  it("ignora claves de sección inventadas", () => {
    const m = normalizarMaterial({ secciones: { quienes_somos: "Hola", inventada: "no va" } });
    expect(m.secciones).not.toHaveProperty("inventada");
    expect(m.secciones.quienes_somos).toBe("Hola");
  });

  it("descarta archivos a los que les falta un dato", () => {
    const m = normalizarMaterial({
      archivos: [
        { id: "1", nombre: "ok.pdf", path: "ag/1.pdf", subido_el: "2026-09-05T10:00:00Z" },
        { id: "2", nombre: "sin path" },
        "basura",
      ],
    });
    expect(m.archivos).toHaveLength(1);
    expect(m.archivos[0].nombre).toBe("ok.pdf");
  });

  it("no explota con basura", () => {
    expect(normalizarMaterial("texto suelto").archivos).toEqual([]);
    expect(normalizarMaterial(null).secciones.quienes_somos).toBe("");
  });
});

describe("seccionesParaFicha", () => {
  it("devuelve null si no hay NINGUNA sección con texto: la ficha sale como siempre", () => {
    expect(seccionesParaFicha(undefined)).toBeNull();
    expect(seccionesParaFicha({ secciones: { quienes_somos: "   " } })).toBeNull();
  });

  it("devuelve las secciones cuando hay al menos una con texto", () => {
    const s = seccionesParaFicha({ secciones: { quienes_somos: "Somos Central." } });
    expect(s?.quienes_somos).toBe("Somos Central.");
    expect(s?.como_preparar).toBe("");
  });

  it("nunca deja pasar la lista de archivos a la ficha", () => {
    const s = seccionesParaFicha({
      archivos: [{ id: "1", nombre: "interno.pdf", path: "ag/1.pdf", subido_el: "2026-09-05T10:00:00Z" }],
      secciones: { quienes_somos: "Somos Central." },
    });
    expect(s).not.toHaveProperty("archivos");
    expect(JSON.stringify(s)).not.toContain("interno.pdf");
  });
});
