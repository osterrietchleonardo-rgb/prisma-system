import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { decodificar, teselaDe, volumenesDe } from "./teselas";
import { calcularEdificabilidadOficial, medirM2 } from "./envolvente";
import type { Poligono } from "./tipos";

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
    const esperado = e.plantas.reduce((s, p) => s + p.m2PorNivel * p.niveles, 0);
    expect(e.m2Construibles).toBeCloseTo(esperado, 3);
    expect(e.m2Vendibles).toBeCloseTo(esperado * 0.8, 3);
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
    for (const b of bas) { expect(b.niveles).toBe(2); expect(b.m2PorNivel).toBeGreaterThanOrEqual(0); }
    const cuerpoCA = e.plantas.find((p) => p.unidad === "CA" && p.nombre.includes("sobre el basamento"))!;
    expect(cuerpoCA.niveles).toBe(11); // 13 menos los 2 del basamento
    expect(e.alturaMaxima).toBe(38); expect(e.planoLimite).toBe(45);
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
