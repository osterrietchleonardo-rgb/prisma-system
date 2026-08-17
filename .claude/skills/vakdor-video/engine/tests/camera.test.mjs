import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  elegirMultiplicador, filtroZoom, filtroEscalaFija, filtroWhipPan, filtroPush,
  filtroDrift, filtroDolly,
} from "../lib/camera.mjs";
import { crearClipDePrueba, dirTemporal, borrarDirDePrueba } from "./helpers.mjs";

let dir, clip;
before(() => {
  dir = dirTemporal();
  clip = crearClipDePrueba({ segundos: 2, salida: path.join(dir, "c.mp4") });
});
after(() => borrarDirDePrueba(dir));

const aplicar = (vf, nombre) => {
  const salida = path.join(dir, `${nombre}.mp4`);
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-i", clip, "-vf", vf,
    "-c:v", "libx264", "-crf", "24", "-pix_fmt", "yuv420p", salida], { encoding: "utf8" });
  assert.equal(r.status, 0, `ffmpeg rechazo "${nombre}": ${r.stderr}`);
  const dims = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height", "-of", "csv=p=0", salida], { encoding: "utf8" }).stdout.trim();
  assert.equal(dims, "1920,1080", `"${nombre}" cambio las dimensiones: ${dims}`);
  return salida;
};

// Usado por las 2 pruebas que miden "suavidad" (diferencia entre frames consecutivos).
// [0-9.eE+-]+ (no solo [0-9.]+): los valores casi-cero -- justo el rango que interesa
// para detectar frames congelados -- ffmpeg los imprime en notacion cientifica (ej.
// "4.0027e-05"). Un regex sin la 'e' corta el exponente y deja "4.0027", inflando un
// valor casi nulo en uno ~100.000x mas grande, que es un falso negativo: un frame
// realmente congelado dejaria de contarse como congelado. Un solo lugar para este
// parseo: si hay que corregirlo de nuevo, se corrige una vez, no dos.
function medirDiferenciasDeFrames(archivo) {
  const out = spawnSync("ffmpeg", ["-v", "error", "-i", archivo, "-vf",
    "tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-",
    "-f", "null", "-"], { encoding: "utf8" }).stdout;
  const vals = [...out.matchAll(/YAVG=([0-9.eE+-]+)/g)].map((m) => Number(m[1]));
  assert.ok(vals.length > 10, `no pude medir los frames de "${archivo}" (encontre ${vals.length})`);
  return vals;
}

test("el multiplicador baja a 2x cuando hay mucho zoom", () => {
  assert.equal(elegirMultiplicador(60), 3);
  assert.equal(elegirMultiplicador(359), 3);
  assert.equal(elegirMultiplicador(361), 2);
});

test("el zoom usa sobre-muestreo, no scale con eval=frame", () => {
  const vf = filtroZoom({ tipo: "zoomIn", pct: 8, duracionSec: 2, fps: 30, ancho: 1920, alto: 1080, multiplicador: 3 });
  assert.ok(vf.includes("zoompan"), "tiene que usar zoompan");
  assert.ok(vf.includes("5760:3240"), "tiene que sobre-muestrear 3x antes");
  assert.ok(!vf.includes("eval=frame"), "scale con eval=frame quedo descartado por la medicion");
});

test("zoomOut arranca ampliado y termina en 1", () => {
  const vf = filtroZoom({ tipo: "zoomOut", pct: 8, duracionSec: 2, fps: 30, ancho: 1920, alto: 1080, multiplicador: 2 });
  assert.ok(vf.includes("1.08"), `deberia partir de 1.08: ${vf}`);
});

test("ffmpeg acepta los 4 movimientos y no cambia las dimensiones", () => {
  aplicar(filtroZoom({ tipo: "zoomIn", pct: 8, duracionSec: 2, fps: 30, ancho: 1920, alto: 1080, multiplicador: 2 }), "zoomIn");
  aplicar(filtroZoom({ tipo: "zoomOut", pct: 6, duracionSec: 2, fps: 30, ancho: 1920, alto: 1080, multiplicador: 2 }), "zoomOut");
  aplicar(filtroEscalaFija({ escala: 1.18, ancho: 1920, alto: 1080 }), "jumpCutClose");
  aplicar(filtroWhipPan({ fps: 30, ancho: 1920, alto: 1080, direccion: "der" }), "whipPan");
  aplicar(filtroPush({ pct: 6, duracionSec: 1, fps: 30, ancho: 1920, alto: 1080 }), "push");
});

