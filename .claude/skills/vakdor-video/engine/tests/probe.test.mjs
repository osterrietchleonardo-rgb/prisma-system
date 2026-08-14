import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
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
