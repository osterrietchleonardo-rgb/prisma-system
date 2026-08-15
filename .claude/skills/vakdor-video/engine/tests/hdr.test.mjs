import { test } from "node:test";
import assert from "node:assert/strict";
import { esHDR, filtroDeTonemap, argsDeColorDeSalida } from "../lib/hdr.mjs";

// Los metadatos exactos de un .mov de celular real (el que destapo el problema):
// "Video reel 2.mov", 3840x2160, yuv420p10le.
const HLG_CELULAR = { space: "bt2020nc", transfer: "arib-std-b67", primaries: "bt2020", range: "tv" };
const PQ = { space: "bt2020nc", transfer: "smpte2084", primaries: "bt2020", range: "tv" };
const SDR = { space: "bt709", transfer: "bt709", primaries: "bt709", range: "tv" };

test("un .mov HLG de celular se reconoce como HDR", () => {
  assert.equal(esHDR(HLG_CELULAR), true);
});

test("un HDR10 (PQ) tambien se reconoce como HDR", () => {
  assert.equal(esHDR(PQ), true);
});

test("un video SDR normal no se toma por HDR", () => {
  assert.equal(esHDR(SDR), false);
});

test("un video sin metadatos de color no se toma por HDR", () => {
  assert.equal(esHDR({ space: null, transfer: null, primaries: null, range: null }), false);
  assert.equal(esHDR(undefined), false);
});

test("con primarios bt2020 pero sin transferencia marcada, igual se trata como HDR", () => {
  assert.equal(esHDR({ space: "bt2020nc", transfer: null, primaries: "bt2020", range: "tv" }), true);
});

test("un video SDR no paga ni un filtro: la cadena queda vacia", () => {
  assert.equal(filtroDeTonemap(SDR), "");
});

test("un HDR arma la cadena de tonemap completa", () => {
  const f = filtroDeTonemap(HLG_CELULAR);
  assert.ok(f.includes("zscale=t=linear"), "falta pasar a luz lineal");
  assert.ok(f.includes("tonemap=hable"), "falta el tonemap");
  assert.ok(f.includes("zscale=t=bt709:m=bt709:r=tv"), "falta volver a bt709 rango TV");
  // Sin desat=0 el default de ffmpeg (desat=2) desatura las altas y deja la piel gris.
  assert.ok(f.includes("desat=0"), "el tonemap no deberia desaturar las altas");
});

test("el orden de la cadena es el unico que da un resultado correcto", () => {
  const f = filtroDeTonemap(HLG_CELULAR);
  const lineal = f.indexOf("zscale=t=linear");
  const mapeo = f.indexOf("tonemap=");
  const vuelta = f.indexOf("zscale=t=bt709");
  assert.ok(lineal < mapeo && mapeo < vuelta,
    `esperaba lineal < tonemap < bt709, dio ${lineal},${mapeo},${vuelta}`);
});

test('el modo "no" apaga la conversion aunque el video sea HDR', () => {
  assert.equal(filtroDeTonemap(HLG_CELULAR, { modo: "no" }), "");
});

test("las etiquetas de color de salida solo se escriben si hubo tonemap", () => {
  // Si el video ya era SDR no sabemos que era: no hay que inventarle etiquetas.
  assert.deepEqual(argsDeColorDeSalida(false), []);
  const args = argsDeColorDeSalida(true);
  assert.ok(args.includes("-color_trc") && args.includes("bt709"));
  assert.ok(args.includes("-colorspace"));
  assert.ok(args.includes("-color_range") && args.includes("tv"));
});
