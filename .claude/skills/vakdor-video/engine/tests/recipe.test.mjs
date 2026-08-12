import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cargarReceta, RECETA_DEFAULT } from "../lib/recipe.mjs";

const PALABRAS = [
  { texto: "hola", inicioSec: 0.5 },
  { texto: "trazabilidad", inicioSec: 12.4 },
  { texto: "control", inicioSec: 20.0 },
  { texto: "control", inicioSec: 35.5 },
  { texto: "público", inicioSec: 45.2 },
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

  // "público" se pronuncia con tilde; el anclaje debe encontrarlo sin ella.
  const { receta: receta2 } = cargarReceta({ fx: [{ palabra: "publico", tipo: "callout", texto: "X" }] }, CTX);
  assert.equal(receta2.fx[0].t, 45.2);
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

test("ocurrencia invalida (0): se saltea con aviso, NO rompe", () => {
  const { receta, avisos } = cargarReceta(
    { fx: [{ palabra: "control", ocurrencia: 0, tipo: "callout", texto: "X" }] },
    CTX
  );
  assert.equal(receta.fx.length, 0);
  assert.match(avisos[0], /ocurrencia/i);
});

test("el b-roll que sobrevive conserva un path absoluto en src", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "recipe-broll-abs-"));
  const rutaAbsoluta = path.join(dir, "clip.mp4");
  fs.writeFileSync(rutaAbsoluta, "contenido de prueba");
  const relativoAlCwd = path.relative(process.cwd(), rutaAbsoluta);

  const { receta } = cargarReceta({ broll: [{ t: 5, dur: 3, src: relativoAlCwd }] }, CTX);

  assert.equal(receta.broll.length, 1);
  assert.ok(path.isAbsolute(receta.broll[0].src), "src deberia quedar absoluto tras resolver el tiempo");
  assert.equal(receta.broll[0].src, rutaAbsoluta);
});

test("el baseDir de un b-roll relativo depende de si el origen es un path o un objeto", () => {
  const dirReceta = fs.mkdtempSync(path.join(os.tmpdir(), "recipe-basedir-receta-"));
  const dirCwd = fs.mkdtempSync(path.join(os.tmpdir(), "recipe-basedir-cwd-"));
  const nombreArchivo = "clip.mp4";
  // Dos archivos distintos con el mismo nombre relativo, en dos carpetas distintas,
  // para probar que cada origen resuelve contra una carpeta distinta de verdad.
  fs.writeFileSync(path.join(dirReceta, nombreArchivo), "version-receta");
  fs.writeFileSync(path.join(dirCwd, nombreArchivo), "version-cwd");

  const rutaReceta = path.join(dirReceta, "receta.json");
  fs.writeFileSync(rutaReceta, JSON.stringify({ broll: [{ t: 5, dur: 3, src: nombreArchivo }] }));

  // Origen = path de archivo: el relativo se resuelve contra el directorio de la receta.
  const { receta: recetaDesdeArchivo } = cargarReceta(rutaReceta, CTX);
  assert.equal(recetaDesdeArchivo.broll[0].src, path.join(dirReceta, nombreArchivo));

  // Origen = objeto: el relativo se resuelve contra el cwd del proceso.
  const cwdOriginal = process.cwd();
  process.chdir(dirCwd);
  try {
    const { receta: recetaDesdeObjeto } = cargarReceta({ broll: [{ t: 5, dur: 3, src: nombreArchivo }] }, CTX);
    assert.equal(recetaDesdeObjeto.broll[0].src, path.join(dirCwd, nombreArchivo));
    assert.notEqual(recetaDesdeObjeto.broll[0].src, recetaDesdeArchivo.broll[0].src);
  } finally {
    process.chdir(cwdOriginal);
  }
});
