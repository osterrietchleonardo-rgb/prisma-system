import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { PRESETS_COLOR, filtroDeColor } from "../lib/grade.mjs";

const LOS_NUEVE = ["cinematic","warm","cool","vintage","bw","highContrast","moody","golden","teal-orange"];

test("estan los 9 presets", () => {
  assert.deepEqual(Object.keys(PRESETS_COLOR).sort(), [...LOS_NUEVE].sort());
});

test("sin preset devuelve cadena vacia", () => {
  assert.equal(filtroDeColor(null), "");
  assert.equal(filtroDeColor("ninguno"), "");
});

test("un preset inventado da error claro", () => {
  assert.throws(() => filtroDeColor("neon"), /no existe|desconocido/i);
});

test("vignette se puede forzar aunque el preset no lo traiga", () => {
  assert.ok(filtroDeColor("warm", { vignette: true }).includes("vignette"));
  assert.ok(!filtroDeColor("cinematic", { vignette: false }).includes("vignette"));
});

// La prueba que importa: que ffmpeg acepte de verdad cada filtro.
for (const p of LOS_NUEVE) {
  test(`ffmpeg acepta el preset ${p}`, () => {
    const r = spawnSync("ffmpeg", [
      "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=1:duration=1",
      "-frames:v", "1", "-vf", filtroDeColor(p), "-f", "null", "-",
    ], { encoding: "utf8" });
    assert.equal(r.status, 0, `ffmpeg rechazo "${p}": ${r.stderr}`);
  });
}
