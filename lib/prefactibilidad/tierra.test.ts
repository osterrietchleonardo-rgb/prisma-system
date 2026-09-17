import { describe, it, expect } from "vitest";
import { valorTierra, mediana, percentil, MIN_COMPARABLES } from "./tierra";
import type { TerrenoCerca } from "./tipos";

let n = 0;
const t = (precioUsd: number, superficieM2: number, distanciaM = 300): TerrenoCerca => ({ id: ++n, titulo: null, direccion: null, barrio: null, precioUsd, superficieM2, distanciaM, url: "u", foto: null });

describe("estadística del valor de la tierra", () => {
  it("mediana y percentiles con interpolación lineal", () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([1, 2, 3, 4])).toBe(2.5);
    expect(percentil([1, 2, 3, 4, 5], 0.25)).toBe(2);
    expect(percentil([1, 2, 3, 4, 5], 0.75)).toBe(4);
  });
  it("con menos de 5 comparables no hay valor", () => {
    expect(valorTierra([t(100000, 200), t(120000, 200), t(90000, 200), t(110000, 200)], 300)).toBeNull();
    expect(MIN_COMPARABLES).toBe(5);
  });
  it("5 terrenos alrededor de USD 500/m² → mediana 500, cuartiles 450/550, valor del lote por su superficie", () => {
    const v = valorTierra([t(100000, 200), t(110000, 200), t(90000, 200), t(120000, 200), t(80000, 200)], 300)!;
    expect(v.usdM2Mediana).toBe(500);
    expect(v.usdM2P25).toBe(450); expect(v.usdM2P75).toBe(550);
    expect(v.valorLote).toEqual({ desde: 135000, mediana: 150000, hasta: 165000 });
    expect(v.comparables).toHaveLength(5);
  });
  it("descarta precio o superficie inválidos y ordena por distancia", () => {
    const v = valorTierra([t(0, 200), t(100000, 0), t(100000, 200, 700), t(100000, 200, 100), t(100000, 200, 300), t(100000, 200, 500), t(100000, 200, 200)], 100)!;
    expect(v.comparables.map((c) => c.distanciaM)).toEqual([100, 200, 300, 500, 700]);
  });
});
