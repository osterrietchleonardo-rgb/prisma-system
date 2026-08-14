import { test } from "node:test";
import assert from "node:assert/strict";
import { ENCODERS, probarEncoder, elegirEncoder } from "../lib/encoder.mjs";

test("el orden de preferencia arranca por GPU y termina en CPU", () => {
  assert.equal(ENCODERS[0].nombre, "h264_amf");
  assert.equal(ENCODERS.at(-1).nombre, "libx264");
  assert.equal(ENCODERS.at(-1).esGpu, false);
});

test("libx264 siempre esta disponible", async () => {
  assert.equal(await probarEncoder("libx264"), true);
});

test("un encoder inventado da false, no explota", async () => {
  assert.equal(await probarEncoder("h264_inventado"), false);
});

test("elegirEncoder devuelve uno que funciona", async () => {
  const e = await elegirEncoder({});
  assert.ok(ENCODERS.some((x) => x.nombre === e.nombre));
  assert.ok(Array.isArray(e.args));
});

test("forzar un encoder inexistente da error claro, no cae a CPU en silencio", async () => {
  await assert.rejects(() => elegirEncoder({ forzar: "h264_inventado" }), /no funciona|no esta disponible/i);
});
