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
import fs from "node:fs";
import path from "node:path";

function duracionDe(entrada) {
  const r = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", entrada],
    { encoding: "utf8" }
  );
  return parseFloat(r.stdout.trim());
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
 * Devuelve { salida, tramos, duracionFinal }. `tramos` son los pares [inicio, fin]
 * (en el tiempo ORIGINAL de `entrada`) que se conservaron, ya fusionados/limpiados.
 */
export async function cortarSilencios({ entrada, salida, db = -30, min = 0.6, pad = 0.15 }) {
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

  const tmpDir = path.join(path.dirname(salida), "_cut_exact_tmp");
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    // 3) Cortar cada tramo con re-encode preciso: -ss/-to DESPUES de -i (frame-exact)
    // es lo que evita los duplicados por I-frames que da un "-ss antes de -i" + copy.
    const segFiles = [];
    for (let i = 0; i < merged.length; i++) {
      const [ss, ee] = merged[i];
      const segFile = path.join(tmpDir, `seg_${String(i).padStart(4, "0")}.ts`);
      const r = spawnSync("ffmpeg", [
        "-ss", ss.toFixed(3),
        "-to", ee.toFixed(3),
        "-i", entrada,
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "16",
        "-c:a", "aac", "-b:a", "256k", "-ar", "48000",
        "-avoid_negative_ts", "make_zero",
        "-y", segFile,
      ], { stdio: "pipe" });
      if (r.status !== 0) continue; // segmento fallido: se lo salta (igual que el original)
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
      "-pix_fmt", "yuv420p", "-r", "30",
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
  return { salida, tramos: merged, duracionFinal };
}
