import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { detectarSilencios, cortarSilencios } from "../lib/cut.mjs";
import { dirTemporal } from "./helpers.mjs";

let dir, conSilencio;
before(() => {
  dir = dirTemporal();
  // 2s de tono, 2s de silencio, 2s de tono
  conSilencio = path.join(dir, "silencios.mp4");
  const r = spawnSync("ffmpeg", ["-y", "-v", "error",
    "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=6",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=6",
    "-af", "volume=enable='between(t,2,4)':volume=0",
    "-c:v", "libx264", "-crf", "28", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", conSilencio],
    { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
});
after(() => fs.rmSync(dir, { recursive: true, force: true }));

test("detecta el silencio del medio", async () => {
  const sil = await detectarSilencios({ entrada: conSilencio, db: -30, min: 0.5 });
  assert.ok(sil.length >= 1, "tendria que encontrar al menos un silencio");
  const [ini, fin] = sil[0];
  assert.ok(ini > 1.5 && ini < 2.5, `el silencio arranca raro: ${ini}`);
  assert.ok(fin > 3.5 && fin < 4.5, `el silencio termina raro: ${fin}`);
});

test("cortar deja el video mas corto y con los tramos buenos", async () => {
  const salida = path.join(dir, "cortado.mp4");
  const r = await cortarSilencios({ entrada: conSilencio, salida, db: -30, min: 0.5, pad: 0.1 });
  assert.ok(r.duracionFinal < 5.5, `no acorto: ${r.duracionFinal}`);
  assert.ok(r.duracionFinal > 3.5, `corto de mas: ${r.duracionFinal}`);
  assert.equal(r.tramos.length, 2);
});
