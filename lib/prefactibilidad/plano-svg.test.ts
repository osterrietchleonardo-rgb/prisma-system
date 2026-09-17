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
});
