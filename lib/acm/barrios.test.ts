import { describe, it, expect } from "vitest";
import { acmNorm, claveBarrio, barrioReconocido, filtrarBarrios, type BarrioOpcion } from "./barrios";

const OPCIONES: BarrioOpcion[] = [
  { clave: "villa del parque", nombre: "Villa del Parque", avisos: 1240 },
  { clave: "villa crespo", nombre: "Villa Crespo", avisos: 3561 },
  { clave: "villa devoto", nombre: "Villa Devoto", avisos: 900 },
  { clave: "nunez", nombre: "Núñez", avisos: 3779 },
  { clave: "la lucila - villa adelina", nombre: "La Lucila - Villa Adelina", avisos: 80 },
  { clave: "barrio los bosquecitos", nombre: "Barrio Los Bosquecitos", avisos: 0, propio: true },
];

describe("acmNorm — tiene que dar lo mismo que la función acm_norm de Postgres", () => {
  it("pasa a minúsculas", () => {
    expect(acmNorm("BELGRANO")).toBe("belgrano");
  });

  it("saca los acentos de las vocales", () => {
    expect(acmNorm("Núñez")).toBe("nunez");
    expect(acmNorm("Constitución")).toBe("constitucion");
  });

  it("convierte la ñ y la ç, que es lo que hace el translate de la base", () => {
    expect(acmNorm("Ñandú")).toBe("nandu");
    expect(acmNorm("Curaçao")).toBe("curacao");
  });

  it("trata null y undefined como cadena vacía", () => {
    expect(acmNorm(null)).toBe("");
    expect(acmNorm(undefined)).toBe("");
  });

  it("NO hace trim, igual que la función de la base", () => {
    expect(acmNorm("  Belgrano  ")).toBe("  belgrano  ");
  });
});

describe("claveBarrio", () => {
  it("recorta los espacios que el asesor deja de más al tipear", () => {
    expect(claveBarrio("  Villa del Parque ")).toBe("villa del parque");
  });
});

describe("barrioReconocido", () => {
  it("reconoce un barrio del catálogo aunque venga con otra capitalización o acentos", () => {
    expect(barrioReconocido("VILLA DEL PARQUE", OPCIONES)).toBe(true);
    expect(barrioReconocido("Nuñez", OPCIONES)).toBe(true);
  });

  it("NO reconoce el caso que originó todo esto: el número de la calle en el campo barrio", () => {
    expect(barrioReconocido("4464", OPCIONES)).toBe(false);
  });

  it("NO reconoce un barrio mal escrito", () => {
    expect(barrioReconocido("vill devoto", OPCIONES)).toBe(false);
  });

  it("el campo vacío no se marca como desconocido — todavía no escribió nada", () => {
    expect(barrioReconocido("", OPCIONES)).toBe(true);
    expect(barrioReconocido("   ", OPCIONES)).toBe(true);
  });

  it("reconoce un barrio propio de la cartera aunque no tenga avisos en la red", () => {
    expect(barrioReconocido("Barrio Los Bosquecitos", OPCIONES)).toBe(true);
  });
});

describe("filtrarBarrios", () => {
  it("sin texto devuelve todo, con los de más avisos primero", () => {
    const r = filtrarBarrios("", OPCIONES);
    expect(r).toHaveLength(OPCIONES.length);
    expect(r[0].nombre).toBe("Núñez");
  });

  it("prioriza los que EMPIEZAN con lo tipeado sobre los que solo lo contienen", () => {
    const r = filtrarBarrios("villa", OPCIONES);
    expect(r[r.length - 1].nombre).toBe("La Lucila - Villa Adelina");
    expect(r.slice(0, 3).every((o) => o.clave.startsWith("villa"))).toBe(true);
  });

  it("busca ignorando acentos", () => {
    expect(filtrarBarrios("núñez", OPCIONES).map((o) => o.nombre)).toEqual(["Núñez"]);
  });

  it("no devuelve nada para un texto que no existe", () => {
    expect(filtrarBarrios("4464", OPCIONES)).toEqual([]);
  });

  it("respeta el tope para no dibujar 600 filas de una", () => {
    expect(filtrarBarrios("", OPCIONES, 2)).toHaveLength(2);
  });
});
