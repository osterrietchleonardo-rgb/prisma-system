import { describe, it, expect } from "vitest";
import { SECCIONES, esRutaDeLaAgencia, normalizarMaterial, seccionesParaFicha, TOPES } from "./material";

describe("esRutaDeLaAgencia", () => {
  const AGENCIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const OTRA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const ARCHIVO = "11111111-2222-4333-8444-555555555555";

  it("acepta la forma exacta que arma el endpoint de subida", () => {
    expect(esRutaDeLaAgencia(`${AGENCIA}/${ARCHIVO}.pdf`, AGENCIA)).toBe(true);
    expect(esRutaDeLaAgencia(`${AGENCIA}/${ARCHIVO}.docx`, AGENCIA)).toBe(true);
  });

  it("rechaza el archivo de otra agencia", () => {
    expect(esRutaDeLaAgencia(`${OTRA}/${ARCHIVO}.pdf`, AGENCIA)).toBe(false);
  });

  it("rechaza salirse con .. aunque empiece con el id propio", () => {
    // El agujero real: `A/../B/x.pdf` pasa un startsWith(`A/`) y llegaría al storage.
    expect(esRutaDeLaAgencia(`${AGENCIA}/../${OTRA}/${ARCHIVO}.pdf`, AGENCIA)).toBe(false);
    expect(esRutaDeLaAgencia(`${AGENCIA}/..%2f${OTRA}/${ARCHIVO}.pdf`, AGENCIA)).toBe(false);
    expect(esRutaDeLaAgencia(`${AGENCIA}\\..\\${OTRA}\\${ARCHIVO}.pdf`, AGENCIA)).toBe(false);
  });

  it("rechaza subcarpetas, colados y extensiones que no subimos", () => {
    expect(esRutaDeLaAgencia(`${AGENCIA}/sub/${ARCHIVO}.pdf`, AGENCIA)).toBe(false);
    expect(esRutaDeLaAgencia(`${AGENCIA}/${ARCHIVO}.pdf.exe`, AGENCIA)).toBe(false);
    expect(esRutaDeLaAgencia(`${AGENCIA}/${ARCHIVO}.sql`, AGENCIA)).toBe(false);
    expect(esRutaDeLaAgencia(`${AGENCIA}/`, AGENCIA)).toBe(false);
  });

  it("no se deja engañar por un id de agencia que sea prefijo de otro", () => {
    expect(esRutaDeLaAgencia(`${AGENCIA}extra/${ARCHIVO}.pdf`, AGENCIA)).toBe(false);
  });

  it("con basura, o con un id de agencia que no es un uuid, dice que no", () => {
    expect(esRutaDeLaAgencia(null, AGENCIA)).toBe(false);
    expect(esRutaDeLaAgencia(42, AGENCIA)).toBe(false);
    expect(esRutaDeLaAgencia(`x/${ARCHIVO}.pdf`, "")).toBe(false);
    // Un agencyId con metacaracteres no debe poder armar una regex permisiva.
    expect(esRutaDeLaAgencia(`cualquier/cosa.pdf`, ".*")).toBe(false);
  });
});

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
