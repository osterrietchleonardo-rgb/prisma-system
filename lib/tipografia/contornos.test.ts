import { describe, it, expect } from "vitest";
import { contornosDeTexto, anchoDelTexto, repartirEnRenglones } from "./contornos";

describe("contornosDeTexto", () => {
  it("un emoji cuenta como letra sin dibujar", () => {
    // La Inter incrustada tiene 515 glifos y ninguno es un emoji: charToGlyph('🏡') da .notdef,
    // que en esta fuente es una "caja de tofu" VISIBLE con un contorno real de 638 caracteres
    // (medido 16-sep-2026), no un contorno vacio. Hasta el 16-sep-2026 esa caja se dibujaba Y NO
    // se contaba, asi que un emoji en una placa aparecia como un rectangulo sin que nadie se
    // enterara del problema. Es un accidente parecido al credito de OpenStreetMap del mapa del
    // ACM, que salio en blanco durante meses, aunque ahi el sintoma era lo opuesto (nada visible
    // en vez de una caja de mas).
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

describe("repartirEnRenglones", () => {
  it("corta por palabras sin pasarse del ancho", () => {
    const rs = repartirEnRenglones("Belgrano lidera la demanda de alquileres", 40, 300);
    expect(rs.length).toBeGreaterThan(1);
    for (const r of rs) expect(anchoDelTexto(r, 40)).toBeLessThanOrEqual(300);
  });

  it("respeta los saltos de linea que ya trae el texto", () => {
    // El director separa el aviso legal de la firma de la agencia con un salto.
    const rs = repartirEnRenglones("Primero\nSegundo", 20, 10000);
    expect(rs).toEqual(["Primero", "Segundo"]);
  });

  it("parte a lo bruto una palabra mas larga que el renglon", () => {
    const rs = repartirEnRenglones("www.unaurlmuylargaquenoentra.com.ar", 40, 120);
    expect(rs.length).toBeGreaterThan(1);
    expect(rs.join("")).toBe("www.unaurlmuylargaquenoentra.com.ar");
  });

  it("no devuelve renglones vacios", () => {
    const rs = repartirEnRenglones("  Hola  \n\n  Chau  ", 20, 10000);
    expect(rs).toEqual(["Hola", "Chau"]);
  });
});
