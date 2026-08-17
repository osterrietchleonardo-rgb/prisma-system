import { describe, it, expect } from "vitest";
import { metrosLegible, minutosCaminando, cuadras, cuadrasEnPalabras } from "./zona-formato";

describe("metrosLegible", () => {
  it("muestra metros redondeados a la decena por debajo del kilómetro", () => {
    expect(metrosLegible(547)).toBe("550 m");
    expect(metrosLegible(94)).toBe("90 m");
  });

  it("pasa a kilómetros con un decimal desde 1000 m", () => {
    expect(metrosLegible(1234)).toBe("1,2 km");
    expect(metrosLegible(3000)).toBe("3 km");
  });

  it("usa coma decimal, no punto (es-AR)", () => {
    expect(metrosLegible(1550)).toBe("1,6 km");
  });

  it("devuelve cadena vacía si no hay dato", () => {
    expect(metrosLegible(null)).toBe("");
  });
});

describe("minutosCaminando", () => {
  it("calcula a 75 m por minuto y nunca devuelve menos de 1", () => {
    expect(minutosCaminando(750)).toBe(10);
    expect(minutosCaminando(20)).toBe(1);
  });

  it("devuelve null si no hay dato", () => {
    expect(minutosCaminando(null)).toBe(null);
  });
});

describe("cuadras", () => {
  it("cuenta a 100 m por cuadra", () => {
    expect(cuadras(400)).toBe(4);
    expect(cuadras(447)).toBe(4);
    expect(cuadras(460)).toBe(5);
  });

  it("nunca devuelve cero: menos de media cuadra sigue siendo una cuadra", () => {
    expect(cuadras(30)).toBe(1);
  });
});

describe("cuadrasEnPalabras", () => {
  it("escribe el número en letras hasta doce, que es lo que se camina", () => {
    expect(cuadrasEnPalabras(400)).toBe("cuatro cuadras");
    expect(cuadrasEnPalabras(100)).toBe("una cuadra");
  });

  it("de trece en adelante usa el número, porque en letras se vuelve ilegible", () => {
    expect(cuadrasEnPalabras(1500)).toBe("15 cuadras");
  });

  it("devuelve cadena vacía si no hay dato", () => {
    expect(cuadrasEnPalabras(null)).toBe("");
  });
});
