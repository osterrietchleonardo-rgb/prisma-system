import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { analizarManzana, huellaPorRegla, edificabilidadPorRegla } from "./lfi-regla";
import type { Poligono } from "./tipos";

// Manzana sintética de 100 × 100 m con esquina en (-58.48, -34.57). 1 m ≈ 1/91700° en lng y 1/110540° en lat.
// El lote va al MEDIO del lado sur (x=40): queda a 40 m del lado oeste, fuera de su banda de 25 m, así la huella es solo la del frente. A 20 m de la esquina entraba también en la banda oeste y medía 241 m² en vez de 216,5.
const DX = 1 / 91700, DY = 1 / 110540;
const O: [number, number] = [-58.48, -34.57];
const rect = (x0: number, y0: number, w: number, h: number): Poligono => ({
  type: "Polygon",
  coordinates: [[[O[0] + x0 * DX, O[1] + y0 * DY], [O[0] + (x0 + w) * DX, O[1] + y0 * DY], [O[0] + (x0 + w) * DX, O[1] + (y0 + h) * DY], [O[0] + x0 * DX, O[1] + (y0 + h) * DY], [O[0] + x0 * DX, O[1] + y0 * DY]]],
});
const MANZANA = rect(0, 0, 100, 100);

describe("manzana típica según art. 6.4.2.1", () => {
  it("100 × 100: cuatro lados, semisumas ≥ 62, área ≥ 4.000 → típica", () => {
    const m = analizarManzana(MANZANA);
    expect(m.tipica).toBe(true); expect(m.lados).toBe(4); expect(m.areaM2).toBeCloseTo(10000, -2);
  });
  it("50 × 50 no es típica (semisuma < 62 y área < 4.000)", () => {
    expect(analizarManzana(rect(0, 0, 50, 50)).tipica).toBe(false);
  });
  it("cinco lados no es típica", () => {
    const penta: Poligono = { type: "Polygon", coordinates: [[[O[0], O[1]], [O[0] + 100 * DX, O[1]], [O[0] + 100 * DX, O[1] + 100 * DY], [O[0] + 50 * DX, O[1] + 130 * DY], [O[0], O[1] + 100 * DY], [O[0], O[1]]]] };
    expect(analizarManzana(penta).tipica).toBe(false);
  });
});

describe("la línea de frente interno a ¼ (art. 6.4.2)", () => {
  it("lote de 8,66 × 30 sobre el lado sur: la huella es 8,66 × 25 = 216,5 m²", () => {
    const h = huellaPorRegla(rect(40, 0, 8.66, 30), MANZANA, "USAM");
    expect(h.alcanzadoPorLfi).toBe(true);
    expect(h.m2).toBeGreaterThan(214); expect(h.m2).toBeLessThan(219);
  });
  it("lote de 20 m de fondo en USAM: la L.F.I. no lo alcanza → retiro de fondo de 6 m (art. 6.4.2.4) → 8,66 × 14", () => {
    const h = huellaPorRegla(rect(40, 0, 8.66, 20), MANZANA, "USAM");
    expect(h.alcanzadoPorLfi).toBe(false);
    expect(h.m2).toBeCloseTo(8.66 * 14, 0);
  });
  it("edificabilidad por regla: modo regla, 6 niveles, rango con piso de 16 m", () => {
    const e = edificabilidadPorRegla(rect(40, 0, 8.66, 30), MANZANA, "USAM");
    expect(e.modo).toBe("regla");
    expect(e.plantas[0].niveles).toBe(6);
    expect(e.rango!.piso).toBeCloseTo(8.66 * 16 * 6, -1);
    expect(e.rango!.techo).toBeGreaterThan(e.rango!.piso);
    expect(e.m2Vendibles).toBeCloseTo(e.m2Construibles * 0.8, 3);
  });
  it("manzana atípica (50 × 50): sin banda, el rango es conservador — piso = banda mínima de 16 m; techo = piso más los retirados", () => {
    const chica = rect(0, 0, 50, 50);
    const lote = rect(20, 0, 8.66, 30);
    const usam = edificabilidadPorRegla(lote, chica, "USAM");
    expect(usam.modo).toBe("regla");
    expect(usam.huella).toBeNull();
    expect(usam.rango!.piso).toBeCloseTo(8.66 * 16 * 6, -1);
    expect(usam.rango!.techo).toBeCloseTo(usam.rango!.piso + 8.66 * 16 * (0.9 + 0.7), -1);
    const baja = edificabilidadPorRegla(lote, chica, "USAB1");
    expect(baja.rango!.techo).toBeCloseTo(baja.rango!.piso, 6); // sin retirados el rango se cierra en un punto
  });
});

describe("contra la capa oficial: Roosevelt 4554 (manzana 053-050)", () => {
  it("la regla da 242 ± 6 m² (la oficial da 261 por las extensiones del espacio libre; es un control, no la fuente)", () => {
    const fx = (n: string) => JSON.parse(readFileSync(path.join(__dirname, "__fixtures__", n), "utf8")).features[0].geometry as Poligono;
    const h = huellaPorRegla(fx("053-050-006.lote.geojson"), fx("053-050.manzana.geojson"), "USAM");
    expect(h.m2).toBeGreaterThan(236); expect(h.m2).toBeLessThan(248);
  });
});
