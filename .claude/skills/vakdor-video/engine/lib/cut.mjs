// lib/cut.mjs — Saca silencios con precision de frame exacta para videos largos.
// Re-encodea cada segmento con -ss y -to (frame-exact, DESPUES de -i) para evitar
// duplicacion de I-frames, y luego concatena y aplica normalizacion de audio loudnorm
// en dos pasadas.
//
// Portado desde `Prisma - MK\_motor-video\cut-exact.mjs` (probado en produccion sobre
// un video real de 19 minutos): la logica de deteccion/corte se conserva EXACTA. Lo
// unico que cambia es la envoltura — funciones exportadas en vez de un CLI con
// process.argv/process.exit, y el temporal se borra en un `finally` (un modulo no
// puede llamar a process.exit ni depender del evento "exit" del proceso).

import { spawnSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { conLock } from "./cache.mjs";

function duracionDe(entrada) {
  const r = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", entrada],
    { encoding: "utf8" }
  );
  return parseFloat(r.stdout.trim());
}

/**
 * Formato de pixel para el archivo INTERMEDIO del corte.
 *
 * Un celular moderno graba HDR en 10 bits. Este archivo no es el final: lo consume
 * `compose`, que recien ahi baja el HDR a SDR (lib/hdr.mjs). Si aca se lo aplasta a 8
 * bits, el tonemap posterior tiene que estirar un degrade de 8 bits y la pared del
 * fondo sale con bandas. Por eso: si la fuente es de 10 bits, el intermedio queda en
 * 10 bits. Para un video comun (8 bits) no cambia nada.
 */
export function pixFmtIntermedioDe(pixFmtOrigen) {
  return /10|12/.test(String(pixFmtOrigen ?? "")) ? "yuv420p10le" : "yuv420p";
}

/** Igual que `pixFmtIntermedioDe`, pero leyendo el pix_fmt del archivo.
 *  Solo para quien NO tenga ya el dato: cada llamada cuesta un proceso ffprobe. */
export function pixFmtIntermedio(entrada) {
  const r = spawnSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=pix_fmt", "-of", "csv=p=0", entrada],
    { encoding: "utf8" }
  );
  return pixFmtIntermedioDe((r.stdout || "").trim());
}

/** Corre silencedetect sobre `entrada` y devuelve los pares [inicio, fin] de cada silencio. */
export async function detectarSilencios({ entrada, db = -30, min = 0.6 }) {
  const dur = duracionDe(entrada);
  const sd = spawnSync(
    "ffmpeg",
    ["-i", entrada, "-af", `silencedetect=noise=${db}dB:d=${min}`, "-f", "null", "-"],
    { encoding: "utf8", maxBuffer: 1 << 26 }
  ).stderr;

  const sil = [];
  let curStart = null;
  for (const line of sd.split("\n")) {
    let m = line.match(/silence_start:\s*([0-9.]+)/);
    if (m) { curStart = parseFloat(m[1]); continue; }
    m = line.match(/silence_end:\s*([0-9.]+)/);
    if (m) { sil.push([curStart ?? 0, parseFloat(m[1])]); curStart = null; }
  }
  if (curStart != null) sil.push([curStart, dur]);
  return sil;
}

/** Corta UN tramo con re-encode preciso (-ss/-to DESPUES de -i, frame-exact). Expuesta
 *  (no solo interna) para que los tests puedan inyectar un reemplazo con `_cortarUnTramo`
 *  y simular un fallo puntual SIN tener que corromper un archivo de video de verdad para
 *  forzarlo — probar el "camino de fallo" de un tramo especifico contra ffmpeg real no es
 *  reproducible de forma confiable. */
export function cortarUnTramo({ entrada, ss, ee, segFile }) {
  return spawnSync("ffmpeg", [
    "-ss", ss.toFixed(3),
    "-to", ee.toFixed(3),
    "-i", entrada,
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "16",
    "-c:a", "aac", "-b:a", "256k", "-ar", "48000",
    "-avoid_negative_ts", "make_zero",
    "-y", segFile,
  ], { encoding: "utf8" });
}

