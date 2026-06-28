// edit.mjs — modo EDITOR del motor Vakdor-Video.
// Edita un video CRUDO: saca silencios (jump cuts), pone subtitulos, marca e intro/outro.
//
// Uso minimo:
//   node edit.mjs --video="C:\ruta\crudo.mp4" --out="C:\...\final.mp4"
//
// Opciones:
//   --subtitles            Transcribe el audio con Whisper (local) y agrega subtitulos.
//   --captions="x.srt"     Usa un .srt existente como subtitulos (no necesita Whisper).
//   --lang=es              Idioma para Whisper (default es).
//   --model=base           Modelo Whisper (base|small|medium). Mas grande = mejor y mas lento.
//   --silence-db=-30       Umbral de silencio en dB (mas negativo = mas estricto).
//   --min-silence=0.6      Duracion minima (seg) para considerar un silencio cortable.
//   --pad=0.06             Colchon (seg) que se deja a cada lado del corte.
//   --min-keep=0.25        Descarta tramos buenos mas cortos que esto (seg).
//   --no-intro --no-outro --no-watermark --no-subtitles
//   --title="..."  --contact="..."
//
// Regla de oro: la salida SIEMPRE va a "Prisma - MK". Nunca escribe en PRISMA-SYSTEM.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  })
);

const videoPath = args.video;
const outPath = args.out;
if (!videoPath || !outPath) {
  console.error('Faltan argumentos. Uso: node edit.mjs --video="crudo.mp4" --out="final.mp4"');
  process.exit(1);
}
if (!fs.existsSync(videoPath)) {
  console.error("No existe el video: " + videoPath);
  process.exit(1);
}

const opt = {
  silenceDb: Number(args["silence-db"] ?? -30),
  minSilence: Number(args["min-silence"] ?? 0.6),
  pad: Number(args.pad ?? 0.06),
  minKeep: Number(args["min-keep"] ?? 0.25),
  lang: args.lang ?? "es",
  model: args.model ?? "base",
  brandIntro: !args["no-intro"],
  brandOutro: !args["no-outro"],
  watermark: !args["no-watermark"],
  subtitles: Boolean(args.subtitles || args.captions) && !args["no-subtitles"],
  title: args.title ?? "Vakdor · PRISMA",
  contact: args.contact ?? "@vakdor · WhatsApp",
};

const ff = (a) => spawnSync("ffmpeg", a, { encoding: "utf8" });
const ffprobe = (a) => spawnSync("ffprobe", a, { encoding: "utf8" });

// 1) Duracion del video
function getDuration() {
  const r = ffprobe(["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", videoPath]);
  const d = parseFloat((r.stdout || "").trim());
  if (!d || Number.isNaN(d)) throw new Error("No pude leer la duracion del video (ffprobe).");
  return d;
}

// 2) Deteccion de silencios -> tramos a CONSERVAR
function detectKeepSegments(duration) {
  const r = ff(["-i", videoPath, "-af", `silencedetect=noise=${opt.silenceDb}dB:d=${opt.minSilence}`, "-f", "null", "-"]);
  const log = (r.stderr || "") + (r.stdout || "");
  const silences = [];
  let curStart = null;
  for (const line of log.split(/\r?\n/)) {
    const ms = line.match(/silence_start:\s*([0-9.]+)/);
    const me = line.match(/silence_end:\s*([0-9.]+)/);
    if (ms) curStart = parseFloat(ms[1]);
    if (me && curStart !== null) {
      silences.push([curStart, parseFloat(me[1])]);
      curStart = null;
    }
  }
  // Complemento de los silencios = tramos con voz/sonido
  const keep = [];
  let cursor = 0;
  for (const [s, e] of silences) {
    if (s - cursor > 0) keep.push([cursor, s]);
    cursor = e;
  }
  if (duration - cursor > 0) keep.push([cursor, duration]);

  // Colchon + descartar microtramos
  return keep
    .map(([s, e]) => [Math.max(0, s - opt.pad), Math.min(duration, e + opt.pad)])
    .filter(([s, e]) => e - s >= opt.minKeep)
    .map(([from, to]) => ({ from: +from.toFixed(3), to: +to.toFixed(3) }));
}

// 3) Subtitulos
function srtToCaptions(srtPath) {
  const raw = fs.readFileSync(srtPath, "utf8");
  const toMs = (t) => {
    const m = t.match(/(\d+):(\d+):(\d+)[,.](\d+)/);
    return m ? (+m[1] * 3600 + +m[2] * 60 + +m[3]) * 1000 + +m[4] : 0;
  };
  const caps = [];
  for (const block of raw.split(/\r?\n\r?\n/)) {
    const lines = block.split(/\r?\n/).filter(Boolean);
    const timing = lines.find((l) => l.includes("-->"));
    if (!timing) continue;
    const [a, b] = timing.split("-->");
    const text = lines.slice(lines.indexOf(timing) + 1).join(" ").trim();
    if (!text) continue;
    const startMs = toMs(a);
    const endMs = toMs(b);
    // dividimos la frase en palabras con tiempos proporcionales (subtitulo palabra-a-palabra)
    const words = text.split(/\s+/);
    const dur = Math.max(endMs - startMs, 1);
    words.forEach((w, i) => {
      const fromMs = startMs + (dur * i) / words.length;
      const toMsW = startMs + (dur * (i + 1)) / words.length;
      caps.push({ text: (i ? " " : "") + w, startMs: fromMs, endMs: toMsW, timestampMs: (fromMs + toMsW) / 2, confidence: 1 });
    });
  }
  return caps;
}

