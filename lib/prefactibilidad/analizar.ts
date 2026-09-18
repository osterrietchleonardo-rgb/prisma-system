// El camino completo de una parcela, sin saber nada de HTTP ni de Supabase: recibe las
// dependencias y devuelve el informe. Así se prueba entero con fixtures.
import { armarAvisos } from "./avisos";
import { unidadDesdeAltura } from "./codigo";
import { calcularEdificabilidadOficial } from "./envolvente";
import type { ClienteGcba } from "./gcba";
import { bboxDe } from "./geo";
import { edificabilidadPorRegla } from "./lfi-regla";
import { RADIO_M, valorTierra } from "./tierra";
import type { CatastroParcela, Edificabilidad, FilaCur, Poligono, Prefactibilidad, TerrenoCerca, VolumenOficial } from "./tipos";

export class ParcelaNoEncontrada extends Error { constructor() { super("No encontramos ese número. Probá con otro número de la misma cuadra"); this.name = "ParcelaNoEncontrada"; } }

export interface CacheParcela {
  smp: string; geomLote: Poligono; geomManzana: Poligono | null; catastro: CatastroParcela;
  volumenes: VolumenOficial[]; manzanaTipo: "TIPICA" | "ATIPICA" | null; esquinaOficial: boolean;
}

export interface Dependencias {
  gcba: ClienteGcba;
  curDe(smp: string): Promise<FilaCur | null>;
  puertaEsquina(smp: string): Promise<boolean | null>;
  terrenosCerca(lat: number, lng: number, radioM: number): Promise<TerrenoCerca[]>;
  cache: { leer(smp: string): Promise<CacheParcela | null>; guardar(c: CacheParcela): Promise<void> };
  ahora?: () => Date;
}

async function traerDelGcba(smp: string, gcba: ClienteGcba): Promise<CacheParcela> {
  const catastro = await gcba.parcela(smp);
  const geomLote = catastro ? await gcba.geometriaLote(smp) : null;
  if (!catastro || !geomLote) throw new ParcelaNoEncontrada();
  const sm = smp.slice(0, smp.lastIndexOf("-")); // la manzana puede tener letra: 042-077A
  const bbox = bboxDe(geomLote);
  const [geomManzana, volumenes, manzanaTipo, esquinaOficial] = await Promise.all([
    gcba.geometriaManzana(sm), gcba.volumenes(smp, bbox), gcba.manzanaTipo(sm, bbox), gcba.esquinaOficial(smp, bbox),
  ]);
  return { smp, geomLote, geomManzana, catastro, volumenes, manzanaTipo, esquinaOficial };
}

export async function analizarParcela(smp: string, direccion: string, deps: Dependencias): Promise<Prefactibilidad> {
  const clave = smp.toLowerCase();
  let datos = await deps.cache.leer(clave);
  if (!datos) { datos = await traerDelGcba(clave, deps.gcba); await deps.cache.guardar(datos); }
  const [cur, esquinaPuerta] = await Promise.all([deps.curDe(clave), deps.puertaEsquina(clave)]);

  let edificabilidad: Edificabilidad | null = calcularEdificabilidadOficial(datos.volumenes, datos.geomLote);
  const oficial = edificabilidad !== null;
  if (!edificabilidad) {
    const unidad = cur?.uniEdif[0] ? unidadDesdeAltura(cur.uniEdif[0]) : null;
    if (unidad && datos.geomManzana) edificabilidad = edificabilidadPorRegla(datos.geomLote, datos.geomManzana, unidad);
  }
  const avisos = armarAvisos({ cur, lote: datos.catastro, manzanaTipo: datos.manzanaTipo, esEsquina: Boolean(esquinaPuerta) || datos.esquinaOficial, edificabilidad: oficial ? edificabilidad : null });
  if (!edificabilidad) {
    // Sin envolvente oficial y sin regla (sin fila de CUR o sin geometría de manzana): no hay
    // rango que mostrar. Dejar `rango` sin definir para que la ficha diga "sin dato" en vez de
    // "0 m² a 0 m²" (Important 2 del review final).
    edificabilidad = { modo: "regla", unidades: [], alturaMaxima: 0, planoLimite: 0, plantas: [], m2Construibles: 0, m2Vendibles: 0, huella: null };
  }

  const [lng, lat] = datos.catastro.centroide;
  const terrenos = await deps.terrenosCerca(lat, lng, RADIO_M);
  const tierra = valorTierra(terrenos, datos.catastro.superficieTotal ?? 0);

  return {
    direccion, smp: clave, lote: datos.catastro, geomLote: datos.geomLote, geomManzana: datos.geomManzana,
    manzanaTipo: datos.manzanaTipo, cur, edificabilidad, avisos, tierra,
    fuentes: { curPublicado: cur?.publicado ?? null, consultadoEn: (deps.ahora ?? (() => new Date()))().toISOString() },
  };
}
