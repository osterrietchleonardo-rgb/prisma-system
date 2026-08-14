import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { detectarSilencios, cortarSilencios, cortarUnTramo } from "../lib/cut.mjs";
import { dirTemporal, borrarDirDePrueba } from "./helpers.mjs";

let dir, conSilencio;
before(() => {
  dir = dirTemporal();
  // 2s de tono, 2s de silencio, 2s de tono
  conSilencio = path.join(dir, "silencios.mp4");
  const r = spawnSync("ffmpeg", ["-y", "-v", "error",
    "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=6",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=6",
    "-af", "volume=enable='between(t,2,4)':volume=0",
    "-c:v", "libx264", "-crf", "28", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", conSilencio],
    { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
});
after(() => borrarDirDePrueba(dir));

test("detecta el silencio del medio", async () => {
  const sil = await detectarSilencios({ entrada: conSilencio, db: -30, min: 0.5 });
  assert.ok(sil.length >= 1, "tendria que encontrar al menos un silencio");
  const [ini, fin] = sil[0];
  assert.ok(ini > 1.5 && ini < 2.5, `el silencio arranca raro: ${ini}`);
  assert.ok(fin > 3.5 && fin < 4.5, `el silencio termina raro: ${fin}`);
});

test("cortar deja el video mas corto y con los tramos buenos", async () => {
  const salida = path.join(dir, "cortado.mp4");
  const r = await cortarSilencios({ entrada: conSilencio, salida, db: -30, min: 0.5, pad: 0.1 });
  assert.ok(r.duracionFinal < 5.5, `no acorto: ${r.duracionFinal}`);
  assert.ok(r.duracionFinal > 3.5, `corto de mas: ${r.duracionFinal}`);
  assert.equal(r.tramos.length, 2);
  assert.deepEqual(r.tramosFallidos, [], "sin fallos, tramosFallidos tiene que quedar vacio (no undefined)");
});

test("un tramo que falla al recortar queda registrado en tramosFallidos, no se pierde en silencio", async () => {
  // Corromper un archivo de verdad para forzar un fallo puntual de UN segmento (dejando
  // otros bien) no es reproducible de forma confiable entre versiones/plataformas de
  // ffmpeg. En cambio, se inyecta `_cortarUnTramo`: el primer llamado devuelve un fallo
  // simulado (sin tocar ffmpeg), el resto delega en `cortarUnTramo`, el recortador REAL.
  // Esto prueba el manejo de fallos (el bug que se esta arreglando) sin volverse un test
  // fragil que dependa de que ffmpeg falle de una forma particular.
  const salida = path.join(dir, "con-fallo.mp4");
  let llamadas = 0;
  const conUnFalloSimulado = (args) => {
    llamadas++;
    if (llamadas === 1) return { status: 1, stderr: "fallo simulado a proposito para la prueba" };
    return cortarUnTramo(args);
  };
  const r = await cortarSilencios({
    entrada: conSilencio, salida, db: -30, min: 0.5, pad: 0.1,
    _cortarUnTramo: conUnFalloSimulado,
  });
  assert.equal(r.tramosFallidos.length, 1, "tiene que quedar registrado exactamente 1 tramo fallido");
  assert.equal(r.tramosFallidos[0].indice, 0);
  assert.match(r.tramosFallidos[0].error, /fallo simulado/);
  // El video se termina generando igual, con el/los tramo(s) que SI se pudieron cortar:
  // un tramo fallido no puede tirar abajo TODO el corte (eso ya lo cubre la otra prueba
  // de "todos fallan"), pero tampoco puede desaparecer sin dejar rastro.
  assert.ok(fs.existsSync(salida));
});

test("si TODOS los tramos fallan, tira un error claro en vez de devolver un video vacio", async () => {
  const salida = path.join(dir, "todo-fallo.mp4");
  const siempreFalla = () => ({ status: 1, stderr: "fallo simulado para la prueba" });
  await assert.rejects(
    cortarSilencios({ entrada: conSilencio, salida, db: -30, min: 0.5, pad: 0.1, _cortarUnTramo: siempreFalla }),
    /[Nn]ingun tramo/
  );
});
