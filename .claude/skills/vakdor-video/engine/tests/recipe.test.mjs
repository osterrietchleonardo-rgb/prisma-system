import { test } from "node:test";
import assert from "node:assert/strict";
import { cargarReceta, RECETA_DEFAULT } from "../lib/recipe.mjs";

const PALABRAS = [
  { texto: "hola", inicioSec: 0.5 },
  { texto: "trazabilidad", inicioSec: 12.4 },
  { texto: "control", inicioSec: 20.0 },
  { texto: "control", inicioSec: 35.5 },
];
const CTX = { durationSec: 60, palabras: PALABRAS };

test("aplica los valores por defecto", () => {
  const { receta } = cargarReceta({}, CTX);
  assert.equal(receta.formato, RECETA_DEFAULT.formato);
  assert.equal(receta.estilo, RECETA_DEFAULT.estilo);
  assert.deepEqual(receta.fx, []);
});

test("ancla un efecto a la palabra hablada", () => {
  const { receta } = cargarReceta({ fx: [{ palabra: "trazabilidad", tipo: "callout", texto: "X" }] }, CTX);
  assert.equal(receta.fx[0].t, 12.4);
});

test("ocurrencia elige cual repeticion", () => {
  const { receta } = cargarReceta({ fx: [{ palabra: "control", ocurrencia: 2, tipo: "callout", texto: "X" }] }, CTX);
  assert.equal(receta.fx[0].t, 35.5);
});

test("el anclaje no distingue mayusculas ni acentos", () => {
  const { receta } = cargarReceta({ fx: [{ palabra: "TRAZABILIDAD", tipo: "callout", texto: "X" }] }, CTX);
  assert.equal(receta.fx[0].t, 12.4);
});

test("palabra inexistente: se saltea con aviso, NO rompe", () => {
  const { receta, avisos } = cargarReceta({ fx: [{ palabra: "blockchain", tipo: "callout", texto: "X" }] }, CTX);
  assert.equal(receta.fx.length, 0);
  assert.match(avisos[0], /blockchain/);
});

test("tiempo fuera del video: se saltea con aviso", () => {
  const { receta, avisos } = cargarReceta({ fx: [{ t: 999, tipo: "callout", texto: "X" }] }, CTX);
  assert.equal(receta.fx.length, 0);
  assert.match(avisos[0], /999/);
});

test("formato invalido: error duro", () => {
  assert.throws(() => cargarReceta({ formato: "21:9" }, CTX), /formato/i);
});

test("preset de color invalido: error duro", () => {
  assert.throws(() => cargarReceta({ grade: { preset: "neon" } }, CTX), /neon/);
});

test("b-roll con archivo inexistente: error duro antes de renderizar", () => {
  assert.throws(() => cargarReceta({ broll: [{ t: 5, dur: 3, src: "no/existe.mp4" }] }, CTX), /no existe/i);
});
