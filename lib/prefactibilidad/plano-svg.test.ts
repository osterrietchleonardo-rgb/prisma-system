import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { planoSvg } from "./plano-svg";
import type { Poligono } from "./tipos";

const fx = (n: string) => JSON.parse(readFileSync(path.join(__dirname, "__fixtures__", n), "utf8")).features[0].geometry as Poligono;

describe("el plano del lote para la ficha", () => {
  const svg = planoSvg({ lote: fx("053-050-006.lote.geojson"), huella: fx("053-050-006.lote.geojson"), manzana: fx("053-050.manzana.geojson") });
  it("es un SVG con viewBox y tres polígonos (manzana, lote, huella)", () => {
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toMatch(/viewBox="[-\d. ]+"/);
    expect((svg.match(/<polygon/g) || []).length).toBeGreaterThanOrEqual(3);
  });
  it("no usa <text>: en el servidor no hay fuentes", () => {
    expect(svg).not.toContain("<text");
  });
  it("sin huella ni manzana también dibuja", () => {
    const s = planoSvg({ lote: fx("053-050-006.lote.geojson"), huella: null });
    expect((s.match(/<polygon/g) || []).length).toBe(1);
  });
  it("la escala y la flecha quedan en el margen, sin pisar el lote (lote angosto de 8,66 × 40 m)", () => {
    const DX = 1 / 91700, DY = 1 / 110540, O = [-58.48, -34.57];
    const angosto: Poligono = { type: "Polygon", coordinates: [[[O[0], O[1]], [O[0] + 8.66 * DX, O[1]], [O[0] + 8.66 * DX, O[1] + 40 * DY], [O[0], O[1] + 40 * DY], [O[0], O[1]]]] };
    const s = planoSvg({ lote: angosto, huella: null });
    const [vx, vy, vw, vh] = s.match(/viewBox="([-\d. ]+)"/)![1].split(" ").map(Number);
    // el lote ocupa el centro; con 14 m de margen a cada lado el viewBox mide al menos 8,66 + 28 de ancho
    expect(vw).toBeGreaterThanOrEqual(8.66 + 28 - 0.01);
    // la barra arranca a 2 m del borde izquierdo y termina antes de los 14 m de margen
    const barra = s.match(/M ([-\d.]+) ([-\d.]+) L ([-\d.]+) \2 M/)!;
    expect(Number(barra[1])).toBeCloseTo(vx + 2, 1);
    expect(Number(barra[3]) - vx).toBeLessThan(14);
    expect(Number(barra[2])).toBeGreaterThan(vy + vh - 14);
    expect(s).toContain('preserveAspectRatio="xMidYMid meet"');
  });
  it("un color inválido cae al cobre por defecto", () => {
    const s = planoSvg({ lote: fx("053-050-006.lote.geojson"), huella: null, colorLote: 'red" onload="x' });
    expect(s).not.toContain("onload");
    expect(s).toContain('stroke="#8d5c2a"');
  });
});
