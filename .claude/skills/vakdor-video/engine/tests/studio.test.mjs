import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parsearArgs } from "../studio.mjs";
import { crearClipDePrueba, dirTemporal } from "./helpers.mjs";

const STUDIO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "studio.mjs");
let dir, clip, clipLargo;
before(() => {
  dir = dirTemporal();
  clip = crearClipDePrueba({ segundos: 8, salida: path.join(dir, "in.mp4") });
  // Clip mas largo que la ventana de preview (20s), chico en resolucion para que
  // el render extra no vuelva lenta la prueba. Sirve para verificar que el recorte
  // de preview arranca EXACTO donde se pide y no en el keyframe mas cercano.
  clipLargo = crearClipDePrueba({ segundos: 30, ancho: 640, alto: 360, salida: path.join(dir, "largo.mp4") });
});
after(() => fs.rmSync(dir, { recursive: true, force: true }));

const archivosResiduales = (d) => fs.readdirSync(d).filter((f) => f.startsWith(".preview-fuente"));

test("parsea flags con y sin valor", () => {
  const a = parsearArgs(["--in=x.mp4", "--formato=9:16", "--check"]);
  assert.equal(a.in, "x.mp4");
  assert.equal(a.formato, "9:16");
  assert.equal(a.check, true);
});

test("--check valida sin renderizar y no deja archivos temporales", () => {
  const salida = path.join(dir, "no-deberia-existir.mp4");
  const r = spawnSync("node", [STUDIO, `--in=${clip}`, `--out=${salida}`, "--check"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /receta|grafo/i);
  assert.equal(fs.existsSync(salida), false, "--check no tiene que escribir el video");
  assert.deepEqual(archivosResiduales(dir), [], "--check no tiene que dejar temporales de preview");
});

test("--check falla con codigo != 0 si la receta esta mal", () => {
  const receta = path.join(dir, "mala.json");
  fs.writeFileSync(receta, JSON.stringify({ formato: "21:9" }));
  const r = spawnSync("node", [STUDIO, `--in=${clip}`, `--out=${path.join(dir, "x.mp4")}`,
    `--receta=${receta}`, "--check"], { encoding: "utf8" });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /21:9/);
});

test("--preview con un clip mas corto que la ventana no revienta y se recorta al largo real", () => {
  // OJO: la ventana de preview mide 20s y este clip dura 8s, asi que la ventana
  // pedida (--preview=4) NO puede terminar siendo "corta" respecto del propio
  // clip: como mucho, puede cubrirlo entero. Afirmar "dur < 8" aca es una
  // premisa que no puede sostenerse (el clip mide 8s) — la verificacion real de
  // que la ventana efectivamente recorta un tramo corto vive en la prueba de
  // abajo con `clipLargo`, donde el video es mas largo que la ventana.
  const salida = path.join(dir, "prev.mp4");
  const r = spawnSync("node", [STUDIO, `--in=${clip}`, `--out=${salida}`, "--preview=4"],
    { encoding: "utf8", timeout: 180000 });
  assert.equal(r.status, 0, r.stderr);
  const dur = Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration",
    "-of", "csv=p=0", salida], { encoding: "utf8" }).stdout.trim());
  assert.ok(Math.abs(dur - 8) < 0.5, `la ventana no puede pasarse del largo real del clip (8s), dio ${dur}s`);
  assert.deepEqual(archivosResiduales(dir), [], "el recorte temporal de preview tiene que borrarse");
});

test("--preview arranca EXACTO en la ventana pedida, no en el keyframe mas cercano", () => {
  // Con un clip de 30s y --preview=15, la ventana pedida es 5s..25s (20s de ancho).
  // Si el recorte usara "-ss antes de -i" + "-c copy" a secas, el corte real
  // arrancaria en el keyframe mas cercano ANTES de 5s (pudiendo ser 0s), y la
  // duracion de salida se iria muy por encima de los 20s pedidos.
  const salida = path.join(dir, "prev-largo.mp4");
  const r = spawnSync("node", [STUDIO, `--in=${clipLargo}`, `--out=${salida}`, "--preview=15"],
    { encoding: "utf8", timeout: 180000 });
  assert.equal(r.status, 0, r.stderr);
  const dur = Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration",
    "-of", "csv=p=0", salida], { encoding: "utf8" }).stdout.trim());
  assert.ok(Math.abs(dur - 20) < 0.6, `la ventana de preview tendria que durar ~20s, dio ${dur}s`);
  assert.deepEqual(archivosResiduales(dir), [], "el recorte temporal de preview tiene que borrarse");
});

test("el temporal de preview se borra aunque el render falle DESPUES de crearse", () => {
  // Extension de salida invalida: el recorte de preview (el .mp4 temporal) se
  // crea bien, pero el render final (componer) tira porque ffmpeg no reconoce
  // el contenedor de salida. El finally tiene que borrar el temporal igual,
  // no solo cuando todo sale bien.
  const salida = path.join(dir, "prev-falla.xyz");
  const r = spawnSync("node", [STUDIO, `--in=${clip}`, `--out=${salida}`, "--preview=4"],
    { encoding: "utf8", timeout: 60000 });
  assert.notEqual(r.status, 0);
  assert.deepEqual(archivosResiduales(dir), [], "un render fallido despues del corte no puede dejar el temporal de preview");
});

test("render completo y reporte final", () => {
  const salida = path.join(dir, "full.mp4");
  const r = spawnSync("node", [STUDIO, `--in=${clip}`, `--out=${salida}`, "--formato=1:1"],
    { encoding: "utf8", timeout: 300000 });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(salida));
  assert.match(r.stdout, /encoder/i);
  assert.match(r.stdout, /segundos|tardo/i);
});

test("el reporte no confunde avisos de otras categorias con camara salteada", () => {
  // 1 movimiento de camara valido (t explicito) + 2 que cargarReceta va a saltear
  // porque buscan una palabra que no existe (studio.mjs siempre manda palabras: []).
  // El reporte tiene que decir "1 aplicado" y separar esos 2 avisos de los que
  // sean de camara especificamente, sin mezclarlos bajo una sola etiqueta ambigua.
  const receta = path.join(dir, "avisos.json");
  fs.writeFileSync(receta, JSON.stringify({
    camara: [
      { t: 1, fx: "jumpCutClose" },
      { palabra: "estanoexisteseguro1", fx: "zoomIn" },
      { palabra: "estanoexisteseguro2", fx: "zoomIn" },
    ],
  }));
  const salida = path.join(dir, "reporte.mp4");
  const r = spawnSync("node", [STUDIO, `--in=${clip}`, `--out=${salida}`, `--receta=${receta}`],
    { encoding: "utf8", timeout: 180000 });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Efectos de camara aplicados:\s*1\b/, r.stdout);
  assert.match(r.stdout, /avisos/i, r.stdout);
  // Ningun numero en el reporte de avisos totales puede ser menor a los 2 avisos
  // reales que genero cargarReceta (word not found x2) — eso seria conflacion silenciosa.
  const totalAvisos = (r.stdout.match(/Avisos totales[^:]*:\s*(\d+)/i) || [])[1];
  assert.ok(totalAvisos !== undefined, "el reporte tiene que declarar el total de avisos");
  assert.ok(Number(totalAvisos) >= 2, `el reporte subcuenta los avisos: dijo ${totalAvisos}`);
});