test("el zoom no deja frames congelados (la medicion del spec)", () => {
  // OJO: esta prueba EXIGE una fuente FIJA. `crearClipDePrueba` usa testsrc2, que se
  // mueve solo: con esa fuente la diferencia entre frames nunca da cero y la prueba
  // pasaria siempre, aunque el zoom trepidara. Con imagen fija, la unica diferencia
  // entre frames es el zoom, que es justo lo que hay que medir.
  const quieto = path.join(dir, "quieto.mp4");
  spawnSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=1920x1080",
    "-frames:v", "1", path.join(dir, "quieto.png")]);
  spawnSync("ffmpeg", ["-y", "-v", "error", "-loop", "1", "-i", path.join(dir, "quieto.png"),
    "-t", "2", "-r", "30", "-c:v", "libx264", "-crf", "12", "-pix_fmt", "yuv420p", quieto]);

  const vf = filtroZoom({ tipo: "zoomIn", pct: 2, duracionSec: 2, fps: 30, ancho: 1920, alto: 1080, multiplicador: 3 });
  const salida = path.join(dir, "suavidad.mp4");
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-i", quieto, "-vf", vf,
    "-c:v", "libx264", "-crf", "12", "-pix_fmt", "yuv420p", salida], { encoding: "utf8" });
  assert.equal(r.status, 0, `ffmpeg fallo: ${r.stderr}`);
  const vals = medirDiferenciasDeFrames(salida);
  const media = vals.reduce((a, b) => a + b, 0) / vals.length;
  const congelados = vals.filter((v) => v < media * 0.35).length;
  assert.ok(congelados <= vals.length * 0.05, `${congelados}/${vals.length} frames congelados, el zoom escalona`);
});

test("el whip pan tiene lugar para moverse (si no, el crop clampea y no panea)", () => {
  const vf = filtroWhipPan({ fps: 30, ancho: 1920, alto: 1080, direccion: "der" });
  const escalado = Number(vf.match(/scale=(\d+):/)[1]);
  const recorte  = Number(vf.match(/crop=(\d+):/)[1]);
  assert.ok(escalado > recorte,
    `el crop necesita margen: se escala a ${escalado} y se recorta ${recorte}`);
});

test("el whip pan MUEVE la imagen de verdad, no solo la desenfoca", () => {
  // Fuente FIJA: la unica diferencia entre frames tiene que venir del paneo.
  const quieto = path.join(dir, "quieto-whip.mp4");
  spawnSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=1920x1080",
    "-frames:v", "1", path.join(dir, "quieto-whip.png")]);
  spawnSync("ffmpeg", ["-y", "-v", "error", "-loop", "1", "-i", path.join(dir, "quieto-whip.png"),
    "-t", "1", "-r", "30", "-c:v", "libx264", "-crf", "12", "-pix_fmt", "yuv420p", quieto]);

  const medir = (archivo) => {
    const vals = medirDiferenciasDeFrames(archivo);
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  // Sin desenfoque, para que lo unico que pueda mover la imagen sea el paneo.
  const conPaneo = path.join(dir, "whip-paneo.mp4");
  const vf = filtroWhipPan({ fps: 30, ancho: 1920, alto: 1080, direccion: "der", desenfoque: false });
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-i", quieto, "-vf", vf,
    "-c:v", "libx264", "-crf", "12", "-pix_fmt", "yuv420p", conPaneo], { encoding: "utf8" });
  assert.equal(r.status, 0, `ffmpeg fallo: ${r.stderr}`);

  const base = medir(quieto);
  const pan  = medir(conPaneo);
  assert.ok(pan > base * 10,
    `el paneo casi no mueve la imagen: quieto=${base.toFixed(3)} vs paneo=${pan.toFixed(3)}`);
});

// ---------- drift y dolly ----------

test("el drift es determinista: el mismo pedido da el mismo filtro", () => {
  const a = filtroDrift({ ancho: 1920, alto: 1080, intensidad: 0.5 });
  const b = filtroDrift({ ancho: 1920, alto: 1080, intensidad: 0.5 });
  assert.equal(a, b, "dos renders del mismo video tienen que dar el mismo archivo");
  assert.ok(!a.includes("random"), "nada de azar: rompe la reproducibilidad");
});

