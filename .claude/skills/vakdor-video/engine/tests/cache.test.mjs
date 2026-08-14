// Pruebas del cache del corte: el candado entre procesos y la publicacion atomica.
// Ninguna toca la red ni la API de Groq: `cortarConCache` recibe el cortador por
// inyeccion (`_cortarSilencios`), asi que se simula exito y fallo sin llamar a ffmpeg.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { conLock } from "../lib/cache.mjs";
import { cortarConCache } from "../lib/cut.mjs";
import { dirTemporal, borrarDirDePrueba } from "./helpers.mjs";

let dir;
before(() => { dir = dirTemporal(); });
after(() => borrarDirDePrueba(dir));

// Cortador falso: escribe un archivo y devuelve la forma que espera cortarConCache.
const cortadorFalso = ({ tramosFallidos = [], marca = "ok" } = {}) =>
  async ({ salida }) => {
    fs.writeFileSync(salida, marca);
    return { salida, tramos: [[0, 1]], duracionFinal: 1, tramosFallidos };
  };

const UN_FALLO = [{ indice: 3, desde: 4.5, hasta: 7.25, error: "ffmpeg exploto" }];

test("conLock: el que gana el mkdir ejecuta y despues suelta el lock", async () => {
  const lock = path.join(dir, "lock-basico");
  let corridas = 0;
  const r = await conLock(lock, () => false, async () => { corridas++; return "listo"; });
  assert.equal(r, "listo");
  assert.equal(corridas, 1);
  assert.equal(fs.existsSync(lock), false, "el lock tiene que soltarse al terminar");
});

test("conLock: suelta el lock aunque el trabajo reviente", async () => {
  const lock = path.join(dir, "lock-con-error");
  await assert.rejects(
    () => conLock(lock, () => false, async () => { throw new Error("boom"); }),
    /boom/
  );
  assert.equal(fs.existsSync(lock), false, "un error no puede dejar el lock trabado para siempre");
});

test("conLock: si el lock ya existe y el trabajo ya esta hecho, no espera de gusto", async () => {
  const lock = path.join(dir, "lock-ocupado");
  fs.mkdirSync(lock); // simula otro proceso trabajando
  const desde = Date.now();
  const r = await conLock(lock, () => true, async () => "reusado", { intervaloPollMs: 50 });
  assert.equal(r, "reusado");
  assert.ok(Date.now() - desde < 1000, "con el resultado ya listo no tiene que sondear");
  fs.rmSync(lock, { recursive: true, force: true });
});

test("conLock: si el dueño se colgo, se deja de esperar y se hace el trabajo igual", async () => {
  const lock = path.join(dir, "lock-colgado");
  fs.mkdirSync(lock); // nadie lo va a soltar nunca
  const r = await conLock(lock, () => false, async () => "lo hice yo",
    { tiempoMaxEsperaMs: 150, intervaloPollMs: 50 });
  assert.equal(r, "lo hice yo", "mejor gastar de mas una vez que esperar para siempre");
  fs.rmSync(lock, { recursive: true, force: true });
});

test("un corte SIN fallos se publica en el cache", async () => {
  const cache = path.join(dir, "corte-ok.mp4");
  const r = await cortarConCache({
    entrada: "no-se-usa.mp4", salidaCache: cache, lockPath: path.join(dir, "lk1"),
    _cortarSilencios: cortadorFalso(),
  });
  assert.equal(r.publicado, true);
  assert.equal(r.salida, cache);
  assert.ok(fs.existsSync(cache), "tiene que quedar en el cache para la proxima corrida");
});

test("un corte CON tramos fallidos NO se publica: el aviso no puede apagarse solo", async () => {
  const cache = path.join(dir, "corte-fallido.mp4");
  const r = await cortarConCache({
    entrada: "no-se-usa.mp4", salidaCache: cache, lockPath: path.join(dir, "lk2"),
    _cortarSilencios: cortadorFalso({ tramosFallidos: UN_FALLO }),
  });
  assert.equal(r.publicado, false, "un video con footage perdido no puede quedar cacheado");
  assert.equal(fs.existsSync(cache), false,
    "si se cachea, la proxima corrida lo reusa EN SILENCIO y el aviso desaparece");
  assert.equal(r.tramosFallidos ?? r.rc.tramosFallidos.length, 1);
  assert.ok(fs.existsSync(r.salida), "para ESTA corrida el archivo igual sirve");
});

test("la publicacion es atomica: se escribe en un temporal y recien ahi se renombra", async () => {
  const cache = path.join(dir, "corte-atomico.mp4");
  let rutaQueRecibio;
  await cortarConCache({
    entrada: "no-se-usa.mp4", salidaCache: cache, lockPath: path.join(dir, "lk3"),
    _cortarSilencios: async ({ salida }) => {
      rutaQueRecibio = salida;
      // Mientras se escribe, el nombre final NO puede existir: si existiera, otra
      // corrida podria agarrar un archivo a medio escribir y creerlo bueno.
      assert.equal(fs.existsSync(cache), false, "el nombre final no puede tener un archivo a medias");
      fs.writeFileSync(salida, "contenido");
      return { salida, tramos: [[0, 1]], duracionFinal: 1, tramosFallidos: [] };
    },
  });
  assert.notEqual(rutaQueRecibio, cache, "no se escribe directo sobre el nombre final");
  assert.match(path.basename(rutaQueRecibio), /^\.tmp-corte-/);
  assert.equal(fs.readFileSync(cache, "utf8"), "contenido", "el renombre publica el archivo entero");
});

test("con --rehacer se ignora el cache aunque ya exista", async () => {
  const cache = path.join(dir, "corte-rehacer.mp4");
  fs.writeFileSync(cache, "viejo");
  const r = await cortarConCache({
    entrada: "no-se-usa.mp4", salidaCache: cache, lockPath: path.join(dir, "lk4"),
    rehacer: true, _cortarSilencios: cortadorFalso({ marca: "nuevo" }),
  });
  assert.equal(r.yaEstaba, false, "--rehacer no puede devolver el cacheado");
  assert.equal(fs.readFileSync(cache, "utf8"), "nuevo");
});

test("sin --rehacer, un cache existente se reusa y no se rehace el trabajo", async () => {
  const cache = path.join(dir, "corte-reuso.mp4");
  fs.writeFileSync(cache, "yaestaba");
  let corrio = false;
  const r = await cortarConCache({
    entrada: "no-se-usa.mp4", salidaCache: cache, lockPath: path.join(dir, "lk5"),
    _cortarSilencios: async () => { corrio = true; throw new Error("no deberia correr"); },
  });
  assert.equal(r.yaEstaba, true);
  assert.equal(corrio, false, "reusar el cache es justamente NO volver a pagar el trabajo");
});
