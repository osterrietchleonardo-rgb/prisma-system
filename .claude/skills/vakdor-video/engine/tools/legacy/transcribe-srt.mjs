// transcribe-srt.mjs — Transcribe un WAV/MP4 a .srt (frases cortas) con whisper.cpp local.
// Reutiliza @remotion/install-whisper-cpp (mismo motor que edit.mjs de la skill vakdor-video).
//   node transcribe-srt.mjs --prewarm --model=medium            (solo instala whisper.cpp + baja modelo)
//   node transcribe-srt.mjs --in="x.wav" --out="x.srt" --model=medium --lang=es
import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  })
);
const model = args.model ?? "medium";
const lang = args.lang ?? "es";
// IMPORTANTE (Windows): install-whisper-cpp usa Expand-Archive sin comillas y se rompe con
// paths con espacios ("Antigravity - Apps\Prisma"). Por eso instalamos en una ruta SIN espacios.
const whisperPath = args.whisperdir ?? "C:\\whisper-cpp";

const { downloadWhisperModel, installWhisperCpp, transcribe, toCaptions } = await import(
  "@remotion/install-whisper-cpp"
);

// Guard: en Windows con repo bajo path con espacios, el instalador (Expand-Archive sin comillas)
// se rompe. Si ya pusimos binarios + modelo a mano en C:\whisper-cpp, saltamos el instalador.
const binOk = fs.existsSync(path.join(whisperPath, "main.exe")) ||
  fs.existsSync(path.join(whisperPath, "whisper-cli.exe"));
const modelOk = fs.existsSync(path.join(whisperPath, `ggml-${model}.bin`));
if (binOk && modelOk) {
  console.log(`[whisper] binarios + modelo '${model}' ya presentes en ${whisperPath} (salto instalador).`);
} else {
  console.log(`[whisper] instalando whisper.cpp 1.5.5 + modelo '${model}'...`);
  if (!binOk) await installWhisperCpp({ to: whisperPath, version: "1.5.5" });
  if (!modelOk) await downloadWhisperModel({ model, folder: whisperPath });
  console.log("[whisper] listo.");
}

if (args.prewarm) {
  console.log("[whisper] prewarm completo (sin transcribir).");
  process.exit(0);
}

const inPath = args.in;
const outPath = args.out;
if (!inPath || !outPath) {
  console.error("Faltan --in y --out");
  process.exit(1);
}

// whisper.cpp quiere WAV 16k mono. Si viene mp4/otro, convierto.
let wav = inPath;
if (!/\.wav$/i.test(inPath)) {
  wav = path.join(whisperPath, "_in16k.wav");
  spawnSync("ffmpeg", ["-i", inPath, "-ar", "16000", "-ac", "1", "-y", wav], { encoding: "utf8" });
}

// --- Obtener transcripcion a nivel de SEGMENTO (texto limpio, no tokens fragmentados) ---
const rawJsonPath = outPath.replace(/\.srt$/i, ".raw.json");
let transcription;
if (args["from-json"]) {
  console.log(`[whisper] reconstruyendo desde JSON: ${args["from-json"]}`);
  transcription = JSON.parse(fs.readFileSync(args["from-json"], "utf8"));
} else {
  console.log(`[whisper] transcribiendo ${path.basename(wav)} (${lang})...`);
  const res = await transcribe({
    inputPath: wav,
    model,
    whisperPath,
    whisperCppVersion: "1.5.5", // instalacion manual -> binarios 1.5.5 (usan main.exe)
    language: lang,
    tokenLevelTimestamps: false, // frases completas por segmento (no 1 token/segmento)
    tokensPerItem: 0, // 0 => sin --max-len => segmentos naturales de whisper.cpp
  });
  transcription = res.transcription;
  fs.writeFileSync(rawJsonPath, JSON.stringify(transcription), "utf8");
  console.log(`[whisper] JSON crudo guardado: ${rawJsonPath} (${transcription.length} segmentos)`);
}

// Cada segmento: { offsets: {from,to} en ms, text }. Partimos los largos en lineas <= ~46 chars.
const MAX_CHARS = 46;
const MAX_DUR = 4200;
const lines = [];
for (const seg of transcription) {
  const text = (seg.text ?? "").trim();
  if (!text) continue;
  const from = seg.offsets?.from ?? 0;
  const to = seg.offsets?.to ?? from + 1500;
  // Partir por palabras si el segmento es largo (texto o duracion)
  const words = text.split(/\s+/);
  const chunks = [];
  let buf = "";
  for (const w of words) {
    if (buf && (buf.length + 1 + w.length) > MAX_CHARS) {
      chunks.push(buf);
      buf = w;
    } else buf = buf ? `${buf} ${w}` : w;
  }
  if (buf) chunks.push(buf);
  // Repartir el tiempo del segmento proporcional a los caracteres de cada chunk
  const total = chunks.reduce((a, c) => a + c.length, 0) || 1;
  let cursor = from;
  for (const c of chunks) {
    const dur = Math.min(MAX_DUR, ((to - from) * c.length) / total);
    lines.push({ start: cursor, end: cursor + dur, text: c });
    cursor += dur;
  }
}

const fmt = (ms) => {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const mil = Math.floor(ms % 1000);
  const p = (n, l = 2) => String(n).padStart(l, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(mil, 3)}`;
};
const srt = lines
  .map((l, i) => `${i + 1}\n${fmt(l.start)} --> ${fmt(l.end)}\n${l.text}\n`)
  .join("\n");
fs.writeFileSync(outPath, srt, "utf8");
console.log(`[whisper] SRT escrito: ${outPath} (${lines.length} lineas)`);
