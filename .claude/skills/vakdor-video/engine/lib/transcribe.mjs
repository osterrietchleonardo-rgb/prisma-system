// lib/transcribe.mjs — Transcribe audio/video con la API de Groq (Whisper-Large-v3).
//
// Portado desde `Prisma - MK\_motor-video\transcribe-groq.mjs`, con UNA correccion
// obligatoria verificada contra la API real el 11-ago-2026: el script original pedia
// response_format=verbose_json SIN pedir granularidad de palabra, asi que repartia el
// tiempo de cada palabra dividiendo el texto del segmento en partes iguales — tiempos
// ESTIMADOS. El anclaje de efectos a la palabra hablada necesita tiempos REALES, asi
// que ahora se piden las DOS granularidades:
//   timestamp_granularities[]=word     -> sin esto, los tiempos por palabra son estimados
//   timestamp_granularities[]=segment  -> sin esto, `segments` vuelve null (se pierde el SRT)
// Probado con voz real: una muestra de 25s devolvio 87 palabras con start/end propios
// mas 6 segmentos.
//
// COSTO: `transcribir()` llama a la API de Groq y esa llamada CUESTA. Ningun test de
// este proyecto puede invocarla; ver tests/transcribe.test.mjs (solo fixtures locales).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { conLock } from "./cache.mjs";

const MAX_CHARS = 46;

function fmtSrt(sec) {
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const mil = Math.floor(ms % 1000);
  const p = (n, l = 2) => String(n).padStart(l, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(mil, 3)}`;
}

/** Arma el .srt (con line-wrap a MAX_CHARS, timing repartido dentro del segmento)
 *  a partir de los `segments` que devuelve Groq. Logica identica a la del script
 *  original: esto es solo para las LINEAS de subtitulo, no para el anclaje por
 *  palabra (eso lo hace `extraerPalabras` con tiempos reales, no repartidos). */
export function armarSrt(segments) {
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
      srtLines.push(`${lineIdx++}\n${fmtSrt(cursor)} --> ${fmtSrt(subEnd)}\n${c}\n`);
      cursor = subEnd;
    }
  }

  return srtLines.join("\n");
}

/** Extrae las palabras con sus tiempos REALES de la respuesta de Groq (viene de
 *  pedir timestamp_granularities[]=word). Si Groq no las devolvio, devuelve []
 *  EN VEZ de inventar tiempos repartiendo el texto: un aviso claro de "no puedo
 *  anclar por palabra" (lo hace recipe.mjs) es preferible a un efecto en el
 *  momento equivocado. */
export function extraerPalabras(data) {
  return (data?.words ?? []).map((w) => ({
    texto: w.word,
    inicioSec: w.start,
    finSec: w.end,
  }));
}

/** Resuelve la API key: el parametro explicito gana, despues la variable de
 *  entorno GROQ_API_KEY, y si no hay ninguna devuelve null (no tira). */
export function apiKeyDe(apiKey) {
  return apiKey || process.env.GROQ_API_KEY || null;
}

/**
 * Transcribe `entrada` (video o audio) con Groq whisper-large-v3 y devuelve
 * { srt, palabras }. `palabras` tiene el shape que consume cargarReceta de
 * lib/recipe.mjs: [{ texto, inicioSec, finSec }].
 *
 * Tira ANTES de tocar ffmpeg o la red si no hay API key (asi un caller que se
 * olvido de configurarla no gasta nada intentando).
 */
export async function transcribir({ entrada, apiKey, idioma = "es" }) {
  const key = apiKeyDe(apiKey);
  if (!key) {
    throw new Error(
      "Se necesita una API Key de Groq (parametro apiKey o variable de entorno " +
      "GROQ_API_KEY). Se consigue gratis en https://console.groq.com/keys"
    );
  }

  // Groq acepta hasta 25MB por request: extraemos audio MP3 mono 64k (~8MB para 20min).
  const tmpAudio = path.join(os.tmpdir(), `vakdor-groq-audio-${process.pid}-${Date.now()}.mp3`);
  try {
    const ext = spawnSync(
      "ffmpeg",
      ["-i", entrada, "-vn", "-ar", "16000", "-ac", "1", "-b:a", "64k", "-y", tmpAudio],
      { stdio: "pipe" }
    );
    if (ext.status !== 0) {
      throw new Error(`No pude extraer el audio para Groq: ${ext.stderr}`);
    }

    const form = new FormData();
    form.append("file", new Blob([fs.readFileSync(tmpAudio)]), path.basename(tmpAudio));
    form.append("model", "whisper-large-v3");
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "word");
    form.append("timestamp_granularities[]", "segment");
    form.append("language", idioma ?? "es");

    const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!r.ok) {
      throw new Error(`Groq respondio ${r.status}: ${await r.text()}`);
    }
    const data = await r.json();

    return {
      srt: armarSrt(data.segments ?? []),
      palabras: extraerPalabras(data),
    };
  } finally {
    fs.rmSync(tmpAudio, { force: true });
  }
}

/**
 * Envoltorio de `transcribir` con cache atomico entre procesos (mismo mecanismo que
 * `cortarConCache` en lib/cut.mjs: ver ese comentario para el porque). Sin este cache,
 * dos corridas de studio.mjs contra el mismo video (tipico al iterar con --preview)
 * pagan Groq dos veces por el mismo resultado — el lock (`conLock`, lib/cache.mjs)
 * hace que solo UNA de las dos llame de verdad a la API.
 *
 * Publicacion atomica: las palabras se escriben a un `.json` temporal (nombre unico) y
 * recien se `fs.renameSync` al nombre final de cache cuando terminaron de escribirse
 * enteras — un `fs.existsSync(palabrasCache)` de otro proceso jamas ve un JSON a medio
 * escribir.
 *
 * Devuelve `{ yaEstaba, palabras }`.
 */
export async function transcribirConCache({
  entrada, palabrasCache, lockPath, apiKey, idioma = "es",
  rehacer = false, _transcribir = transcribir, opcionesLock,
}) {
  const yaListo = () => !rehacer && fs.existsSync(palabrasCache);

  return conLock(lockPath, yaListo, async () => {
    if (yaListo()) {
      return { yaEstaba: true, palabras: JSON.parse(fs.readFileSync(palabrasCache, "utf8")) };
    }
    const { palabras } = await _transcribir({ entrada, apiKey, idioma });
    const tempPalabras = path.join(path.dirname(palabrasCache), `.tmp-palabras-${randomUUID()}.json`);
    fs.writeFileSync(tempPalabras, JSON.stringify(palabras), "utf8");
    fs.renameSync(tempPalabras, palabrasCache);
    return { yaEstaba: false, palabras };
  }, opcionesLock);
}
