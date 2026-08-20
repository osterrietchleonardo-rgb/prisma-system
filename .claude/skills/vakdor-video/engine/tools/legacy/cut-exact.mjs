// cut-exact.mjs — Saca silencios con precisión de frame exacta para videos largos.
// Re-encodea cada segmento con -ss y -to (frame-exact) para evitar duplicación de I-frames,
// y luego concatena y aplica la normalización de audio loudnorm.

import { spawnSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  })
);
const IN = args.in, OUT = args.out;
if (!IN || !OUT) { console.error("Uso: node cut-exact.mjs --in=video.mp4 --out=stage1.mp4"); process.exit(1); }
const DB = args.db ?? "-30";
const MIN = parseFloat(args.min ?? "0.6");
const PAD = parseFloat(args.pad ?? "0.15");

// 1) Duración
const dur = parseFloat(
  spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", IN], {
    encoding: "utf8",
  }).stdout.trim()
);
console.log(`Duración original: ${dur.toFixed(1)}s`);

// 2) silencedetect
console.log("Detectando silencios...");
const sd = spawnSync(
  "ffmpeg",
  ["-i", IN, "-af", `silencedetect=noise=${DB}dB:d=${MIN}`, "-f", "null", "-"],
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

// 3) keep segments con colchón
const keeps = [];
let cursor = 0;
for (const [s, e] of sil) {
  const sPad = s + PAD;
  const ePad = e - PAD;
  if (sPad > cursor) keeps.push([cursor, Math.min(sPad, dur)]);
  cursor = Math.max(cursor, ePad);
}
if (cursor < dur) keeps.push([cursor, dur]);

// Limpiar: descartar tramos < 0.2s, fusionar adyacentes
const merged = [];
for (const [s, e] of keeps) {
  if (e - s < 0.2) continue;
  if (merged.length && s - merged[merged.length - 1][1] < 0.05) {
    merged[merged.length - 1][1] = e;
  } else merged.push([s, e]);
}

const kept = merged.reduce((a, [s, e]) => a + (e - s), 0);
console.log(`Silencios: ${sil.length} | Segmentos: ${merged.length} | Duración final esperada: ${kept.toFixed(1)}s (recorta ${(dur - kept).toFixed(1)}s)`);

// 4) Cortar cada segmento con re-encode preciso (-ss despues de -i para frame-accuracy)
const tmpDir = path.join(path.dirname(OUT), "_cut_exact_tmp");
fs.rmSync(tmpDir, { recursive: true, force: true });
fs.mkdirSync(tmpDir, { recursive: true });

console.log(`Procesando ${merged.length} tramos (frame-exact)...`);
const segFiles = [];
for (let i = 0; i < merged.length; i++) {
  const [ss, ee] = merged[i];
  const segFile = path.join(tmpDir, `seg_${String(i).padStart(4, "0")}.ts`);
  // -ss y -to despues de -i con re-encode ultrafast garantiza precision milimetrica
  const r = spawnSync("ffmpeg", [
    "-ss", ss.toFixed(3),
    "-to", ee.toFixed(3),
    "-i", IN,
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "16",
    "-c:a", "aac", "-b:a", "256k", "-ar", "48000",
    "-avoid_negative_ts", "make_zero",
    "-y", segFile,
  ], { stdio: "pipe" });
  if (r.status !== 0) {
    console.error(`  Error en segmento ${i} (${ss.toFixed(1)}-${ee.toFixed(1)}s)`);
    continue;
  }
  segFiles.push(segFile);
  if ((i + 1) % 20 === 0 || i === merged.length - 1) {
    process.stdout.write(`  ${i + 1}/${merged.length}\r`);
  }
}
console.log(`\nSegmentos recortados exactamente: ${segFiles.length}`);

// 5) Crear concat list
const concatList = path.join(tmpDir, "concat.txt");
const concatContent = segFiles.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n");
fs.writeFileSync(concatList, concatContent, "utf8");

// 6) Concatenar + re-encode final con loudnorm (2-pass)
console.log("Pass 1: midiendo loudness...");
const pass1 = spawnSync("ffmpeg", [
  "-f", "concat", "-safe", "0", "-i", concatList,
  "-af", "loudnorm=I=-14:TP=-1.5:LRA=7:print_format=json",
  "-f", "null", "-",
], { encoding: "utf8", maxBuffer: 1 << 26 });

const loudnormMatch = (pass1.stderr || "").match(/"input_i"\s*:\s*"([^"]+)"[\s\S]*?"input_tp"\s*:\s*"([^"]+)"[\s\S]*?"input_lra"\s*:\s*"([^"]+)"[\s\S]*?"input_thresh"\s*:\s*"([^"]+)"[\s\S]*?"target_offset"\s*:\s*"([^"]+)"/);
let loudnormFilter;
if (loudnormMatch) {
  const [, I, TP, LRA, TH, OFF] = loudnormMatch;
  console.log(`  Mediciones: I=${I} TP=${TP} LRA=${LRA}`);
  loudnormFilter = `afftdn=nr=10:nf=-45,loudnorm=I=-14:TP=-1.5:LRA=7:measured_I=${I}:measured_TP=${TP}:measured_LRA=${LRA}:measured_thresh=${TH}:offset=${OFF}:linear=true`;
} else {
  console.log("  Usando loudnorm standard.");
  loudnormFilter = "afftdn=nr=10:nf=-45,loudnorm=I=-14:TP=-1.5:LRA=7";
}

console.log("Pass 2: encode final con loudnorm...");
const finalProc = spawn("ffmpeg", [
  "-f", "concat", "-safe", "0", "-i", concatList,
  "-c:v", "libx264", "-preset", "medium", "-crf", "16",
  "-pix_fmt", "yuv420p", "-r", "30",
  "-af", loudnormFilter,
  "-c:a", "aac", "-b:a", "256k", "-ar", "48000",
  "-movflags", "+faststart",
  "-y", OUT,
], { stdio: "inherit" });

finalProc.on("exit", (code) => {
  console.log("Limpiando temporales...");
  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (code === 0) {
    console.log(`\n✓ Listo: ${OUT}`);
  } else {
    console.error(`\n✗ Error (exit ${code})`);
  }
  process.exit(code ?? 0);
});
