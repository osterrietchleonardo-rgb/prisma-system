import { describe, it, expect } from "vitest";
import { proyector, areaPlanar, distanciaASegmento, bboxDe, anillosDe } from "./geo";

describe("proyección local: metros alrededor de un origen en CABA", () => {
  it("un grado de latitud son ~110,5 km y uno de longitud ~91,7 km a -34,6°", () => {
    const p = proyector([-58.48, -34.57]);
    const [, y] = p.aMetros([-58.48, -34.56]);
    const [x] = p.aMetros([-58.47, -34.57]);
    expect(y).toBeGreaterThan(1100); expect(y).toBeLessThan(1110);
    expect(x).toBeGreaterThan(910); expect(x).toBeLessThan(925);
  });
  it("ida y vuelta devuelve el mismo punto", () => {
    const p = proyector([-58.48, -34.57]);
    const [lng, lat] = p.aLonLat(p.aMetros([-58.4712, -34.5634]));
    expect(lng).toBeCloseTo(-58.4712, 6); expect(lat).toBeCloseTo(-34.5634, 6);
  });
  it("área planar de un cuadrado de 10 m", () => {
    expect(areaPlanar([[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]])).toBeCloseTo(100, 6);
  });
  it("distancia de un punto a un segmento, dentro y fuera de su sombra", () => {
    expect(distanciaASegmento([5, 3], [0, 0], [10, 0])).toBeCloseTo(3);
    expect(distanciaASegmento([15, 0], [0, 0], [10, 0])).toBeCloseTo(5);
  });
  it("bbox y anillos exteriores de Polygon y MultiPolygon", () => {
    const poly = { type: "Polygon" as const, coordinates: [[[0, 0], [2, 0], [2, 1], [0, 1], [0, 0]]] };
    expect(bboxDe(poly)).toEqual([0, 0, 2, 1]);
    const multi = { type: "MultiPolygon" as const, coordinates: [poly.coordinates, [[[5, 5], [6, 5], [6, 6], [5, 5]]]] };
    expect(anillosDe(multi)).toHaveLength(2);
    expect(bboxDe(multi)).toEqual([0, 0, 6, 6]);
  });
});
