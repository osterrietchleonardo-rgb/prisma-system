// Las capas de Ciudad 3D como teselas vectoriales (MVT). Verificado 17-sep-2026: públicas,
// sin clave, zooms 12 a 19, gzip sin Content-Encoding. El decodificador es el de Mapbox.
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { gunzipSync } from "node:zlib";
import type { Feature } from "geojson";
import { unidadDesdeAltura } from "./codigo";
import type { Poligono, TipoVolumen, Unidad, VolumenOficial } from "./tipos";

export type Capa = "volumen_edif" | "lfi" | "lib" | "banda_minima" | "manzana" | "linea_oficial";
export interface Tesela { z: number; x: number; y: number }

export const URL_TESELAS = "https://vectortiles.usig.buenosaires.gob.ar/cur3d";
export const ZOOM_PARCELA = 17;

export function urlTesela(capa: Capa, t: Tesela): string {
  return `${URL_TESELAS}/${capa}/${t.z}/${t.x}/${t.y}.pbf`;
}

export function teselaDe(lng: number, lat: number, z: number): Tesela {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const la = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2) * n);
  return { z, x, y };
}

/** Todas las teselas que tocan el bbox [minLng, minLat, maxLng, maxLat]. Un lote cruza a lo sumo 4. */
export function teselasParaBBox(b: [number, number, number, number], z: number): Tesela[] {
  const a = teselaDe(b[0], b[3], z); // arriba-izquierda (lat mayor = y menor)
  const c = teselaDe(b[2], b[1], z); // abajo-derecha
  const out: Tesela[] = [];
  for (let x = a.x; x <= c.x; x++) for (let y = a.y; y <= c.y; y++) out.push({ z, x, y });
  return out;
}

export function descomprimir(buf: Uint8Array): Uint8Array {
  return buf[0] === 0x1f && buf[1] === 0x8b ? new Uint8Array(gunzipSync(buf)) : buf;
}

/** MVT → features GeoJSON (lon/lat). Todas las capas del GCBA usan una sola capa interna, "default". */
export function decodificar(buf: Uint8Array, t: Tesela): Feature[] {
  const tile = new VectorTile(new PbfReader(descomprimir(buf)));
  const out: Feature[] = [];
  for (const nombre of Object.keys(tile.layers)) {
    const capa = tile.layers[nombre];
    for (let i = 0; i < capa.length; i++) out.push(capa.feature(i).toGeoJSON(t.x, t.y, t.z) as Feature);
  }
  return out;
}

const TIPOS: TipoVolumen[] = ["cuerpo principal", "retiro 1", "retiro 2", "basamento"];
const UNIDADES_VALIDAS: Unidad[] = ["CA", "CM", "USAA", "USAM", "USAB2", "USAB1", "USAB0"];

/** Los polígonos de volumen_edif de UNA parcela, tipados. Lo que no se reconoce se descarta (y se cuenta aparte en avisos). */
export function volumenesDe(features: Feature[], smp: string): VolumenOficial[] {
  const clave = smp.toUpperCase();
  const out: VolumenOficial[] = [];
  for (const f of features) {
    const p = (f.properties || {}) as Record<string, unknown>;
    if (String(p.smp || "").toUpperCase() !== clave) continue;
    if (f.geometry.type !== "Polygon" && f.geometry.type !== "MultiPolygon") continue;
    const tipo = TIPOS.find((t) => t === p.tipo);
    const unidad = UNIDADES_VALIDAS.find((u) => u === p.edificabil) ?? unidadDesdeAltura(Number(p.altura_final));
    if (!tipo || !unidad) continue;
    out.push({ smp: clave, tipo, unidad, alturaInicial: Number(p.altura_inicial ?? 0), alturaFinal: Number(p.altura_final ?? p.altura_fin ?? 0), geom: f.geometry as Poligono });
  }
  return out;
}
