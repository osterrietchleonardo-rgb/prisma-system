import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { FORMATOS, ZONAS_SEGURAS, filtroDeFormato } from "../lib/reframe.mjs";
import { crearClipDePrueba, dirTemporal, borrarDirDePrueba } from "./helpers.mjs";

let dir, clip;
before(() => {
  dir = dirTemporal();
  clip = crearClipDePrueba({ segundos: 1, ancho: 1920, alto: 1080, salida: path.join(dir, "h.mp4") });
});
after(() => borrarDirDePrueba(dir));

test("los 4 formatos con sus medidas", () => {
  assert.deepEqual(Object.keys(FORMATOS).sort(), ["16:9", "1:1", "4:5", "9:16"]);
  assert.deepEqual(FORMATOS["9:16"], { ancho: 1080, alto: 1920 });
});

test("en vertical los subtitulos suben para esquivar la UI de las redes", () => {
  assert.ok(ZONAS_SEGURAS["9:16"].subtitulosY <= 0.62);
  assert.ok(ZONAS_SEGURAS["9:16"].evitarCentro);
  assert.ok(ZONAS_SEGURAS["16:9"].subtitulosY > 0.62);
});

test("un formato invalido da error claro", () => {
  assert.throws(() => filtroDeFormato({ anchoOrigen: 1920, altoOrigen: 1080, formato: "21:9" }), /no existe|valido/i);
});

// Lo que importa: que el video salga con las medidas exactas.
for (const [formato, medidas] of Object.entries(FORMATOS)) {
  test(`convertir 16:9 a ${formato} da ${medidas.ancho}x${medidas.alto}`, () => {
    const salida = path.join(dir, `out-${formato.replace(":", "x")}.mp4`);
    const vf = filtroDeFormato({ anchoOrigen: 1920, altoOrigen: 1080, formato });
    const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-i", clip, "-vf", vf,
      "-frames:v", "1", "-c:v", "libx264", "-pix_fmt", "yuv420p", salida], { encoding: "utf8" });
    assert.equal(r.status, 0, `ffmpeg fallo: ${r.stderr}`);
    const dims = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0",
      "-show_entries", "stream=width,height", "-of", "csv=p=0", salida], { encoding: "utf8" }).stdout.trim();
    assert.equal(dims, `${medidas.ancho},${medidas.alto}`);
  });
}
