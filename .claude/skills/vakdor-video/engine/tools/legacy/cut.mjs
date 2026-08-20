// cut.mjs — Saca silencios (jump cuts) + normaliza audio + re-encode nitido, en 16:9 nativo.
// Reutiliza la logica de ffmpeg silencedetect de la skill vakdor-video, pero sin pasar por Remotion.
//   node cut.mjs --in="crudo.mp4" --out="stage1.mp4" [--db=-30 --min=0.6 --pad=0.15]
import { spawnSync, spawn } from "node:child_process";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  })
);
const IN = args.in, OUT = args.out;
const DB = args.db ?? "-30";
const MIN = parseFloat(args.min ?? "0.6");
const PAD = parseFloat(args.pad ?? "0.15");
// Medidos en pass-1 de loudnorm sobre el original:
const M = { I: "-32.32", TP: "-2.61", LRA: "3.80", TH: "-42.54", OFF: "0.20" };

// 1) Duracion
const dur = parseFloat(
  spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", IN], {
    encoding: "utf8",
  }).stdout.trim()
);

// 2) silencedetect
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
if (curStart != null) sil.push([curStart, dur]); // silencio sin cerrar = hasta el final

// 3) keep = complemento, con colchon (encoge cada silencio por PAD de cada lado)
const keeps = [];
let cursor = 0;
for (const [s, e] of sil) {
  const sPad = s + PAD; // el silencio "efectivo" empieza mas tarde
  const ePad = e - PAD; // y termina antes -> conservamos mas voz
  if (sPad > cursor) keeps.push([cursor, Math.min(sPad, dur)]);
  cursor = Math.max(cursor, ePad);
}
if (cursor < dur) keeps.push([cursor, dur]);

// 4) limpiar: descartar tramos < 0.2s, fusionar adyacentes
const merged = [];
for (const [s, e] of keeps) {
  if (e - s < 0.2) continue;
  if (merged.length && s - merged[merged.length - 1][1] < 0.05) {
    merged[merged.length - 1][1] = e;
  } else merged.push([s, e]);
}

const kept = merged.reduce((a, [s, e]) => a + (e - s), 0);
console.log(`Duracion original: ${dur.toFixed(1)}s`);
console.log(`Silencios detectados: ${sil.length}`);
console.log(`Segmentos conservados: ${merged.length}`);
console.log(`Duracion final estimada: ${kept.toFixed(1)}s (recorta ${(dur - kept).toFixed(1)}s)`);

// 5) filter_complex select/aselect
const between = merged.map(([s, e]) => `between(t,${s.toFixed(3)},${e.toFixed(3)})`).join("+");
const vf = `[0:v]select='${between}',setpts=N/FRAME_RATE/TB[v]`;
const af =
  `[0:a]aselect='${between}',asetpts=N/SR/TB,` +
  `afftdn=nr=10:nf=-45,` +
  `loudnorm=I=-14:TP=-1.5:LRA=7:measured_I=${M.I}:measured_TP=${M.TP}:` +
  `measured_LRA=${M.LRA}:measured_thresh=${M.TH}:offset=${M.OFF}:linear=true[a]`;

const cmd = [
  "-i", IN,
  "-filter_complex", `${vf};${af}`,
  "-map", "[v]", "-map", "[a]",
  "-c:v", "libx264", "-preset", "medium", "-crf", "16",
  "-pix_fmt", "yuv420p", "-r", "30",
  "-c:a", "aac", "-b:a", "256k", "-ar", "48000",
  "-movflags", "+faststart",
  "-y", OUT,
];
console.log("Encodeando stage1...");
const p = spawn("ffmpeg", cmd, { stdio: "inherit" });
p.on("exit", (code) => process.exit(code ?? 0));
