import { describe, it, expect } from "vitest";
import { contornosDeTexto, anchoDelTexto } from "./contornos";

describe("contornosDeTexto", () => {
  it("un emoji cuenta como letra sin dibujar", () => {
    // La Inter incrustada tiene 515 glifos y ninguno es un emoji: charToGlyph('🏡') da .notdef,
    // que devuelve un contorno vacio. Hasta el 16-sep-2026 eso pasaba sin ser contado, asi que
    // un emoji en una placa se dibujaba como nada y nadie se enteraba. Es el mismo accidente
    // del credito de OpenStreetMap del mapa del ACM, que salio en blanco durante meses.
    const c = contornosDeTexto("Casa 🏡", 0, 20, 20);
    expect(c.letrasRotas).toBe(1);
  });

  it("el texto normal no rompe nada", () => {
    const c = contornosDeTexto("Departamento en Núñez — USD 130.000", 0, 20, 20);
    expect(c.letrasRotas).toBe(0);
    expect(c.paths.length).toBeGreaterThan(20);
  });

  it("los espacios no cuentan como letras rotas", () => {
    const c = contornosDeTexto("a b c", 0, 20, 20);
    expect(c.letrasRotas).toBe(0);
  });

  it("anchoDelTexto crece con el cuerpo", () => {
    expect(anchoDelTexto("Belgrano", 40)).toBeGreaterThan(anchoDelTexto("Belgrano", 20));
  });
});
