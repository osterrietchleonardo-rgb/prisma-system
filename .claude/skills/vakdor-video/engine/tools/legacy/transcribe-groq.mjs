// transcribe-groq.mjs — Transcribe audio/video ultrarrápido usando la API GRATUITA de Groq (Whisper-Large-v3).
// Transcribe 20 minutos en ~3-5 segundos.
//
// Uso:
//   node transcribe-groq.mjs --in="stage1-cut.mp4" --out="subs.srt" [--key="gsk_..."]

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  })
);

const apiKey = args.key || process.env.GROQ_API_KEY;
const inPath = args.in;
const outPath = args.out;

if (!inPath || !outPath) {
  console.error("Faltan --in y --out. Uso: node transcribe-groq.mjs --in=video.mp4 --out=subs.srt [--key=gsk_...]");
  process.exit(1);
}

if (!apiKey) {
  console.error("\n❌ Error: Se necesita una API Key de Groq.");
  console.error("Podés obtener una 100% GRATIS en: https://console.groq.com/keys");
  console.error("Luego ejecutá: node transcribe-groq.mjs --in=... --out=... --key=gsk_...\n");
  process.exit(1);
}

// Groq acepta hasta 25MB por request. Extraemos audio MP3 mono 64k (~8MB para 20min).
const tmpAudio = path.join(__dirname, "_groq_audio.mp3");
console.log("Extrayendo audio comprimido para Groq API...");
spawnSync("ffmpeg", ["-i", inPath, "-vn", "-ar", "16000", "-ac", "1", "-b:a", "64k", "-y", tmpAudio], { stdio: "pipe" });

const stats = fs.statSync(tmpAudio);
console.log(`Audio listo: ${(stats.size / 1024 / 1024).toFixed(2)} MB. Enviando a Groq API (whisper-large-v3)...`);

const startTime = Date.now();

const audioBuffer = fs.readFileSync(tmpAudio);
const boundary = "----WebKitFormBoundary" + Math.random().toString(36).substring(2);

function buildMultipart(fields, fileField) {
  const chunks = [];
  for (const [k, v] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${fileField.name}"; filename="${fileField.filename}"\r\nContent-Type: ${fileField.type}\r\n\r\n`));
  chunks.push(fileField.buffer);
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return Buffer.concat(chunks);
}

const body = buildMultipart(
  {
    model: "whisper-large-v3",
    response_format: "verbose_json",
    language: "es",
    temperature: "0.0",
  },
  {
    name: "file",
    filename: "audio.mp3",
    type: "audio/mp3",
    buffer: audioBuffer,
  }
);

try {
  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body: body,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API Error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n✓ Transcripción completa en solo ${elapsed}s con Groq whisper-large-v3!`);

  const fmt = (sec) => {
    const ms = Math.round(sec * 1000);
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const mil = Math.floor(ms % 1000);
    const p = (n, l = 2) => String(n).padStart(l, "0");
    return `${p(h)}:${p(m)}:${p(s)},${p(mil, 3)}`;
  };

  const segments = data.segments || [];
  const MAX_CHARS = 46;
  const srtLines = [];
  let lineIdx = 1;

  for (const seg of segments) {
    const text = (seg.text || "").trim();
    if (!text) continue;
    const start = seg.start;
    const end = seg.end;
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

    const total = chunks.reduce((a, c) => a + c.length, 0) || 1;
    let cursor = start;
    for (const c of chunks) {
      const dur = Math.max(0.8, ((end - start) * c.length) / total);
      const subEnd = Math.min(end, cursor + dur);
      srtLines.push(`${lineIdx++}\n${fmt(cursor)} --> ${fmt(subEnd)}\n${c}\n`);
      cursor = subEnd;
    }
  }

  const srtContent = srtLines.join("\n");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, srtContent, "utf8");
  console.log(`✓ SRT profesional guardado en: ${outPath} (${srtLines.length} líneas)`);

} catch (err) {
  console.error("Error al transcribir con Groq:", err.message);
  process.exit(1);
} finally {
  fs.rmSync(tmpAudio, { force: true });
}
