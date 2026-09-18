import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { decodificar, teselaDe, volumenesDe } from "./teselas";
import { calcularEdificabilidadOficial, medirM2 } from "./envolvente";
import type { Poligono, VolumenOficial } from "./tipos";

const fx = (n: string) => path.join(__dirname, "__fixtures__", n);
const lote = (smp: string): Poligono => JSON.parse(readFileSync(fx(`${smp}.lote.geojson`), "utf8")).features[0].geometry;
function volumenes(smp: string, lng: number, lat: number) {
  const t = teselaDe(lng, lat, 17);
  return volumenesDe(decodificar(readFileSync(fx(`volumen_edif-17-${t.x}-${t.y}.pbf`)), t), smp);
}

describe("Roosevelt 4554 (053-050-006, USAM, manzana típica): el número de TodoProps", () => {
  const e = calcularEdificabilidadOficial(volumenes("053-050-006", -58.4808, -34.5703), lote("053-050-006"))!;
  it("cuerpo principal 261 ± 5 m² (TodoProps: 263)", () => {
    const cuerpo = e.plantas.find((p) => p.nombre.startsWith("Planta baja"))!;
    expect(cuerpo.m2PorNivel).toBeGreaterThan(256); expect(cuerpo.m2PorNivel).toBeLessThan(268);
    expect(cuerpo.niveles).toBe(6);
  });
  it("retirados: 244 y 192 m², un nivel cada uno", () => {
    const r1 = e.plantas.find((p) => p.nombre === "Primer retirado")!;
    const r2 = e.plantas.find((p) => p.nombre === "Segundo retirado")!;
    expect(r1.m2PorNivel).toBeCloseTo(244, -1); expect(r2.m2PorNivel).toBeCloseTo(192, -1);
    expect(r1.niveles).toBe(1); expect(r1.desdeM).toBe(17.2); expect(r2.hastaM).toBe(24.2);
  });
  it("totales: 6 × cuerpo + r1 + r2, vendible al 80 %", () => {
    // Medido a mano sobre el fixture 053-050-006 (Roosevelt 4554) corriendo este test: 1999,89 m²
    // construibles. No se deriva de la misma fórmula que usa el código (plantas.reduce(...)),
    // así que si el cálculo se rompe el test cae.
    expect(e.m2Construibles).toBeCloseTo(1999.89, -1);
    expect(e.m2Vendibles).toBeCloseTo(1599.92, -1);
    expect(e.alturaMaxima).toBe(17.2); expect(e.planoLimite).toBe(24.2);
    expect(e.modo).toBe("oficial"); expect(e.unidades).toEqual(["USAM"]);
    expect(e.huella).not.toBeNull();
  });
});

describe("Cabildo 2040 (039-097-008B): dos unidades y basamento", () => {
  const e = calcularEdificabilidadOficial(volumenes("039-097-008B", -58.456744, -34.562934), lote("039-097-008B"))!;
  it("suma CM y CA; el basamento aporta solo lo que excede al cuerpo, en 2 niveles", () => {
    expect(e.unidades.sort()).toEqual(["CA", "CM"]);
    const bas = e.plantas.filter((p) => p.nombre.startsWith("Basamento"));
    expect(bas.length).toBe(2);
    const basCM = bas.find((b) => b.unidad === "CM")!;
    const basCA = bas.find((b) => b.unidad === "CA")!;
    // Medido a mano sobre el fixture 039-097-008B (Cabildo 2040) corriendo este test: CM 495,12 m²,
    // CA 402,59 m² (el ledger los había anotado ~495 y ~402). Antes esto solo probaba >= 0.
    expect(basCM.m2PorNivel).toBeCloseTo(495, -1);
    expect(basCA.m2PorNivel).toBeCloseTo(402, -1);
    expect(basCM.niveles).toBe(2); expect(basCA.niveles).toBe(2);
    const cuerpoCA = e.plantas.find((p) => p.unidad === "CA" && p.nombre.includes("sobre el basamento"))!;
    expect(cuerpoCA.niveles).toBe(11); // 13 menos los 2 del basamento
    expect(e.alturaMaxima).toBe(38); expect(e.planoLimite).toBe(45);
    // Total a mano, medido sobre el mismo fixture: 8.543,14 m² construibles. No se deriva de
    // plantas.reduce(...) (la misma fórmula del código), así que un basamento roto lo hace fallar.
    expect(e.m2Construibles).toBeCloseTo(8543, -1);
  });
  it("la huella nunca supera el lote", () => {
    const l = lote("039-097-008B");
    const c = (l.type === "Polygon" ? l.coordinates[0][0] : l.coordinates[0][0][0]) as [number, number];
    expect(medirM2(e.huella!, c)).toBeLessThanOrEqual(medirM2(l, c) + 1);
  });
});

describe("sin cuerpo principal no hay edificabilidad oficial", () => {
  it("devuelve null", () => {
    expect(calcularEdificabilidadOficial([], lote("053-050-006"))).toBeNull();
  });
});

describe("una unidad sin cuerpo principal no aporta m² y no debe listarse", () => {
  it("unidades trae solo la que efectivamente generó plantas, aunque otra unidad traiga volúmenes", () => {
    const reales = volumenes("053-050-006", -58.4808, -34.5703);
    // Volumen sintético de una unidad que en esta parcela solo tiene un retiro, sin cuerpo
    // principal: no debería aportar m² ni listarse en `unidades` (Important 1 del review).
    const soloRetiro: VolumenOficial = { ...reales[0], unidad: "USAB1", tipo: "retiro 1" };
    const e = calcularEdificabilidadOficial([...reales, soloRetiro], lote("053-050-006"))!;
    expect(e.unidades).toEqual(["USAM"]);
    expect(e.unidades).not.toContain("USAB1");
    expect(e.plantas.some((p) => p.unidad === "USAB1")).toBe(false);
  });
});
