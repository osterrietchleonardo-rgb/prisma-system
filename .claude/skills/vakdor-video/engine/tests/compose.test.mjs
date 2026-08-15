import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { construirGrafo, componer } from "../lib/compose.mjs";
import { cargarReceta } from "../lib/recipe.mjs";
import { probe } from "../lib/probe.mjs";
import { filtroZoom } from "../lib/camera.mjs";
import { FORMATOS } from "../lib/reframe.mjs";
import { crearClipDePrueba, dirTemporal, borrarDirDePrueba } from "./helpers.mjs";

let dir, clip, info;
before(async () => {
  dir = dirTemporal();
  clip = crearClipDePrueba({ segundos: 6, salida: path.join(dir, "in.mp4") });
  info = await probe(clip);
});
after(() => borrarDirDePrueba(dir));

test("sin camara ni color, el grafo solo ajusta el formato", () => {
  const { receta } = cargarReceta({ grade: { preset: "ninguno" } }, { durationSec: 6, palabras: [] });
  const { filtroVideo } = construirGrafo({ receta, info });
  assert.ok(filtroVideo.includes("scale"));
  assert.ok(!filtroVideo.includes("zoompan"));
  assert.ok(!filtroVideo.includes("eq="));
});

test("la limpieza entra al grafo, entre el formato y el color", () => {
  const { receta } = cargarReceta({ limpieza: "normal", grade: { preset: "moody" } }, { durationSec: 6, palabras: [] });
  const { filtroVideo } = construirGrafo({ receta, info });
  assert.ok(filtroVideo.includes("hqdn3d"));
  assert.ok(filtroVideo.includes("cas"));
  const posFormato = filtroVideo.indexOf("scale");
  const posLimpieza = filtroVideo.indexOf("hqdn3d");
  const posColor = filtroVideo.indexOf("eq=");
  assert.ok(posFormato < posLimpieza && posLimpieza < posColor,
    `orden esperado formato < limpieza < color, dio ${posFormato},${posLimpieza},${posColor}`);
});

test("por defecto la limpieza es suave: un video sale con calidad sin pedir nada", () => {
  const { receta } = cargarReceta({}, { durationSec: 6, palabras: [] });
  assert.equal(receta.limpieza, "suave");
  const { filtroVideo } = construirGrafo({ receta, info });
  assert.ok(filtroVideo.includes("hqdn3d"));
});

test('con limpieza "no" el grafo no agrega nada de limpieza', () => {
  const { receta } = cargarReceta({ limpieza: "no" }, { durationSec: 6, palabras: [] });
  const { filtroVideo } = construirGrafo({ receta, info });
  assert.ok(!filtroVideo.includes("hqdn3d"));
});

test("el grade por defecto no baja el brillo ni pone viñeta", () => {
  // `cinematic` cerraba a la mitad el lado en sombra de la cara (medido). El default
  // tiene que dejar la imagen como salio de la camara, no maquillarla.
  const { receta } = cargarReceta({}, { durationSec: 6, palabras: [] });
  assert.equal(receta.grade.preset, "natural");
  const { filtroVideo } = construirGrafo({ receta, info });
  assert.ok(!filtroVideo.includes("brightness=-"), "el default no puede bajar el brillo");
  assert.ok(!filtroVideo.includes("vignette"), "el default no puede poner viñeta");
});

test("el color entra al grafo", () => {
  const { receta } = cargarReceta({ grade: { preset: "moody" } }, { durationSec: 6, palabras: [] });
  const { filtroVideo } = construirGrafo({ receta, info });
  assert.ok(filtroVideo.includes("eq="));
  assert.ok(filtroVideo.includes("vignette"));
});

// --- HDR: un .mov de celular moderno llega en HLG/bt2020. Si el grafo no lo baja a
// SDR ANTES de gradear, el video sale oscuro y amarillento (medido; ver lib/hdr.mjs).
const infoHDR = () => ({
  ...info,
  color: { space: "bt2020nc", transfer: "arib-std-b67", primaries: "bt2020", range: "tv" },
  pixFmt: "yuv420p10le",
  esHDR: true,
});

