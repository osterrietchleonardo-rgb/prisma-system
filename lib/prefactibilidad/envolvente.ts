// De los polígonos oficiales de volumen_edif a "cuánto se puede construir". Reglas:
//  - Un mismo polígono puede venir partido entre teselas: se une por (unidad, tipo).
//  - Se recorta al contorno del lote (las teselas traen un margen de dibujo).
//  - Niveles: cuerpo = pisosCuerpo de la unidad; retirado 1 y 2 = 1 nivel; basamento (CA/CM)
//    = 2 niveles (PB y 1º) pero solo aporta lo que EXCEDE al cuerpo, y el cuerpo pierde esos 2.
import { featureCollection, intersect, union } from "@turf/turf";
import type { Feature } from "geojson";
import { FACTOR_VENDIBLE, UNIDADES } from "./codigo";
import { anillosDe, areaPlanar, proyector } from "./geo";
import type { Edificabilidad, Planta, Poligono, Unidad, VolumenOficial } from "./tipos";

const f = (g: Poligono): Feature<Poligono> => ({ type: "Feature", properties: {}, geometry: g });

export function unirPedazos(geoms: Poligono[]): Poligono | null {
  if (geoms.length === 0) return null;
  if (geoms.length === 1) return geoms[0];
  const u = union(featureCollection(geoms.map(f)));
  return (u?.geometry as Poligono) ?? null;
}

export function recortarAlLote(geom: Poligono, lote: Poligono): Poligono | null {
  const r = intersect(featureCollection([f(geom), f(lote)]));
  return (r?.geometry as Poligono) ?? null;
}

/** m² planos alrededor de un origen; para un lote da lo mismo que turf.area con menos ruido. */
export function medirM2(geom: Poligono, origen: [number, number]): number {
  const p = proyector(origen);
  return anillosDe(geom).reduce((s, an) => s + areaPlanar(an.map((c) => p.aMetros(c))), 0);
}

function nombreCuerpo(niveles: number): string {
  return niveles <= 1 ? "Planta baja" : `Planta baja y ${niveles - 1} ${niveles - 1 === 1 ? "piso" : "pisos"}`;
}

export function calcularEdificabilidadOficial(volumenes: VolumenOficial[], lote: Poligono): Edificabilidad | null {
  if (!volumenes.some((v) => v.tipo === "cuerpo principal")) return null;
  const origen = anillosDe(lote)[0][0] as [number, number];
  const unidades = Array.from(new Set(volumenes.map((v) => v.unidad))) as Unidad[];
  const plantas: Planta[] = [];
  const huellas: Poligono[] = [];
  let alturaMaxima = 0, planoLimite = 0;

  for (const unidad of unidades) {
    const def = UNIDADES[unidad];
    const de = (tipo: VolumenOficial["tipo"]) => {
      const vs = volumenes.filter((v) => v.unidad === unidad && v.tipo === tipo);
      if (vs.length === 0) return null;
      const unido = unirPedazos(vs.map((v) => v.geom));
      const rec = unido ? recortarAlLote(unido, lote) : null;
      return { m2: rec ? medirM2(rec, origen) : 0, geom: rec, desde: Math.min(...vs.map((v) => v.alturaInicial)), hasta: Math.max(...vs.map((v) => v.alturaFinal)) };
    };
    const cuerpo = de("cuerpo principal");
    if (!cuerpo) continue;
    const bas = def.basamento ? de("basamento") : null;
    const nivelesCuerpo = bas ? def.pisosCuerpo - 2 : def.pisosCuerpo;
    if (bas) plantas.push({ nombre: "Basamento (PB y 1º piso)", unidad, m2PorNivel: Math.max(0, bas.m2), niveles: 2, desdeM: bas.desde, hastaM: bas.hasta });
    plantas.push({ nombre: bas ? `${nivelesCuerpo} pisos sobre el basamento` : nombreCuerpo(nivelesCuerpo), unidad, m2PorNivel: cuerpo.m2, niveles: nivelesCuerpo, desdeM: cuerpo.desde, hastaM: cuerpo.hasta });
    const r1 = de("retiro 1"), r2 = de("retiro 2");
    if (r1) plantas.push({ nombre: "Primer retirado", unidad, m2PorNivel: r1.m2, niveles: 1, desdeM: r1.desde, hastaM: r1.hasta });
    if (r2) plantas.push({ nombre: "Segundo retirado", unidad, m2PorNivel: r2.m2, niveles: 1, desdeM: r2.desde, hastaM: r2.hasta });
    if (cuerpo.geom) huellas.push(cuerpo.geom);
    alturaMaxima = Math.max(alturaMaxima, cuerpo.hasta);
    planoLimite = Math.max(planoLimite, r2?.hasta ?? r1?.hasta ?? cuerpo.hasta);
  }
  if (plantas.length === 0) return null;
  const m2Construibles = plantas.reduce((s, p) => s + p.m2PorNivel * p.niveles, 0);
  return {
    modo: "oficial", unidades, alturaMaxima, planoLimite, plantas,
    m2Construibles, m2Vendibles: m2Construibles * FACTOR_VENDIBLE,
    huella: unirPedazos(huellas),
  };
}