async function whisperCaptions(wavPath) {
  const { downloadWhisperModel, installWhisperCpp, transcribe, toCaptions } = await import(
    "@remotion/install-whisper-cpp"
  );
  const whisperPath = path.join(__dirname, "whisper.cpp");
  console.log("Whisper: instalando (1a vez compila whisper.cpp y baja el modelo)...");
  await installWhisperCpp({ to: whisperPath, version: "1.5.5" });
  await downloadWhisperModel({ model: opt.model, folder: whisperPath });
  const { transcription } = await transcribe({
    inputPath: wavPath,
    model: opt.model,
    whisperPath,
    language: opt.lang,
    tokenLevelTimestamps: true,
  });
  const { captions } = toCaptions({ whisperCppOutput: { transcription } });
  return captions;
}

// Re-mapea subtitulos del tiempo del video CRUDO al tiempo del video EDITADO (sin silencios)
function remapCaptions(caps, segments) {
  // offsets acumulados de cada tramo en la linea de tiempo editada
  const segMap = [];
  let acc = 0;
  for (const s of segments) {
    segMap.push({ fromMs: s.from * 1000, toMs: s.to * 1000, offsetMs: acc });
    acc += (s.to - s.from) * 1000;
  }
  const out = [];
  for (const c of caps) {
    const seg = segMap.find((s) => c.startMs >= s.fromMs && c.startMs < s.toMs);
    if (!seg) continue; // cae en un silencio borrado -> se descarta
    const shift = seg.offsetMs - seg.fromMs;
    out.push({
      text: c.text,
      startMs: c.startMs + shift,
      endMs: c.endMs + shift,
      timestampMs: (c.timestampMs ?? (c.startMs + c.endMs) / 2) + shift,
      confidence: c.confidence ?? 1,
    });
  }
  return out;
}

async function main() {
  const duration = getDuration();
  console.log(`Duracion: ${duration.toFixed(2)}s`);

  const segments = detectKeepSegments(duration);
  const keptSec = segments.reduce((a, s) => a + (s.to - s.from), 0);
  console.log(`Tramos conservados: ${segments.length} (${keptSec.toFixed(2)}s de ${duration.toFixed(2)}s; se sacaron ${(duration - keptSec).toFixed(2)}s de silencio)`);
  if (!segments.length) {
    console.error("No quedaron tramos. Afloja --silence-db (ej -40) o --min-silence.");
    process.exit(1);
  }

  // Copiar el video crudo a public/current/
  const publicCurrent = path.join(__dirname, "public", "current");
  fs.rmSync(publicCurrent, { recursive: true, force: true });
  fs.mkdirSync(publicCurrent, { recursive: true });
  const ext = path.extname(videoPath) || ".mp4";
  fs.copyFileSync(videoPath, path.join(publicCurrent, `raw${ext}`));
  const videoSrc = `current/raw${ext}`;

  // Subtitulos (opcional)
  let captions = null;
  if (opt.subtitles) {
    let rawCaps = [];
    if (args.captions) {
      console.log("Subtitulos desde SRT: " + args.captions);
      rawCaps = srtToCaptions(args.captions);
    } else {
      const wav = path.join(publicCurrent, "audio16k.wav");
      ff(["-i", videoPath, "-ar", "16000", "-ac", "1", "-y", wav]);
      rawCaps = await whisperCaptions(wav);
    }
    captions = remapCaptions(rawCaps, segments);
    console.log(`Subtitulos: ${captions.length} tokens mapeados a la linea editada.`);
  }

  // Props para la composicion
  const props = {
    videoSrc,
    segments,
    captions,
    showSubtitles: opt.subtitles,
    watermark: opt.watermark,
    brandIntro: opt.brandIntro,
    brandOutro: opt.brandOutro,
    title: opt.title,
    contact: opt.contact,
  };
  const resolvedPath = path.join(__dirname, ".edit.props.json");
  fs.writeFileSync(resolvedPath, JSON.stringify(props, null, 2));

  // Render
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const cliPath = path.join(__dirname, "node_modules", "@remotion", "cli", "remotion-cli.js");
  const r = spawnSync(
    process.execPath,
    [cliPath, "render", "EditedReel", outPath, `--props=${resolvedPath}`],
    { cwd: __dirname, stdio: "inherit" }
  );
  fs.rmSync(resolvedPath, { force: true });
  process.exit(r.status ?? 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