test("un video HDR se convierte a SDR, y el tonemap va PRIMERO de todo", () => {
  const { receta } = cargarReceta({ grade: { preset: "cinematic" }, limpieza: "normal" }, { durationSec: 6, palabras: [] });
  const { filtroVideo, huboTonemap } = construirGrafo({ receta, info: infoHDR() });

  assert.equal(huboTonemap, true);
  const posTonemap = filtroVideo.indexOf("tonemap=");
  const posFormato = filtroVideo.indexOf("scale=");
  const posLimpieza = filtroVideo.indexOf("hqdn3d");
  const posColor = filtroVideo.indexOf("eq=");
  assert.ok(posTonemap >= 0, "el HDR tiene que tonemapearse");
  // El grade esta pensado sobre la curva bt709: gradear HLG crudo es gradear otra cosa.
  assert.ok(posTonemap < posLimpieza && posTonemap < posColor,
    `el tonemap tiene que ir antes que limpieza y color, dio ${posTonemap},${posLimpieza},${posColor}`);
  assert.ok(posTonemap < posFormato || filtroVideo.startsWith("zscale"),
    "el tonemap tiene que abrir la cadena");
});

test("un video SDR no paga ningun filtro de HDR", () => {
  const { receta } = cargarReceta({ grade: { preset: "cinematic" } }, { durationSec: 6, palabras: [] });
  const { filtroVideo, huboTonemap } = construirGrafo({ receta, info });
  assert.equal(huboTonemap, false);
  assert.ok(!filtroVideo.includes("tonemap="));
});

test('con hdr:"no" el HDR no se convierte, aunque el video lo sea', () => {
  const { receta } = cargarReceta({ hdr: "no" }, { durationSec: 6, palabras: [] });
  const { filtroVideo, huboTonemap } = construirGrafo({ receta, info: infoHDR() });
  assert.equal(huboTonemap, false);
  assert.ok(!filtroVideo.includes("tonemap="));
});

test("el zoom solo se aplica al tramo pedido, no a todo el video", () => {
  const { receta } = cargarReceta(
    { camara: [{ t: 2, dur: 2, fx: "zoomIn", pct: 8 }] },
    { durationSec: 6, palabras: [] }
  );
  const { tramos } = construirGrafo({ receta, info });
  assert.equal(tramos.length, 3, "deberia partir en: antes, zoom, despues");
  assert.ok(tramos[1].filtro.includes("zoompan"));
  assert.ok(!tramos[0].filtro.includes("zoompan"));
  assert.ok(!tramos[2].filtro.includes("zoompan"));
});

test("renderiza de verdad y respeta duracion y formato", async () => {
  const salida = path.join(dir, "out.mp4");
  const { receta } = cargarReceta(
    { formato: "9:16", grade: { preset: "cinematic" }, camara: [{ t: 1, dur: 2, fx: "zoomIn", pct: 8 }] },
    { durationSec: 6, palabras: [] }
  );
  const r = await componer({ entrada: clip, salida, receta, info });
  assert.ok(r.segundos > 0);

  const datos = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height:format=duration", "-of", "csv=p=0", salida], { encoding: "utf8" }).stdout;
  assert.match(datos, /1080,1920/);
  const dur = Number(datos.trim().split("\n").pop());
  assert.ok(Math.abs(dur - 6) < 0.4, `la duracion cambio: ${dur}`);
});

// --- Pruebas extra (fuera del brief): la aritmetica de tramos tiene que tilear
// la linea de tiempo sin huecos ni superposiciones. Un hueco pierde video en
// silencio; una superposicion lo duplica. Ver seccion "self-review" del reporte.

