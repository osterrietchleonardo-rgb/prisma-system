// Todo lo que se le pide en vivo al GCBA. Verificado 11 y 17-sep-2026:
//  - USIG normalizar: dirección → coordenadas y nombre oficial de la calle.
//  - epok catastro/parcela y catastro/geometria (smp= lote; sm= manzana).
//  - Teselas de Ciudad 3D (Task 3).
// Siempre desde el servidor (certificados de usig.* y sin exponer nada), con User-Agent y
// timeout. Cualquier fallo de red o 5xx se convierte en GcbaNoResponde → mensaje amable.
import type { CatastroParcela, Poligono, VolumenOficial } from "./tipos";
import { decodificar, teselasParaBBox, urlTesela, volumenesDe, ZOOM_PARCELA, type Capa, type Tesela } from "./teselas";
import type { Feature, LineString, MultiLineString } from "geojson";

export const UA = "PRISMA-prefactibilidad/1.0 (inmobiliaria; contacto: osterrietchleonardo@vakdor.com)";
export const TIMEOUT_MS = 8000;
const USIG = "https://servicios.usig.buenosaires.gob.ar/normalizar/";
const EPOK = "https://epok.buenosaires.gob.ar/catastro";

export class GcbaNoResponde extends Error { constructor(m = "El catastro de la Ciudad no está respondiendo, probá en unos minutos") { super(m); this.name = "GcbaNoResponde"; } }

export interface DireccionUsig { direccion: string; calle: string; altura: number; codCalle: number; lat: number; lng: number; esCaba: boolean }

export interface ClienteGcba {
  normalizar(direccion: string, max?: number): Promise<DireccionUsig[]>;
  parcela(smp: string): Promise<CatastroParcela | null>;
  geometriaLote(smp: string): Promise<Poligono | null>;
  geometriaManzana(sm: string): Promise<Poligono | null>;
  volumenes(smp: string, bboxLote: [number, number, number, number]): Promise<VolumenOficial[]>;
  manzanaTipo(sm: string, bboxLote: [number, number, number, number]): Promise<"TIPICA" | "ATIPICA" | null>;
  esquinaOficial(smp: string, bboxLote: [number, number, number, number]): Promise<boolean>;
}

const num = (v: unknown): number | null => { const n = parseFloat(String(v ?? "")); return Number.isFinite(n) ? n : null; };

export function crearClienteGcba(fetchImpl: typeof fetch = fetch): ClienteGcba {
  async function pedir(url: string): Promise<Response> {
    let r: Response;
    try { r = await fetchImpl(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(TIMEOUT_MS) }); }
    catch { throw new GcbaNoResponde(); }
    if (r.status >= 500) throw new GcbaNoResponde();
    return r;
  }
  async function json(url: string): Promise<any | null> {
    const r = await pedir(url);
    if (!r.ok) return null;
    const t = await r.text();
    if (!t.trim() || t.trim() === "{}") return null;
    try { return JSON.parse(t); } catch { throw new GcbaNoResponde(); }
  }
  function geomDe(fc: any): Poligono | null {
    const g = fc?.features?.[0]?.geometry;
    return g && (g.type === "Polygon" || g.type === "MultiPolygon") ? g : null;
  }
  async function teselas(capa: Capa, bbox: [number, number, number, number]): Promise<Feature[]> {
    const ts: Tesela[] = teselasParaBBox(bbox, ZOOM_PARCELA);
    const partes = await Promise.all(ts.map(async (t) => {
      const r = await pedir(urlTesela(capa, t));
      if (!r.ok) return [] as Feature[];
      return decodificar(new Uint8Array(await r.arrayBuffer()), t);
    }));
    return partes.flat();
  }
  return {
    async normalizar(direccion, max = 5) {
      const j = await json(`${USIG}?direccion=${encodeURIComponent(direccion)}&geocodificar=true&maxOptions=${max}`);
      const lista: any[] = j?.direccionesNormalizadas ?? [];
      return lista.filter((d) => d.tipo === "calle_altura" && d.coordenadas).map((d) => ({
        direccion: d.direccion, calle: d.nombre_calle, altura: Number(d.altura), codCalle: Number(d.cod_calle),
        lat: parseFloat(d.coordenadas.y), lng: parseFloat(d.coordenadas.x), esCaba: String(d.cod_partido).toLowerCase() === "caba",
      }));
    },
    async parcela(smp) {
      const j = await json(`${EPOK}/parcela/?smp=${encodeURIComponent(smp)}`);
      if (!j?.smp) return null;
      return {
        smp: String(j.smp), direccion: String(j.direccion ?? ""),
        superficieTotal: num(j.superficie_total), superficieCubierta: num(j.superficie_cubierta),
        frente: num(j.frente), fondo: num(j.fondo), propiedadHorizontal: String(j.propiedad_horizontal).toLowerCase() === "si",
        pisosSobreRasante: num(j.pisos_sobre_rasante), unidadesFuncionales: num(j.unidades_funcionales),
        centroide: [Number(j.centroide?.[0]), Number(j.centroide?.[1])],
      };
    },
    async geometriaLote(smp) { return geomDe(await json(`${EPOK}/geometria/?smp=${encodeURIComponent(smp)}&srid=4326`)); },
    async geometriaManzana(sm) { return geomDe(await json(`${EPOK}/geometria/?sm=${encodeURIComponent(sm)}&srid=4326`)); },
    async volumenes(smp, bbox) { return volumenesDe(await teselas("volumen_edif", bbox), smp); },
    async manzanaTipo(sm, bbox) {
      const f = (await teselas("manzana", bbox)).find((x) => String(x.properties?.sm).toUpperCase() === sm.toUpperCase());
      const t = f?.properties?.tipo;
      return t === "TIPICA" || t === "ATIPICA" ? t : null;
    },
    async esquinaOficial(smp, bbox) {
      // Dos líneas oficiales con rumbo distinto (> 30°) = frente a dos calles = esquina o doble frente.
      const lineas = (await teselas("linea_oficial", bbox)).filter((x) => String(x.properties?.smp).toUpperCase() === smp.toUpperCase());
      const rumbos: number[] = [];
      for (const l of lineas) {
        const g = l.geometry as LineString | MultiLineString;
        const coords = g.type === "LineString" ? [g.coordinates] : g.coordinates;
        for (const c of coords) if (c.length >= 2) { const [a, b] = [c[0], c[c.length - 1]]; rumbos.push(((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI + 180) % 180); }
      }
      return rumbos.some((r1) => rumbos.some((r2) => Math.min(Math.abs(r1 - r2), 180 - Math.abs(r1 - r2)) > 30));
    },
  };
}
