import { describe, it, expect } from "vitest";
import { UNIDADES, FACTOR_VENDIBLE, unidadDesdeAltura } from "./codigo";

describe("tabla del Código Urbanístico (art. 6.2 y 6.3, texto consolidado Ley 6.776)", () => {
  it("las siete unidades con su altura máxima", () => {
    expect(UNIDADES.CA.alturaMaxima).toBe(38);
    expect(UNIDADES.CM.alturaMaxima).toBe(31.2);
    expect(UNIDADES.USAA.alturaMaxima).toBe(22.8);
    expect(UNIDADES.USAM.alturaMaxima).toBe(17.2);
    expect(UNIDADES.USAB2.alturaMaxima).toBe(14.6);
    expect(UNIDADES.USAB1.alturaMaxima).toBe(12);
    expect(UNIDADES.USAB0.alturaMaxima).toBe(9);
  });
  it("plano límite: altura + 7 m donde hay retirados; igual a la altura en las bajas", () => {
    expect(UNIDADES.USAM.planoLimite).toBe(24.2);
    expect(UNIDADES.CA.planoLimite).toBe(45);
    expect(UNIDADES.USAB2.planoLimite).toBe(14.6);
    expect(UNIDADES.USAB1.retirados).toBe(0);
    expect(UNIDADES.USAM.retirados).toBe(2);
  });
  it("pisos del cuerpo: PB + n (los que usa el mercado y TodoProps)", () => {
    expect(UNIDADES.CA.pisosCuerpo).toBe(13);
    expect(UNIDADES.USAM.pisosCuerpo).toBe(6);
    expect(UNIDADES.USAB0.pisosCuerpo).toBe(3);
  });
  it("basamento hasta la L.I.B. solo en corredores; retiro mínimo de fondo 4/6/8", () => {
    expect(UNIDADES.CA.basamento).toBe(true);
    expect(UNIDADES.USAM.basamento).toBe(false);
    expect(UNIDADES.USAB1.retiroFondoMin).toBe(4);
    expect(UNIDADES.USAA.retiroFondoMin).toBe(6);
    expect(UNIDADES.CM.retiroFondoMin).toBe(8);
  });
  it("cada unidad cita su artículo", () => {
    for (const u of Object.values(UNIDADES)) expect(u.articulo).toMatch(/^6\.2\.[1-7]$/);
  });
  it("traduce la altura del CSV a la unidad; 0 o rara → null", () => {
    expect(unidadDesdeAltura(17.2)).toBe("USAM");
    expect(unidadDesdeAltura(38)).toBe("CA");
    expect(unidadDesdeAltura(0)).toBeNull();
    expect(unidadDesdeAltura(13)).toBeNull();
  });
  it("el factor vendible es 0,80", () => {
    expect(FACTOR_VENDIBLE).toBe(0.8);
  });
});
