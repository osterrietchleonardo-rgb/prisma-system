import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { teselaDe, teselasParaBBox, decodificar, volumenesDe, urlTesela } from "./teselas";

const F = (n: string) => readFileSync(path.join(__dirname, "__fixtures__", n));

describe("matemática de teselas (Web Mercator, esquema XYZ)", () => {
  it("Roosevelt 4554 cae en la 17/44243/78964", () => {
    expect(teselaDe(-58.4808, -34.5703, 17)).toEqual({ z: 17, x: 44243, y: 78964 });
  });
  it("un bbox chico dentro de una tesela da una sola; uno que cruza el borde da las vecinas", () => {
    expect(teselasParaBBox([-58.4810, -34.5705, -58.4806, -34.5701], 17)).toHaveLength(1);
    expect(teselasParaBBox([-58.4830, -34.5720, -58.4780, -34.5690], 17).length).toBeGreaterThan(1);
  });
  it("arma la URL oficial", () => {
    expect(urlTesela("volumen_edif", { z: 17, x: 44243, y: 78964 })).toBe("https://vectortiles.usig.buenosaires.gob.ar/cur3d/volumen_edif/17/44243/78964.pbf");
  });
});

describe("decodificar la capa volumen_edif (viene gzip aunque el servidor no lo diga)", () => {
  const feats = decodificar(F("volumen_edif-17-44243-78964.pbf"), { z: 17, x: 44243, y: 78964 });
  it("devuelve features GeoJSON en lon/lat con las propiedades oficiales", () => {
    expect(feats.length).toBeGreaterThan(300);
    const f = feats.find((x) => x.properties?.smp === "053-050-006" && x.properties?.tipo === "cuerpo principal")!;
    expect(f).toBeDefined();
    expect(f.properties!.edificabil).toBe("USAM");
    expect(f.properties!.altura_final).toBe(17.2);
    const [lng, lat] = (f.geometry as any).coordinates[0][0];
    expect(lng).toBeGreaterThan(-58.49); expect(lng).toBeLessThan(-58.47);
    expect(lat).toBeGreaterThan(-34.58); expect(lat).toBeLessThan(-34.56);
  });
  it("volumenesDe filtra por smp y tipa unidad y tipo; ignora lo que no conoce", () => {
    const v = volumenesDe(feats, "053-050-006");
    expect(v.map((x) => x.tipo).sort()).toEqual(["cuerpo principal", "retiro 1", "retiro 2"]);
    expect(v.every((x) => x.unidad === "USAM")).toBe(true);
    expect(v.find((x) => x.tipo === "retiro 2")!.alturaInicial).toBe(20.2);
  });
  it("la parcela de Cabildo trae dos unidades, CM y CA, cada una con basamento", () => {
    const t = teselaDe(-58.456744, -34.562934, 17);
    const fc = decodificar(F(`volumen_edif-17-${t.x}-${t.y}.pbf`), t);
    const v = volumenesDe(fc, "039-097-008B");
    expect(new Set(v.map((x) => x.unidad))).toEqual(new Set(["CM", "CA"]));
    expect(v.filter((x) => x.tipo === "basamento")).toHaveLength(2);
  });
});
