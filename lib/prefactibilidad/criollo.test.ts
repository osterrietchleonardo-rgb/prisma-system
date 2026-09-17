import { describe, it, expect } from "vitest";
import { describirUnidad, describirPlanta, m2, usd } from "./criollo";

describe("los textos que lee el dueño del lote", () => {
  it("unidad en criollo", () => {
    expect(describirUnidad("USAM")).toBe("Altura media: planta baja y 5 pisos, más 2 retirados (hasta 17,2 m; plano límite 24,2 m)");
    expect(describirUnidad("USAB0")).toBe("Altura baja 0: planta baja y 2 pisos (hasta 9 m)");
    expect(describirUnidad("CA")).toBe("Corredor alto: planta baja y 12 pisos, más 2 retirados (hasta 38 m; plano límite 45 m)");
  });
  it("planta", () => {
    expect(describirPlanta({ nombre: "Planta baja y 5 pisos", unidad: "USAM", m2PorNivel: 261.3, niveles: 6, desdeM: 0, hastaM: 17.2 })).toBe("Planta baja y 5 pisos · 261 m² por nivel · 6 niveles");
  });
  it("números en es-AR", () => {
    expect(m2(1567.4)).toBe("1.567 m²");
    expect(usd(150000)).toBe("USD 150.000");
  });
});
