import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { NIVELES_LIMPIEZA, filtroDeLimpieza, estabilizar } from "../lib/enhance.mjs";
import { crearClipDePrueba, dirTemporal, borrarDirDePrueba } from "./helpers.mjs";

let dir, clip;
before(() => {
  dir = dirTemporal();
  clip = crearClipDePrueba({ segundos: 3, salida: path.join(dir, "e.mp4") });
});
after(() => borrarDirDePrueba(dir));

test("los 3 niveles y el apagado", () => {
  assert.deepEqual(Object.keys(NIVELES_LIMPIEZA).sort(), ["fuerte", "normal", "suave"]);
  assert.equal(filtroDeLimpieza(null), "");
  assert.equal(filtroDeLimpieza("no"), "");
});

test("la cadena medida usa hqdn3d + cas + unsharp, NO nlmeans", () => {
  const f = filtroDeLimpieza("normal");
  assert.ok(f.includes("hqdn3d"));
  assert.ok(f.includes("cas"));
  assert.ok(f.includes("unsharp"));
  assert.ok(!f.includes("nlmeans"), "nlmeans se descarto por lento (2 min para 8 s)");
});

// --- Pruebas extra (fuera del brief): ver seccion "self-review" del reporte. ---

test("los 3 niveles producen cadenas distintas entre si", () => {
  // Un copy-paste que dejara "suave" y "fuerte" identicos pasaria la prueba de
  // "ffmpeg acepta los 3 niveles" sin que nadie lo note (ffmpeg acepta cualquiera
  // de los 3 igual). Esta prueba compara las 3 cadenas entre si, no contra ffmpeg.
  const [suave, normal, fuerte] = ["suave", "normal", "fuerte"].map(filtroDeLimpieza);
  assert.notEqual(suave, normal, "suave y normal no pueden ser identicos");
  assert.notEqual(normal, fuerte, "normal y fuerte no pueden ser identicos");
  assert.notEqual(suave, fuerte, "suave y fuerte no pueden ser identicos");
});

test("un nivel de limpieza invalido tira error claro, no falla en silencio", () => {
  assert.throws(
    () => filtroDeLimpieza("medio"),
    (e) => e.message.includes("medio") && e.message.includes("suave") && e.message.includes("fuerte"),
    "el mensaje tiene que nombrar el valor invalido y listar los validos"
  );
});

test("ffmpeg acepta los 3 niveles", () => {
  for (const n of Object.keys(NIVELES_LIMPIEZA)) {
    const r = spawnSync("ffmpeg", ["-v", "error", "-i", clip, "-vf", filtroDeLimpieza(n),
      "-frames:v", "2", "-f", "null", "-"], { encoding: "utf8" });
    assert.equal(r.status, 0, `ffmpeg rechazo el nivel "${n}": ${r.stderr}`);
  }
});

test("estabilizar hace las 2 pasadas y no cambia las dimensiones", async () => {
  const salida = path.join(dir, "estab.mp4");
  await estabilizar({ entrada: clip, salida, suavizado: 30 });
  const dims = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height", "-of", "csv=p=0", salida], { encoding: "utf8" }).stdout.trim();
  assert.equal(dims, "1920,1080");
});

test("estabilizar limpia el archivo .trf temporal", async () => {
  // El .trf se escribe al lado de `salida` (misma carpeta que `dir`, que es la
  // que este assert lee): si el finally no lo borrara, esta prueba SI lo detecta
  // (a diferencia de leer un directorio distinto de donde se escribe el archivo,
  // que jamas fallaria pase lo que pase con la limpieza real).
  const salida = path.join(dir, "estab2.mp4");
  assert.equal(path.dirname(salida), dir, "sanity: la salida vive en `dir`, el mismo directorio que se audita abajo");
  await estabilizar({ entrada: clip, salida, suavizado: 20 });
  const sobrantes = fs.readdirSync(dir).filter((f) => f.endsWith(".trf"));
  assert.deepEqual(sobrantes, [], `quedaron temporales: ${sobrantes.join(", ")}`);
});

test("estabilizar limpia el .trf incluso si la segunda pasada (transform) revienta", async () => {
  // Fuerza el fallo de la 2da pasada con un `suavizado` no numerico: vidstabtransform
  // no lo acepta y ffmpeg sale con codigo != 0. El finally tiene que limpiar igual.
  const salida = path.join(dir, "estab-falla.mp4");
  await assert.rejects(() => estabilizar({ entrada: clip, salida, suavizado: "no-es-un-numero" }));
  const sobrantes = fs.readdirSync(dir).filter((f) => f.endsWith(".trf"));
  assert.deepEqual(sobrantes, [], `un fallo en la 2da pasada no puede dejar el temporal: ${sobrantes.join(", ")}`);
});

test("dos estabilizaciones concurrentes en la misma carpeta no chocan de nombre de .trf", async () => {
  // Clip CHICO y corto a proposito. Lo que esta prueba verifica es que dos corridas no
  // se pisen el nombre del .trf: la resolucion y la duracion no cambian nada de eso.
  // Con el clip de 1920x1080 de `before`, dos vidstab en paralelo (4 pasadas de ffmpeg
  // a la vez) se caian de a ratos cuando la suite completa ya tenia la maquina cargada
  // -- una prueba que falla sin motivo real es una prueba que nadie vuelve a creer.
  const chico = crearClipDePrueba({
    segundos: 1, ancho: 640, alto: 360, conAudio: false, salida: path.join(dir, "conc.mp4"),
  });
  const salidaA = path.join(dir, "estab-conc-a.mp4");
  const salidaB = path.join(dir, "estab-conc-b.mp4");
  await Promise.all([
    estabilizar({ entrada: chico, salida: salidaA, suavizado: 10 }),
    estabilizar({ entrada: chico, salida: salidaB, suavizado: 10 }),
  ]);
  assert.ok(fs.existsSync(salidaA));
  assert.ok(fs.existsSync(salidaB));
  const sobrantes = fs.readdirSync(dir).filter((f) => f.endsWith(".trf"));
  assert.deepEqual(sobrantes, [], `dos corridas en paralelo no pueden dejar temporales: ${sobrantes.join(", ")}`);
});
