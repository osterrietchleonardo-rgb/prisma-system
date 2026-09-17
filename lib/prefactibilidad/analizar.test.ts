import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { analizarParcela, ParcelaNoEncontrada, type Dependencias } from "./analizar";
import { crearClienteGcba } from "./gcba";
import type { TerrenoCerca } from "./tipos";

const fx = (n: string) => readFileSync(path.join(__dirname, "__fixtures__", n));
const fetchFalso = vi.fn(async (url: string) => {
  if (url.includes("/catastro/parcela/")) return new Response(fx("053-050-006.parcela.json"));
  if (url.includes("/catastro/geometria/?smp=")) return new Response(fx("053-050-006.lote.geojson"));
  if (url.includes("/catastro/geometria/?sm=")) return new Response(fx("053-050.manzana.geojson"));
  const m = url.match(/cur3d\/(\w+)\/17\/(\d+)\/(\d+)\.pbf/);
  if (m) { try { return new Response(fx(`${m[1]}-17-${m[2]}-${m[3]}.pbf`)); } catch { return new Response("", { status: 404 }); } }
  return new Response("", { status: 404 });
}) as unknown as typeof fetch;

let n = 0;
const terreno = (precioUsd: number, superficieM2: number, distanciaM: number): TerrenoCerca => ({ id: ++n, titulo: "Lote", direccion: null, barrio: "Villa Urquiza", precioUsd, superficieM2, distanciaM, url: "u", foto: null });
const CINCO = [terreno(200000, 300, 100), terreno(250000, 300, 200), terreno(180000, 300, 300), terreno(220000, 300, 400), terreno(260000, 300, 500)];

function deps(extra: Partial<Dependencias> = {}): Dependencias & { guardados: any[] } {
  const guardados: any[] = [];
  return {
    gcba: crearClienteGcba(fetchFalso),
    curDe: async () => ({ smp: "053-050-006", uniEdif: [17.2], planoL: 24.2, tipoMza: "TIPICA", catalogado: 0, distGrp: null, distEsp: null, distCpu: "R2b I", barrio: "VILLA URQUIZA", comuna: "12", publicado: "2026-06-24" }),
    puertaEsquina: async () => false,
    terrenosCerca: async () => CINCO,
    cache: { leer: async () => null, guardar: async (c) => { guardados.push(c); } },
    ahora: () => new Date("2026-09-18T12:00:00Z"),
    guardados,
    ...extra,
  };
}

describe("analizarParcela: de la parcela al informe", () => {
  it("Roosevelt 4554: modo oficial, sin avisos, 6 niveles de 261 m², valor de la tierra por 5 terrenos, y guarda la caché", async () => {
    const d = deps();
    const r = await analizarParcela("053-050-006", "Roosevelt Franklin D. 4554", d);
    expect(r.edificabilidad.modo).toBe("oficial");
    expect(r.edificabilidad.plantas[0].niveles).toBe(6);
    expect(r.edificabilidad.plantas[0].m2PorNivel).toBeCloseTo(261, -1);
    expect(r.avisos).toEqual([]);
    expect(r.tierra!.comparables).toHaveLength(5);
    expect(r.tierra!.valorLote.mediana).toBe(Math.round((220000 / 300) * r.lote.superficieTotal!));
    expect(r.fuentes.curPublicado).toBe("2026-06-24");
    expect(d.guardados).toHaveLength(1);
    expect(d.guardados[0].smp).toBe("053-050-006");
  });
  it("con caché no le pide nada al GCBA", async () => {
    const d1 = deps();
    await analizarParcela("053-050-006", "x", d1);
    const llamadas = (fetchFalso as any).mock.calls.length;
    const d2 = deps({ cache: { leer: async () => d1.guardados[0], guardar: async () => {} } });
    await analizarParcela("053-050-006", "x", d2);
    expect((fetchFalso as any).mock.calls.length).toBe(llamadas);
  });
  it("menos de 5 terrenos → tierra null", async () => {
    const r = await analizarParcela("053-050-006", "x", deps({ terrenosCerca: async () => CINCO.slice(0, 3) }));
    expect(r.tierra).toBeNull();
  });
  it("sin envolvente oficial → modo regla con rango y aviso fuerte", async () => {
    const gcba = crearClienteGcba(fetchFalso);
    const r = await analizarParcela("053-050-006", "x", deps({ gcba: { ...gcba, volumenes: async () => [] } }));
    expect(r.edificabilidad.modo).toBe("regla");
    expect(r.edificabilidad.rango!.piso).toBeGreaterThan(0);
    expect(r.avisos.map((a) => a.clave)).toContain("sin_envolvente");
  });
  it("parcela inexistente → ParcelaNoEncontrada", async () => {
    const gcba = crearClienteGcba(fetchFalso);
    await expect(analizarParcela("999-999-999", "x", deps({ gcba: { ...gcba, parcela: async () => null } }))).rejects.toBeInstanceOf(ParcelaNoEncontrada);
  });
});