/** Ejecuta ffmpeg como proceso async y rechaza con el stderr si el codigo de salida no es 0. */
function correrFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => { err += d; });
    p.on("error", (e) => reject(new Error(`No pude ejecutar ffmpeg: ${e.message}`)));
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg fallo (codigo ${code}):\n${err.slice(-2000)}`));
    });
  });
}

/**
 * Detecta los silencios de `entrada`, los saca (con colchon `pad` a cada lado) y
 * devuelve el video resultante ya concatenado y normalizado en loudness (-14 LUFS).
 * Devuelve { salida, tramos, duracionFinal, tramosFallidos }. `tramos` son los pares
 * [inicio, fin] (en el tiempo ORIGINAL de `entrada`) que se intentaron conservar, ya
 * fusionados/limpiados. `tramosFallidos` son los que ffmpeg NO pudo recortar (fallo
 * puntual de ese segmento): esos tramos quedan afuera del video final SIN abortar todo
 * el corte, pero el caller (studio.mjs) tiene que avisarlo bien fuerte — footage que
 * desaparece del video sin ningun aviso es peor que un corte que tarda mas o falla entero.
 * `_cortarUnTramo` es un punto de inyeccion para tests (default: `cortarUnTramo` real).
 */
export async function cortarSilencios({ entrada, salida, db = -30, min = 0.6, pad = 0.15, _cortarUnTramo = cortarUnTramo }) {
  const dur = duracionDe(entrada);
  const sil = await detectarSilencios({ entrada, db, min });

  // 1) Tramos a conservar, con colchon.
  const keeps = [];
  let cursor = 0;
  for (const [s, e] of sil) {
    const sPad = s + pad;
    const ePad = e - pad;
    if (sPad > cursor) keeps.push([cursor, Math.min(sPad, dur)]);
    cursor = Math.max(cursor, ePad);
  }
  if (cursor < dur) keeps.push([cursor, dur]);

  // 2) Limpiar: descartar tramos < 0.2s, fusionar adyacentes con hueco < 0.05s.
  const merged = [];
  for (const [s, e] of keeps) {
    if (e - s < 0.2) continue;
    if (merged.length && s - merged[merged.length - 1][1] < 0.05) {
      merged[merged.length - 1][1] = e;
    } else {
      merged.push([s, e]);
    }
  }
  if (merged.length === 0) {
    throw new Error("No quedo ningun tramo despues de sacar los silencios (revisa db/min/pad).");
  }

  // Nombre unico por corrida (randomUUID, mismo patron que lib/enhance.mjs con su .trf):
  // dos `cortarSilencios` concurrentes escribiendo hacia la misma carpeta de salida no
  // pueden compartir este directorio — el `rmSync` de arranque de UNA corrida borraria
  // los segmentos a medio escribir de la OTRA. Con un nombre unico, esa colision no existe.
  const tmpDir = path.join(path.dirname(salida), `_cut_exact_tmp_${randomUUID()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  // Declarado FUERA del try: `tramosFallidos` tiene que sobrevivir al bloque para
  // llegar hasta el `return` de abajo (el finally solo limpia el tmpDir, no el resultado).
  const tramosFallidos = [];
  try {
    // 3) Cortar cada tramo con re-encode preciso: -ss/-to DESPUES de -i (frame-exact)
    // es lo que evita los duplicados por I-frames que da un "-ss antes de -i" + copy.
    const segFiles = [];
    for (let i = 0; i < merged.length; i++) {
      const [ss, ee] = merged[i];
      const segFile = path.join(tmpDir, `seg_${String(i).padStart(4, "0")}.ts`);
      const r = _cortarUnTramo({ entrada, ss, ee, segFile });
      if (r.status !== 0) {
        // Segmento fallido: NO se lo salta en silencio. Se registra con el detalle real
        // de ffmpeg para que el caller pueda avisar que ese tramo de footage se perdio.
        const detalle = (r.stderr || "").toString().trim().slice(-500) || `ffmpeg salio con codigo ${r.status}`;
        tramosFallidos.push({ indice: i, desde: ss, hasta: ee, error: detalle });
        continue;
      }
      segFiles.push(segFile);
    }
    if (segFiles.length === 0) {
      throw new Error("Ningun tramo se pudo recortar (ffmpeg fallo en todos los segmentos).");
    }

    // 4) Concat list.
    const concatList = path.join(tmpDir, "concat.txt");
    fs.writeFileSync(
      concatList,
      segFiles.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n"),
      "utf8"
    );

    // 5) Pass 1: medir loudness.
    const pass1 = spawnSync("ffmpeg", [
      "-f", "concat", "-safe", "0", "-i", concatList,
      "-af", "loudnorm=I=-14:TP=-1.5:LRA=7:print_format=json",
      "-f", "null", "-",
    ], { encoding: "utf8", maxBuffer: 1 << 26 });

    const loudnormMatch = (pass1.stderr || "").match(
      /"input_i"\s*:\s*"([^"]+)"[\s\S]*?"input_tp"\s*:\s*"([^"]+)"[\s\S]*?"input_lra"\s*:\s*"([^"]+)"[\s\S]*?"input_thresh"\s*:\s*"([^"]+)"[\s\S]*?"target_offset"\s*:\s*"([^"]+)"/
    );
    let loudnormFilter;
    if (loudnormMatch) {
      const [, I, TP, LRA, TH, OFF] = loudnormMatch;
      loudnormFilter = `afftdn=nr=10:nf=-45,loudnorm=I=-14:TP=-1.5:LRA=7:measured_I=${I}:measured_TP=${TP}:measured_LRA=${LRA}:measured_thresh=${TH}:offset=${OFF}:linear=true`;
    } else {
      loudnormFilter = "afftdn=nr=10:nf=-45,loudnorm=I=-14:TP=-1.5:LRA=7";
    }

    // 6) Pass 2: concatenar + encode final con loudnorm ya medido.
    await correrFfmpeg([
      "-f", "concat", "-safe", "0", "-i", concatList,
      "-c:v", "libx264", "-preset", "medium", "-crf", "16",
      "-pix_fmt", pixFmtIntermedio(entrada), "-r", "30",
      "-af", loudnormFilter,
      "-c:a", "aac", "-b:a", "256k", "-ar", "48000",
      "-movflags", "+faststart",
      "-y", salida,
    ]);
  } finally {
    // Se borra siempre (exito o error), nunca en el "exit" del proceso: esto es un
    // modulo, no puede depender de que quien lo llame termine el proceso.
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  const duracionFinal = duracionDe(salida);
  return { salida, tramos: merged, duracionFinal, tramosFallidos };
}

