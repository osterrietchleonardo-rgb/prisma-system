import { describe, it, expect } from "vitest";
import { normalizarPlantilla, docVacio, DOC_VACIO, MAX_NOMBRE, MAX_SOLAPE } from "./plantilla";

describe("normalizarPlantilla", () => {
  it("de nada devuelve una plantilla vacía, inactiva, sin header ni footer, con el bloque en 'ninguno'", () => {
    const p = normalizarPlantilla(undefined);
    expect(p.nombre).toBe("");
    expect(p.cuerpo).toEqual(DOC_VACIO);
    expect(p.header_path).toBeNull();
    expect(p.footer_path).toBeNull();
    expect(p.bloque_asesor).toEqual({ texto: DOC_VACIO, posicion: "ninguno", solape: 0 });
    expect(p.version).toBe(1);
    expect(p.activa).toBe(false);
  });

  it("recorta el nombre al tope y lo limpia", () => {
    const p = normalizarPlantilla({ nombre: "  " + "a".repeat(500) + "  " });
    expect(p.nombre).toHaveLength(MAX_NOMBRE);
  });

  it("una posición inventada cae en 'ninguno'", () => {
    const p = normalizarPlantilla({ bloque_asesor: { texto: DOC_VACIO, posicion: "arriba" } });
    expect(p.bloque_asesor.posicion).toBe("ninguno");
  });

  it("el solape del bloque sobre la imagen es un entero entre 0 y el tope; lo que no, cae en 0", () => {
    expect(normalizarPlantilla({ bloque_asesor: { texto: DOC_VACIO, posicion: "footer", solape: 60 } }).bloque_asesor.solape).toBe(60);
    expect(normalizarPlantilla({ bloque_asesor: { texto: DOC_VACIO, posicion: "footer", solape: 999 } }).bloque_asesor.solape).toBe(MAX_SOLAPE);
    expect(normalizarPlantilla({ bloque_asesor: { texto: DOC_VACIO, posicion: "footer", solape: -5 } }).bloque_asesor.solape).toBe(0);
    expect(normalizarPlantilla({ bloque_asesor: { texto: DOC_VACIO, posicion: "footer", solape: "40" } }).bloque_asesor.solape).toBe(0);
    expect(normalizarPlantilla({ bloque_asesor: { texto: DOC_VACIO, posicion: "footer" } }).bloque_asesor.solape).toBe(0);
  });

  it("un cuerpo que no es un doc de Tiptap cae en el doc vacío", () => {
    expect(normalizarPlantilla({ cuerpo: "<b>hola</b>" }).cuerpo).toEqual(DOC_VACIO);
    expect(normalizarPlantilla({ cuerpo: { type: "html" } }).cuerpo).toEqual(DOC_VACIO);
  });

  it("conserva un doc válido tal cual", () => {
    const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hola" }] }] };
    expect(normalizarPlantilla({ cuerpo: doc }).cuerpo).toEqual(doc);
  });

  it("version nunca baja de 1 y activa es booleano estricto", () => {
    expect(normalizarPlantilla({ version: 0 }).version).toBe(1);
    expect(normalizarPlantilla({ version: "7" }).version).toBe(1);
    expect(normalizarPlantilla({ activa: "true" }).activa).toBe(false);
    expect(normalizarPlantilla({ activa: true }).activa).toBe(true);
  });
});

describe("docVacio", () => {
  it("un doc sin contenido o con un párrafo vacío está vacío", () => {
    expect(docVacio(DOC_VACIO)).toBe(true);
    expect(docVacio({ type: "doc", content: [{ type: "paragraph" }] })).toBe(true);
    expect(docVacio({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "   " }] }] })).toBe(true);
  });

  it("con texto o con una mención no está vacío", () => {
    expect(docVacio({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hola" }] }] })).toBe(false);
    expect(docVacio({ type: "doc", content: [{ type: "paragraph", content: [{ type: "mention", attrs: { id: "nombre" } }] }] })).toBe(false);
  });
});