test("dos movimientos de camara que se superponen no duplican el tramo comun", () => {
  const { receta } = cargarReceta(
    { camara: [
      { t: 1, dur: 3, fx: "zoomIn", pct: 8 },   // cubre 1-4
      { t: 2, dur: 2, fx: "zoomOut", pct: 6 },  // pedido 2-4, cae DENTRO del anterior
    ] },
    { durationSec: 6, palabras: [] }
  );
  const { tramos, avisos } = construirGrafo({ receta, info });

  // Sin huecos ni superposiciones: cada tramo arranca donde termino el anterior.
  let cursor = 0;
  for (const t of tramos) {
    assert.equal(t.desde, cursor, `hueco o superposicion antes del tramo [${t.desde},${t.hasta}]`);
    assert.ok(t.hasta > t.desde, "tramo de duracion cero o negativa");
    cursor = t.hasta;
  }
  assert.equal(cursor, info.durationSec, "los tramos no cubren el video completo");

  // El segundo movimiento (zoomOut) quedo totalmente cubierto por el primero:
  // no debe generar un tramo propio con zoompan duplicado.
  const conZoom = tramos.filter((t) => t.filtro.includes("zoompan"));
  assert.equal(conZoom.length, 1, "el movimiento superpuesto no deberia generar un segundo tramo con zoom");

  // Y no deberia desaparecer en silencio: tiene que quedar un aviso.
  assert.equal(avisos.length, 1, "el movimiento saltado deberia dejar un aviso");
  assert.match(avisos[0], /zoomOut/);
});

test("un movimiento acortado por una superposicion parcial usa la duracion real, no la pedida", () => {
  const { receta } = cargarReceta(
    { camara: [
      { t: 1, dur: 3, fx: "zoomIn", pct: 8 },   // cubre 1-4
      { t: 3, dur: 3, fx: "zoomOut", pct: 8 },  // pedido 3-6 (3s), pero el cursor ya esta en 4: solo quedan 4-6 (2s)
    ] },
    { durationSec: 6, palabras: [] }
  );
  const { tramos, multiplicador } = construirGrafo({ receta, info });

  // Tiling exacto: sin huecos ni superposiciones.
  let cursor = 0;
  for (const t of tramos) {
    assert.equal(t.desde, cursor, `hueco o superposicion antes del tramo [${t.desde},${t.hasta}]`);
    cursor = t.hasta;
  }
  assert.equal(cursor, info.durationSec, "los tramos no cubren el video completo");

  const tramoAcortado = tramos.find((t) => t.desde === 4 && t.hasta === 6);
  assert.ok(tramoAcortado, "deberia existir el tramo 4-6 (lo que le quedo al segundo movimiento)");

  const { ancho, alto } = FORMATOS[receta.formato];
  const conDuracionReal = filtroZoom({
    tipo: "zoomOut", pct: 8, duracionSec: 2, fps: info.fps, ancho, alto, multiplicador,
  });
  const conDuracionPedida = filtroZoom({
    tipo: "zoomOut", pct: 8, duracionSec: 3, fps: info.fps, ancho, alto, multiplicador,
  });
  assert.equal(tramoAcortado.filtro, conDuracionReal, "el filtro tiene que armarse con los 2s reales del tramo");
  assert.notEqual(tramoAcortado.filtro, conDuracionPedida, "no tiene que usar los 3s originalmente pedidos");
});

test("un movimiento cuya duracion se pasa del final del video se recorta, no se pierde", () => {
  const { receta } = cargarReceta(
    { camara: [{ t: 5, dur: 3, fx: "zoomIn", pct: 8 }] }, // 5+3=8, pero el video dura 6
    { durationSec: 6, palabras: [] }
  );
  const { tramos } = construirGrafo({ receta, info });

  let cursor = 0;
  for (const t of tramos) {
    assert.equal(t.desde, cursor, `hueco o superposicion antes del tramo [${t.desde},${t.hasta}]`);
    cursor = t.hasta;
  }
  assert.equal(cursor, info.durationSec, "los tramos no cubren el video completo");
  assert.ok(tramos.at(-1).hasta <= info.durationSec, "el ultimo tramo no puede pasarse del final");
});
