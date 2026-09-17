import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { crearClienteGcba, GcbaNoResponde } from "./gcba";

const fx = (n: string) => readFileSync(path.join(__dirname, "__fixtures__", n));
const USIG = JSON.stringify({ direccionesNormalizadas: [{ altura: 4554, cod_calle: 3005, cod_partido: "caba", coordenadas: { srid: 4326, x: "-58.480800", y: "-34.570300" }, direccion: "ROOSEVELT FRANKLIN D. 4554, CABA", nombre_calle: "ROOSEVELT FRANKLIN D.", nombre_partido: "CABA", tipo: "calle_altura" }] });

function fetchFalso(caido = false) {
  return vi.fn(async (url: string) => {
    if (caido) throw new Error("ECONNRESET");
    if (url.includes("/normalizar/")) return new Response(USIG, { status: 200 });
    if (url.includes("/catastro/parcela/")) return new Response(fx("053-050-006.parcela.json"), { status: 200 });
    if (url.includes("/catastro/geometria/?smp=")) return new Response(fx("053-050-006.lote.geojson"), { status: 200 });
    if (url.includes("/catastro/geometria/?sm=")) return new Response(fx("053-050.manzana.geojson"), { status: 200 });
    const m = url.match(/cur3d\/(\w+)\/17\/(\d+)\/(\d+)\.pbf/);
    if (m) { try { return new Response(fx(`${m[1]}-17-${m[2]}-${m[3]}.pbf`), { status: 200 }); } catch { return new Response("", { status: 404 }); } }
    return new Response("", { status: 404 });
  }) as unknown as typeof fetch;
}
const BBOX: [number, number, number, number] = [-58.4811, -34.5706, -58.4805, -34.5700];

describe("cliente del GCBA", () => {
  it("normalizar: dirección, calle, altura, coordenadas y si es CABA", async () => {
    const c = crearClienteGcba(fetchFalso());
    const d = await c.normalizar("Roosevelt 4554");
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ calle: "ROOSEVELT FRANKLIN D.", altura: 4554, esCaba: true });
    expect(d[0].lng).toBeCloseTo(-58.4808, 4);
  });
  it("parcela del catastro tipada", async () => {
    const p = (await crearClienteGcba(fetchFalso()).parcela("053-050-006"))!;
    expect(p.smp).toBe("053-050-006");
    expect(p.superficieTotal).toBeGreaterThan(300);
    expect(typeof p.propiedadHorizontal).toBe("boolean");
    expect(p.centroide[0]).toBeLessThan(-58);
  });
  it("geometrías del lote y la manzana como Polygon/MultiPolygon", async () => {
    const c = crearClienteGcba(fetchFalso());
    expect((await c.geometriaLote("053-050-006"))!.type).toMatch(/Polygon/);
    expect((await c.geometriaManzana("053-050"))!.type).toMatch(/Polygon/);
  });
  it("volúmenes oficiales de la parcela desde las teselas del bbox; tipo de manzana", async () => {
    const c = crearClienteGcba(fetchFalso());
    const v = await c.volumenes("053-050-006", BBOX);
    expect(v.map((x) => x.tipo).sort()).toEqual(["cuerpo principal", "retiro 1", "retiro 2"]);
    expect(await c.manzanaTipo("053-050", BBOX)).toBe("TIPICA");
  });
  it("todas las llamadas llevan User-Agent y timeout", async () => {
    const f = fetchFalso();
    await crearClienteGcba(f).parcela("053-050-006");
    const [, init] = (f as any).mock.calls[0];
    expect(init.headers["User-Agent"]).toContain("PRISMA");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
  it("si el GCBA no responde, tira GcbaNoResponde (no un error genérico)", async () => {
    await expect(crearClienteGcba(fetchFalso(true)).parcela("053-050-006")).rejects.toBeInstanceOf(GcbaNoResponde);
  });

  // esquinaOficial: evidencia real sacada de las teselas de linea_oficial que ya tenemos como
  // fixture (decodificadas con `decodificar` y agrupadas por smp, igual que hace gcba.ts).
  //
  // - 053-050-006 (Roosevelt 4554, medio de cuadra, tesela 17/44243/78964): UNA sola línea
  //   oficial, rumbo 31.18°. Un solo rumbo nunca puede superar el umbral de 30° contra sí
  //   mismo → no es esquina.
  // - 053-050-025 (misma tesela 17/44243/78964, misma manzana 053-050 que Roosevelt): una
  //   línea oficial MultiLineString con dos tramos, rumbos 30.03° y 131.60° — difieren 101.57°
  //   (o 78.43° por el otro lado del semicírculo), muy por encima de 30° → SÍ es esquina.
  // - Se probó primero Cabildo 2040 (039-097-008B, tesela 17/44252/78960) como pedía el
  //   reviewer: su línea oficial también es un MultiLineString de dos tramos, pero con rumbos
  //   130.47° y 130.56° (casi paralelos, difieren <0.1°) → NO califica, pese a tener puertas
  //   sobre dos calles (Cabildo y Ciudad de la Paz) en el padrón de catastro. Se descartó y se
  //   usó 053-050-025, que sí tiene evidencia real de esquina en la propia tesela.
  it("esquinaOficial: Roosevelt 4554 es medio de cuadra (un solo rumbo) → false", async () => {
    const c = crearClienteGcba(fetchFalso());
    expect(await c.esquinaOficial("053-050-006", BBOX)).toBe(false);
  });
  it("esquinaOficial: la parcela 053-050-025 tiene dos rumbos reales (30° y 132°) → true", async () => {
    const c = crearClienteGcba(fetchFalso());
    const bboxEsquina: [number, number, number, number] = [-58.4806, -34.5707, -58.4801, -34.5701];
    expect(await c.esquinaOficial("053-050-025", bboxEsquina)).toBe(true);
  });
});
