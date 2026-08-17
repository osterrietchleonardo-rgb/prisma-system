import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { PRESETS_COLOR, filtroDeColor } from "../lib/grade.mjs";

const LOS_DIEZ = ["natural","cinematic","warm","cool","vintage","bw","highContrast","moody","golden","teal-orange"];

test("estan los 10 presets", () => {
  assert.deepEqual(Object.keys(PRESETS_COLOR).sort(), [...LOS_DIEZ].sort());
});

test("natural no oscurece: ni brillo negativo ni viñeta", () => {
  // Es el default. Su razon de ser es NO maquillar: `cinematic` cerraba a la mitad el
  // lado de la cara donde no da la luz (medido, ver lib/grade.mjs).
  const f = filtroDeColor("natural");
  assert.ok(!f.includes("brightness=-"), "no puede bajar el brillo");
  assert.ok(!f.includes("vignette"), "no puede poner viñeta");
  assert.ok(f.includes("curves="), "tiene que abrir las sombras con curves");
});

test("curves va antes que eq (reparte la luz primero, ajusta despues)", () => {
  const f = filtroDeColor("natural");
  assert.ok(f.indexOf("curves=") < f.indexOf("eq="), `orden equivocado: ${f}`);
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
for (const p of LOS_DIEZ) {
  test(`ffmpeg acepta el preset ${p}`, () => {
    const r = spawnSync("ffmpeg", [
      "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=1:duration=1",
      "-frames:v", "1", "-vf", filtroDeColor(p), "-f", "null", "-",
    ], { encoding: "utf8" });
    assert.equal(r.status, 0, `ffmpeg rechazo "${p}": ${r.stderr}`);
  });
}
