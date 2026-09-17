import { describe, it, expect } from "vitest";
import { calleClave, abrirPuertas, filaPuertas } from "./normalizar-calle";

describe("USIG y el catastro escriben las calles distinto", () => {
  it("«CABILDO AV.» (USIG) y «AV. CABILDO» (frentes) dan la misma clave", () => {
    expect(calleClave("CABILDO AV.")).toBe(calleClave("AV. CABILDO"));
    expect(calleClave("CABILDO AV.")).toBe("CABILDO AV");
  });
  it("saca tildes, puntos y dobles espacios", () => {
    expect(calleClave("Gral. Mariano  Acha")).toBe("MARIANO ACHA GRAL");
    expect(calleClave("ROOSEVELT FRANKLIN D.")).toBe("ROOSEVELT FRANKLIN D");
    expect(calleClave("Zuviría")).toBe("ZUVIRIA");
  });
  it("abre las puertas separadas por punto; vacío y basura dan []", () => {
    expect(abrirPuertas("3939.3943.3945.3947")).toEqual([3939, 3943, 3945, 3947]);
    expect(abrirPuertas("2040")).toEqual([2040]);
    expect(abrirPuertas("")).toEqual([]);
    expect(abrirPuertas("N")).toEqual([]);
  });
  it("una fila de frentes → una fila por puerta, con esquina y ochava; EXCEDENTE se ignora", () => {
    expect(filaPuertas({ frente: "AV. CABILDO", num_dom: "2040", smp: "039-097-008b", parc_esq: "N", ochava: "N", clase: "PARCELA" }))
      .toEqual([{ calle: "AV. CABILDO", calle_clave: "CABILDO AV", altura: 2040, smp: "039-097-008b", es_esquina: false, tiene_ochava: false }]);
    expect(filaPuertas({ frente: "X", num_dom: "1.2", smp: "s", parc_esq: "S", ochava: "S", clase: "EXCEDENTE" })).toEqual([]);
  });
});