test("mas intensidad de drift = mas desplazamiento", () => {
  const num = (s) => Number(s.match(/\+([0-9.]+)\*sin/)[1]);
  assert.ok(num(filtroDrift({ ancho: 1920, alto: 1080, intensidad: 1 }))
          > num(filtroDrift({ ancho: 1920, alto: 1080, intensidad: 0.2 })));
});

test("el drift tiene lugar para moverse (si no, el crop clampea y no flota)", () => {
  const vf = filtroDrift({ ancho: 1920, alto: 1080, intensidad: 0.5 });
  const escalado = Number(vf.match(/scale=(\d+):/)[1]);
  const recorte = Number(vf.match(/crop=(\d+):/)[1]);
  assert.ok(escalado > recorte, `sin margen no hay flotacion: escala ${escalado}, recorta ${recorte}`);
});

test("el drift NO paga el sobre-muestreo caro del zoom", () => {
  const vf = filtroDrift({ ancho: 1920, alto: 1080, intensidad: 0.5 });
  assert.ok(!vf.includes("zoompan"), "el drift no usa zoompan");
  const escalado = Number(vf.match(/scale=(\d+):/)[1]);
  assert.ok(escalado < 1920 * 1.5, `escala de mas (${escalado}): eso es costo de zoom, no de drift`);
});

test("el dolly out arranca ampliado y el in arranca en 1", () => {
  const comun = { pct: 6, duracionSec: 2, fps: 30, ancho: 1920, alto: 1080 };
  assert.ok(filtroDolly({ ...comun, direccion: "out" }).includes("1.0600"), "out tiene que partir de 1.06");
  assert.ok(filtroDolly({ ...comun, direccion: "in" }).includes("1+0.0600"), "in tiene que partir de 1");
});

test("el dolly respeta la duracion REAL del tramo, no la pedida", () => {
  const comun = { pct: 6, fps: 30, ancho: 1920, alto: 1080, direccion: "in" };
  const corto = filtroDolly({ ...comun, duracionSec: 2 });
  const largo = filtroDolly({ ...comun, duracionSec: 3 });
  assert.ok(corto.includes("on/60"), `2s a 30fps son 60 frames: ${corto}`);
  assert.ok(largo.includes("on/90"), `3s a 30fps son 90 frames: ${largo}`);
  assert.notEqual(corto, largo);
});

test("ffmpeg acepta drift y dolly y no cambian las dimensiones", () => {
  aplicar(filtroDrift({ ancho: 1920, alto: 1080, intensidad: 0.5 }), "drift");
  aplicar(filtroDolly({ pct: 6, duracionSec: 2, fps: 30, ancho: 1920, alto: 1080, direccion: "out" }), "dolly");
});

test("el drift MUEVE la imagen de verdad", () => {
  // Fuente FIJA: lo unico que puede mover la imagen es el drift.
  const quieto = path.join(dir, "quieto-drift.mp4");
  spawnSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=1920x1080",
    "-frames:v", "1", path.join(dir, "quieto-drift.png")]);
  spawnSync("ffmpeg", ["-y", "-v", "error", "-loop", "1", "-i", path.join(dir, "quieto-drift.png"),
    "-t", "2", "-r", "30", "-c:v", "libx264", "-crf", "12", "-pix_fmt", "yuv420p", quieto]);

  const conDrift = path.join(dir, "drift-mueve.mp4");
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-i", quieto, "-vf",
    filtroDrift({ ancho: 1920, alto: 1080, intensidad: 1 }),
    "-c:v", "libx264", "-crf", "12", "-pix_fmt", "yuv420p", conDrift], { encoding: "utf8" });
  assert.equal(r.status, 0, `ffmpeg fallo: ${r.stderr}`);

  const promedio = (archivo) => {
    const vals = medirDiferenciasDeFrames(archivo);
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };
  const base = promedio(quieto);
  const drift = promedio(conDrift);
  assert.ok(drift > base * 10,
    `el drift casi no mueve la imagen: quieto=${base.toFixed(6)} vs drift=${drift.toFixed(6)}`);
});
