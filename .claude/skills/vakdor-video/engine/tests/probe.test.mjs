import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { probe } from "../lib/probe.mjs";
import { crearClipDePrueba, dirTemporal, borrarDirDePrueba } from "./helpers.mjs";

let dir, clip;
before(() => {
  dir = dirTemporal();
  clip = crearClipDePrueba({ segundos: 3, salida: path.join(dir, "clip.mp4") });
});
after(() => borrarDirDePrueba(dir));

test("probe devuelve duracion, fps, dimensiones y audio", async () => {
  const info = await probe(clip);
  assert.ok(Math.abs(info.durationSec - 3) < 0.2, `duracion rara: ${info.durationSec}`);
  assert.equal(info.fps, 30);
  assert.equal(info.width, 1920);
  assert.equal(info.height, 1080);
  assert.equal(info.hasAudio, true);
});

test("probe detecta cuando no hay audio", async () => {
  const mudo = crearClipDePrueba({ segundos: 1, conAudio: false, salida: path.join(dir, "mudo.mp4") });
  const info = await probe(mudo);
  assert.equal(info.hasAudio, false);
});

test("probe da un error claro si el archivo no existe", async () => {
  await assert.rejects(() => probe(path.join(dir, "no-existe.mp4")), /no existe/i);
});

test("probe respeta la rotacion: un celular vertical NO es horizontal", () => {
  // Un celular que graba en vertical guarda 3840x2160 y anota rotation=-90 aparte.
  // ffmpeg la aplica al decodificar, asi que el video SE VE 2160x3840. Si probe
  // devolviera lo que dice el stream, todo el encuadre corriente abajo saldria al
  // reves. Se simula con `transpose` + metadato, que es exactamente lo que hace un iPhone.
  const rotado = path.join(dir, "rotado.mp4");
  const r = spawnSync("ffmpeg", ["-y", "-v", "error",
    "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=1",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-metadata:s:v:0", "rotate=90", rotado],
    { encoding: "utf8" });
  assert.equal(r.status, 0, `ffmpeg fallo: ${r.stderr}`);

  const dims = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height", "-of", "csv=p=0", rotado], { encoding: "utf8" }).stdout.trim();
  assert.equal(dims, "640,360", "el stream guarda los pixeles apaisados");
});