/**
 * Envoltorio de `cortarSilencios` con cache atomico entre procesos: usa `conLock` (lib/
 * cache.mjs) para que dos corridas contra el mismo `entrada`+db/min/pad no corten el
 * mismo video en paralelo (double-billing de tiempo de CPU, o peor: dos procesos
 * escribiendo al mismo archivo de salida a la vez), y solo publica el resultado en
 * `salidaCache` si el corte NO tuvo tramos fallidos.
 *
 * Publicacion ATOMICA: se corta a un temporal unico (`randomUUID`, misma carpeta que
 * `salidaCache` para que el rename quede en el mismo filesystem) y se hace
 * `fs.renameSync` al nombre final recien cuando el corte termino bien. Un
 * `fs.existsSync(salidaCache)` de otro proceso jamas puede ver un archivo a medio
 * escribir con ese nombre.
 *
 * NO SE CACHEA UN CORTE CON TRAMOS FALLIDOS: un corte que perdio footage no puede
 * quedar publicado como si fuera bueno — eso volveria a hacer invisible el problema
 * que arregla `tramosFallidos` (la primera corrida avisa una vez, y todas las
 * siguientes reusarian el mismo archivo dañado en silencio). En cambio, el resultado
 * de ESA corrida se devuelve igual (`publicado: false`), para que el caller pueda
 * seguir usandolo en el render de ahora, pero la proxima corrida vuelve a cortar de
 * cero.
 *
 * Devuelve `{ yaEstaba, publicado, salida, rc? }`. `rc` (el resultado crudo de
 * `cortarSilencios`) solo viene cuando ESTA llamada hizo el corte (no cuando reusa).
 */
export async function cortarConCache({
  entrada, salidaCache, lockPath, db = -30, min = 0.6, pad = 0.15,
  rehacer = false, _cortarSilencios = cortarSilencios, opcionesLock,
}) {
  const yaListo = () => !rehacer && fs.existsSync(salidaCache);

  return conLock(lockPath, yaListo, async () => {
    // Doble chequeo (ver conLock): entre que otro proceso publico y que este
    // consiguio el lock, puede haber pasado. Si ya esta, no lo repetimos.
    if (yaListo()) return { yaEstaba: true, publicado: true, salida: salidaCache };

    const tempCorte = path.join(path.dirname(salidaCache), `.tmp-corte-${randomUUID()}.mp4`);
    try {
      const rc = await _cortarSilencios({ entrada, salida: tempCorte, db, min, pad });
      if (rc.tramosFallidos.length === 0) {
        fs.renameSync(tempCorte, salidaCache);
        return { yaEstaba: false, publicado: true, salida: salidaCache, rc };
      }
      return { yaEstaba: false, publicado: false, salida: tempCorte, rc };
    } catch (e) {
      fs.rmSync(tempCorte, { force: true });
      throw e;
    }
  }, opcionesLock);
}
