import { describe, it, expect } from "vitest";
import { resumenACategorias } from "./zona";

// Copia fiel de lo que devuelve zona_resumen() para Cabildo y Juramento, Belgrano.
const RESUMEN = {
  barrio: "Belgrano", comuna: 13, area_km2: 8.1, espacios_verdes_barrio: 31,
  subte: { nombre: "Juramento", subtipo: "Línea D", metros: 57, lat: -34.5623, lon: -58.4564, extra: { linea: "D" } },
  espacio_verde: { nombre: "Plaza Gral. Manuel Belgrano", subtipo: "PLAZA", metros: 68, lat: -34.5616, lon: -58.4552, extra: { area_m2: 4670 } },
  hospital: { nombre: "Dr. I. Pirovano", subtipo: "Hospital General de Agudos", metros: 1425, lat: -34.5650, lon: -58.4710, extra: {} },
  comisaria: { nombre: "Comisaría Vecinal 13-C", subtipo: null, metros: 206, lat: -34.5601, lon: -58.4560, extra: {} },
  ciclovia: { nombre: "ECHEVERRIA", subtipo: "Ciclovías", metros: 96, lat: -34.5628, lon: -58.4556, extra: {} },
  escuela: { cantidad: 63, estatales: 26 },
  farmacia: { cantidad: 15 },
  ecobici: { cantidad: 4 },
  parada_colectivo: { lineas: ["113", "152", "29", "41", "60"], cantidad: 5 },
};

describe("resumenACategorias", () => {
  it("arma el subte con la línea como detalle", () => {
    const subte = resumenACategorias(RESUMEN).find((p) => p.categoria === "subte");
    expect(subte).toEqual({
      categoria: "subte", titulo: "Juramento", detalle: "Línea D",
      metros: 57, cantidad: null, lat: -34.5623, lon: -58.4564,
    });
  });

  it("cuenta las escuelas y aclara cuántas son estatales", () => {
    const esc = resumenACategorias(RESUMEN).find((p) => p.categoria === "escuela");
    expect(esc?.titulo).toBe("63 escuelas");
    expect(esc?.detalle).toBe("26 estatales");
    expect(esc?.cantidad).toBe(63);
    expect(esc?.metros).toBe(null);
  });

  it("singulariza cuando hay una sola", () => {
    const r = resumenACategorias({ ...RESUMEN, escuela: { cantidad: 1, estatales: 0 }, farmacia: { cantidad: 1 } });
    expect(r.find((p) => p.categoria === "escuela")?.titulo).toBe("1 escuela");
    expect(r.find((p) => p.categoria === "farmacia")?.titulo).toBe("1 farmacia");
  });

  it("ordena las líneas de colectivo como números, no como texto", () => {
    const col = resumenACategorias(RESUMEN).find((p) => p.categoria === "parada_colectivo");
    // Ordenado como texto daría "113 · 152 · 29 · 41 · 60", que parece un error de carga.
    expect(col?.titulo).toBe("29 · 41 · 60 · 113 · 152");
    expect(col?.detalle).toBe("a menos de 300 m");
  });

  it("no muestra el detalle de subtipo en las categorías donde no aporta", () => {
    const r = resumenACategorias(RESUMEN);
    // "PLAZA" y "Hospital General de Agudos" son ruido al lado del nombre propio.
    expect(r.find((p) => p.categoria === "espacio_verde")?.detalle).toBe("");
    expect(r.find((p) => p.categoria === "hospital")?.detalle).toBe("");
  });

  it("le pone nombre genérico al espacio verde grande que el gobierno dejó sin nombre", () => {
    const r = resumenACategorias({
      ...RESUMEN,
      espacio_verde: { nombre: "", subtipo: "PARQUE", metros: 300, lat: -34.5, lon: -58.4, extra: { area_m2: 54494 } },
    });
    expect(r.find((p) => p.categoria === "espacio_verde")?.titulo).toBe("Espacio verde");
  });

  it("descarta los cercanos sin nombre en las categorías que sí necesitan uno", () => {
    const r = resumenACategorias({ ...RESUMEN, subte: { nombre: "", subtipo: "Línea D", metros: 57, lat: 1, lon: 2, extra: {} } });
    expect(r.map((p) => p.categoria)).not.toContain("subte");
  });

  it("omite las categorías sin dato en vez de mostrarlas vacías", () => {
    const cats = resumenACategorias({ ...RESUMEN, ciclovia: null }).map((p) => p.categoria);
    expect(cats).not.toContain("ciclovia");
  });

  it("omite los conteos en cero", () => {
    const r = resumenACategorias({ ...RESUMEN, farmacia: { cantidad: 0 }, ecobici: { cantidad: 0 } });
    const cats = r.map((p) => p.categoria);
    expect(cats).not.toContain("farmacia");
    expect(cats).not.toContain("ecobici");
  });

  it("omite los colectivos cuando no hay ninguna línea", () => {
    const r = resumenACategorias({ ...RESUMEN, parada_colectivo: { lineas: [], cantidad: 0 } });
    expect(r.map((p) => p.categoria)).not.toContain("parada_colectivo");
  });

  it("respeta el orden de impresión de CATEGORIAS_ZONA", () => {
    expect(resumenACategorias(RESUMEN).map((p) => p.categoria)).toEqual([
      "subte", "espacio_verde", "escuela", "hospital",
      "farmacia", "parada_colectivo", "comisaria", "ecobici", "ciclovia",
    ]);
  });

  it("no explota con un resumen vacío o basura", () => {
    expect(resumenACategorias({})).toEqual([]);
    expect(resumenACategorias(null)).toEqual([]);
  });
});
