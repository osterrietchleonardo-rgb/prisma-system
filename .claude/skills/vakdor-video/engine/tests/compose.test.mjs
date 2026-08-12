import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { construirGrafo, componer } from "../lib/compose.mjs";
import { cargarReceta } from "../lib/recipe.mjs";
import { probe } from "../lib/probe.mjs";
import { crearClipDePrueba, dirTemporal } from "./helpers.mjs";

let dir, clip, info;
before(async () => {
  dir = dirTemporal();
  clip = crearClipDePrueba({ segundos: 6, salida: path.join(dir, "in.mp4") });
  info = await probe(clip);
});
after(() => fs.rmSync(dir, { recursive: true, force: true }));

test("sin camara ni color, el grafo solo ajusta el formato", () => {
  const { receta } = cargarReceta({ grade: { preset: "ninguno" } }, { durationSec: 6, palabras: [] });
  const { filtroVideo } = construirGrafo({ receta, info });
  assert.ok(filtroVideo.includes("scale"));
  assert.ok(!filtroVideo.includes("zoompan"));
  assert.ok(!filtroVideo.includes("eq="));
});

test("el color entra al grafo", () => {
  const { receta } = cargarReceta({ grade: { preset: "moody" } }, { durationSec: 6, palabras: [] });
  const { filtroVideo } = construirGrafo({ receta, info });
  assert.ok(filtroVideo.includes("eq="));
  assert.ok(filtroVideo.includes("vignette"));
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
  const { tramos } = construirGrafo({ receta, info });

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
