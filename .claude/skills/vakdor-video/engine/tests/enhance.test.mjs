import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { NIVELES_LIMPIEZA, filtroDeLimpieza, estabilizar, filtroDeTransform } from "../lib/enhance.mjs";
import { pixFmtIntermedioDe } from "../lib/cut.mjs";
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

test("un origen de 10 bits conserva los 10 bits en el paso intermedio", () => {
  // Aplastar un HDR a 8 bits ANTES del tonemap (que pasa al final, en compose) deja
  // bandas en los degrades — la pared del fondo es donde primero se ve.
  assert.equal(pixFmtIntermedioDe("yuv420p10le"), "yuv420p10le");
  assert.equal(pixFmtIntermedioDe("yuv420p"), "yuv420p");
  // Sin dato, se comporta como siempre: 8 bits. Un caller viejo no cambia de conducta.
  assert.equal(pixFmtIntermedioDe(null), "yuv420p");
});

test("la 2da pasada de vidstab NO encadena unsharp: esa cadena tumba a ffmpeg", () => {
  // Esta es la prueba que evita que alguien "mejore" la estabilizacion volviendo a
  // pegarle un unsharp atras. Se hizo una vez y hacia que ffmpeg muriera con SIGSEGV
  // sin mensaje: MEDIDO, clip de 3s a 640x360, 20 corridas de cada variante, sin
  // concurrencia -> con unsharp 18 de 20; sin unsharp 20 de 20. En un clip de 1s la
  // diferencia es brutal: 4 de 10 contra 19 de 20. El detalle completo esta en el
  // comentario de `filtroDeTransform` en lib/enhance.mjs.
  const f = filtroDeTransform({ trfEnFiltro: "'x.trf'", suavizado: 30 });
  assert.ok(f.includes("vidstabtransform"), "tiene que seguir siendo la pasada de transform");
  assert.ok(f.includes("smoothing=30"), "el suavizado tiene que llegar al filtro");
  assert.ok(!f.includes("unsharp"), "unsharp encadenado a vidstabtransform hace segfaultear a ffmpeg");
  // Cualquier filtro de convolucion atras de vidstabtransform es el mismo riesgo, no
  // solo unsharp: la 2da pasada tiene que ser vidstabtransform y nada mas.
  assert.equal(f.split(",").length, 1, `la 2da pasada tiene que ser UN solo filtro, es: ${f}`);
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
  // Clip CHICO a proposito: lo que se verifica es el nombre del .trf, y la resolucion no
  // cambia nada de eso. Los 3 segundos SI importan y estan medidos: en clips de 1 segundo
  // vidstabtransform se cae solo cada tanto (19 de 20), en 3 segundos no (20 de 20).
  const chico = crearClipDePrueba({
    segundos: 3, ancho: 640, alto: 360, conAudio: false, salida: path.join(dir, "conc.mp4"),
  });

  // Se espia la carpeta MIENTRAS las dos corren. Antes esta prueba solo miraba que no
  // quedaran temporales al final, y con eso no probaba lo que dice el titulo: si las dos
  // corridas hubieran usado EL MISMO nombre, tambien terminaba sin sobrantes y pasaba
  // igual. Ver DOS nombres distintos es la unica forma de afirmar que no se pisan.
  // El .trf existe desde que arranca la 1ra pasada hasta el finally de la 2da, o sea
  // casi toda la llamada: mirar cada 15 ms lo agarra de sobra.
  const vistos = new Set();
  const reloj = setInterval(() => {
    for (const f of fs.readdirSync(dir)) if (f.endsWith(".trf")) vistos.add(f);
  }, 15);

  const salidaA = path.join(dir, "estab-conc-a.mp4");
  const salidaB = path.join(dir, "estab-conc-b.mp4");
  try {
    await Promise.all([
      estabilizar({ entrada: chico, salida: salidaA, suavizado: 10 }),
      estabilizar({ entrada: chico, salida: salidaB, suavizado: 10 }),
    ]);
  } finally {
    clearInterval(reloj);
  }

  assert.equal(vistos.size, 2, `esperaba dos .trf con nombres distintos, vi: ${[...vistos].join(", ") || "ninguno"}`);
  assert.ok(fs.existsSync(salidaA));
  assert.ok(fs.existsSync(salidaB));
  const sobrantes = fs.readdirSync(dir).filter((f) => f.endsWith(".trf"));
  assert.deepEqual(sobrantes, [], `dos corridas en paralelo no pueden dejar temporales: ${sobrantes.join(", ")}`);
});
