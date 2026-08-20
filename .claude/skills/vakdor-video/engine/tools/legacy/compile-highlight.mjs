// compile-highlight.mjs — Crea compilaciones profesionales (highlights/ads) desde un video largo.
// Usa ffmpeg para: clips precisos, crossfade transitions, title cards de marca, color grading, watermark.
//
// Uso:
//   node compile-highlight.mjs --config="config.json" --out="highlight.mp4"
//
// El config.json define los clips, textos, y estilo. Ver ejemplo abajo.

import { spawnSync, spawn } from "node:child_process";
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

const configPath = args.config;
const outPath = args.out;
if (!configPath || !outPath) {
  console.error("Uso: node compile-highlight.mjs --config=config.json --out=output.mp4");
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const SRC = config.source;
const CLIPS = config.clips; // [{ from, to, label?, labelSub? }]
const BRAND = config.brand || {
  bg: "#0A0F1A",
  accent: "#C07C41",
  title: "#FFFFFF",
  text: "#B4BAC5",
};
const FORMAT = config.format || "vertical"; // "vertical" (1080x1920) | "horizontal" (1920x1080)
const TITLE_CARD = config.titleCard || null; // { text, subtext, durationSec }
const CTA_CARD = config.ctaCard || null; // { text, subtext, durationSec }
const TRANSITION_SEC = config.transitionSec ?? 0.4;
const COLOR_GRADE = config.colorGrade ?? "cinematic"; // cinematic | warm | none
const USE_GPU = config.useGpu ?? true;

// Dimensions
const W = FORMAT === "vertical" ? 1080 : 1920;
const H = FORMAT === "vertical" ? 1920 : 1080;
// Video zone within vertical frame (top portion, 16:9 ratio within 1080 width)
const VID_W = FORMAT === "vertical" ? 1080 : 1920;
const VID_H = FORMAT === "vertical" ? 608 : 1080; // 1080 * 9/16 = 607.5
const VID_Y = FORMAT === "vertical" ? 180 : 0; // offset from top

const tmpDir = path.join(path.dirname(outPath), "_highlight_tmp_" + path.basename(outPath, path.extname(outPath)));
fs.rmSync(tmpDir, { recursive: true, force: true });
fs.mkdirSync(tmpDir, { recursive: true });

// ======================== HELPERS ========================

function ffmpegSync(args, label) {
  const r = spawnSync("ffmpeg", args, { stdio: "pipe", maxBuffer: 1 << 26 });
  if (r.status !== 0) {
    console.error(`  ✗ ${label}: ${(r.stderr || "").toString().slice(-500)}`);
    return false;
  }
  return true;
}

function escapeDrawtext(text) {
  return text.replace(/:/g, "\\:").replace(/'/g, "\\'").replace(/\\/g, "\\\\");
}

// Detect fonts path
function getFontPath() {
  const candidates = [
    path.join(__dirname, "fonts", "Inter-SemiBold-600.ttf"),
    "C:/Windows/Fonts/segoeuib.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
  ];
  for (const f of candidates) {
    if (fs.existsSync(f)) return f.replace(/\\/g, "/").replace(/:/g, "\\:");
  }
  return "C\\:/Windows/Fonts/arialbd.ttf";
}

const FONT = getFontPath();
const FONT_LIGHT_CANDIDATES = [
  path.join(__dirname, "fonts", "Inter-SemiBold-600.ttf"),
  "C:/Windows/Fonts/segoeui.ttf",
  "C:/Windows/Fonts/arial.ttf",
];
function getFontLightPath() {
  for (const f of FONT_LIGHT_CANDIDATES) {
    if (fs.existsSync(f)) return f.replace(/\\/g, "/").replace(/:/g, "\\:");
  }
  return FONT;
}
const FONT_LIGHT = getFontLightPath();

// ======================== STEP 1: Extract clips ========================
console.log(`\n🎬 Compilando ${CLIPS.length} clips del video fuente...`);
console.log(`   Formato: ${W}x${H} (${FORMAT})`);
console.log(`   Transiciones: ${TRANSITION_SEC}s crossfade`);
console.log(`   Color grading: ${COLOR_GRADE}\n`);

const clipFiles = [];

// Color grading filter
function getColorGradeFilter() {
  switch (COLOR_GRADE) {
    case "cinematic":
      return "eq=contrast=1.08:brightness=0.02:saturation=0.92,curves=m='0/0 0.25/0.20 0.5/0.52 0.75/0.82 1/1'";
    case "warm":
      return "eq=contrast=1.05:brightness=0.03:saturation=1.1,colorbalance=rs=0.05:gs=0.02:bs=-0.03";
    case "cool":
      return "eq=contrast=1.06:brightness=0.01:saturation=0.95,colorbalance=rs=-0.03:gs=0.01:bs=0.05";
    default:
      return null;
  }
}

const cgFilter = getColorGradeFilter();

for (let i = 0; i < CLIPS.length; i++) {
  const clip = CLIPS[i];
  const clipFile = path.join(tmpDir, `clip_${String(i).padStart(3, "0")}.mp4`);
  
  let vf = [];
  
  if (FORMAT === "vertical") {
    // Scale source to fit width, then pad to place in upper portion
    vf.push(`scale=${VID_W}:${VID_H}:force_original_aspect_ratio=decrease`);
    vf.push(`pad=${W}:${H}:(ow-iw)/2:${VID_Y}:color=${BRAND.bg.replace('#', '0x')}`);
  } else {
    vf.push(`scale=${W}:${H}:force_original_aspect_ratio=decrease`);
    vf.push(`pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${BRAND.bg.replace('#', '0x')}`);
  }
  
  // Color grading
  if (cgFilter) vf.push(cgFilter);
  
  // Label overlay (text overlay in the lower area for vertical)
  if (clip.label && FORMAT === "vertical") {
    const labelY = VID_Y + VID_H + 120;
    const escaped = escapeDrawtext(clip.label);
    vf.push(
      `drawtext=fontfile='${FONT}':text='${escaped}':fontcolor=${BRAND.title}:fontsize=52:x=(w-tw)/2:y=${labelY}:alpha='if(lt(t,0.3),t/0.3,1)'`
    );
    if (clip.labelSub) {
      const subY = labelY + 70;
      const escapedSub = escapeDrawtext(clip.labelSub);
      vf.push(
        `drawtext=fontfile='${FONT_LIGHT}':text='${escapedSub}':fontcolor=${BRAND.accent}:fontsize=40:x=(w-tw)/2:y=${subY}:alpha='if(lt(t,0.5),t/0.5,1)'`
      );
    }
  } else if (clip.label && FORMAT === "horizontal") {
    // Bottom third overlay
    const escaped = escapeDrawtext(clip.label);
    vf.push(
      `drawtext=fontfile='${FONT}':text='${escaped}':fontcolor=${BRAND.title}:fontsize=44:x=(w-tw)/2:y=h-180:alpha='if(lt(t,0.3),t/0.3,1)':box=1:boxcolor=${BRAND.bg.replace('#', '0x')}@0.7:boxborderw=20`
    );
  }
  
  const ok = ffmpegSync([
    "-ss", clip.from.toString(),
    "-to", clip.to.toString(),
    "-i", SRC,
    "-vf", vf.join(","),
    "-c:v", "libx264", "-preset", "fast", "-crf", "18",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
    "-pix_fmt", "yuv420p",
    "-avoid_negative_ts", "make_zero",
    "-y", clipFile,
  ], `Clip ${i + 1}`);
  
  if (ok) {
    clipFiles.push(clipFile);
    console.log(`  ✓ Clip ${i + 1}/${CLIPS.length}: ${clip.from}s → ${clip.to}s ${clip.label ? `"${clip.label}"` : ""}`);
  }
}

// ======================== STEP 2: Create title cards ========================

function createCard(cardConfig, outputFile, durationSec) {
  const text = escapeDrawtext(cardConfig.text);
  const subtext = cardConfig.subtext ? escapeDrawtext(cardConfig.subtext) : null;
  
  let vf = [`color=c=${BRAND.bg.replace('#', '0x')}:s=${W}x${H}:r=30:d=${durationSec}`];
  
  // Logo watermark (if exists)
  const logoPath = path.join(__dirname, "public", "logo-vakdor.png");
  
  // Main text with fade in
  const mainY = FORMAT === "vertical" ? "h/2-60" : "h/2-40";
  vf.push(
    `drawtext=fontfile='${FONT}':text='${text}':fontcolor=${BRAND.title}:fontsize=${FORMAT === "vertical" ? 58 : 52}:x=(w-tw)/2:y=${mainY}:alpha='if(lt(t,0.4),t/0.4,if(gt(t,${durationSec - 0.3}),(${durationSec}-t)/0.3,1))'`
  );
  
  // Accent line
  const lineY = FORMAT === "vertical" ? "h/2+20" : "h/2+10";
  vf.push(
    `drawtext=fontfile='${FONT}':text='━━━━━━━━━━━━':fontcolor=${BRAND.accent}:fontsize=24:x=(w-tw)/2:y=${lineY}:alpha='if(lt(t,0.5),t/0.5,if(gt(t,${durationSec - 0.3}),(${durationSec}-t)/0.3,1))'`
  );
  
  // Subtext
  if (subtext) {
    const subY = FORMAT === "vertical" ? "h/2+80" : "h/2+60";
    vf.push(
      `drawtext=fontfile='${FONT_LIGHT}':text='${subtext}':fontcolor=${BRAND.accent}:fontsize=${FORMAT === "vertical" ? 44 : 38}:x=(w-tw)/2:y=${subY}:alpha='if(lt(t,0.6),t/0.6,if(gt(t,${durationSec - 0.3}),(${durationSec}-t)/0.3,1))'`
    );
  }
  
  // Generate silent video
  ffmpegSync([
    "-f", "lavfi", "-i", vf.join("[tmp];[tmp]"),
    "-f", "lavfi", "-i", `anullsrc=r=48000:cl=stereo`,
    "-t", durationSec.toString(),
    "-c:v", "libx264", "-preset", "fast", "-crf", "18",
    "-c:a", "aac", "-b:a", "192k",
    "-pix_fmt", "yuv420p",
    "-shortest",
    "-y", outputFile,
  ], `Card: ${cardConfig.text}`);
  
  return outputFile;
}

// Title card
if (TITLE_CARD) {
  console.log(`\n🎨 Creando title card: "${TITLE_CARD.text}"`);
  const cardFile = path.join(tmpDir, "card_title.mp4");
  createCard(TITLE_CARD, cardFile, TITLE_CARD.durationSec || 2);
  clipFiles.unshift(cardFile);
}

// CTA card
if (CTA_CARD) {
  console.log(`🎨 Creando CTA card: "${CTA_CARD.text}"`);
  const cardFile = path.join(tmpDir, "card_cta.mp4");
  createCard(CTA_CARD, cardFile, CTA_CARD.durationSec || 2.5);
  clipFiles.push(cardFile);
}

// ======================== STEP 3: Logo overlay on clips ========================
console.log(`\n🏷️ Aplicando watermark de logo...`);

const logoFile = path.join(__dirname, "public", "logo-vakdor.png");
const logoIconFile = path.join(__dirname, "public", "logo-icon.png");
const hasLogo = fs.existsSync(logoFile);
const hasLogoIcon = fs.existsSync(logoIconFile);

const watermarkedFiles = [];
for (let i = 0; i < clipFiles.length; i++) {
  const f = clipFiles[i];
  const isCard = f.includes("card_");
  
  // Skip watermark on cards
  if (isCard || !hasLogo) {
    watermarkedFiles.push(f);
    continue;
  }
  
  const wmFile = path.join(tmpDir, `wm_${String(i).padStart(3, "0")}.mp4`);
  
  const inputs = ["-i", f, "-i", logoFile];
  let filterComplex = `[1:v]scale=56:56[logo];[0:v][logo]overlay=40:${FORMAT === "vertical" ? 60 : 30}:format=auto`;
  
  if (hasLogoIcon) {
    inputs.push("-i", logoIconFile);
    filterComplex = `[1:v]scale=56:56[logo];[2:v]scale=56:56[icon];[0:v][logo]overlay=40:${FORMAT === "vertical" ? 60 : 30}:format=auto[tmp];[tmp][icon]overlay=W-96:${FORMAT === "vertical" ? 60 : 30}:format=auto`;
  }
  
  const ok = ffmpegSync([
    ...inputs,
    "-filter_complex", filterComplex,
    "-c:v", "libx264", "-preset", "fast", "-crf", "18",
    "-c:a", "copy",
    "-pix_fmt", "yuv420p",
    "-y", wmFile,
  ], `Watermark ${i + 1}`);
  
  watermarkedFiles.push(ok ? wmFile : f);
}

// ======================== STEP 4: Concatenate with crossfade ========================
console.log(`\n✨ Aplicando crossfade transitions (${TRANSITION_SEC}s)...`);

if (watermarkedFiles.length === 0) {
  console.error("No hay clips para concatenar!");
  process.exit(1);
}

if (watermarkedFiles.length === 1) {
  // Solo un clip, copiar directamente
  fs.copyFileSync(watermarkedFiles[0], outPath);
  console.log(`\n✓ Output: ${outPath}`);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  process.exit(0);
}

// Para crossfade con ffmpeg necesitamos encadenar xfade filters
// Para N clips: N-1 xfade aplicaciones
// Cada xfade necesita el offset correcto

// Primero obtenemos la duración de cada clip
function getClipDuration(file) {
  const r = spawnSync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file,
  ], { encoding: "utf8" });
  return parseFloat(r.stdout.trim()) || 3;
}

const durations = watermarkedFiles.map(getClipDuration);
console.log(`  Duraciones: ${durations.map(d => d.toFixed(1) + "s").join(" + ")}`);

// Build xfade chain
// For N clips, we do N-1 xfade operations sequentially
// Approach: concat with fade transitions using a simpler method

// Simpler approach: crossfade pairs iteratively
let currentFile = watermarkedFiles[0];
let currentDuration = durations[0];

for (let i = 1; i < watermarkedFiles.length; i++) {
  const nextFile = watermarkedFiles[i];
  const nextDuration = durations[i];
  const offset = Math.max(0, currentDuration - TRANSITION_SEC);
  
  const mergedFile = path.join(tmpDir, `merged_${String(i).padStart(3, "0")}.mp4`);
  
  const ok = ffmpegSync([
    "-i", currentFile,
    "-i", nextFile,
    "-filter_complex",
    `[0:v]settb=1/30,fps=30[v0];[1:v]settb=1/30,fps=30[v1];[v0][v1]xfade=transition=fade:duration=${TRANSITION_SEC}:offset=${offset.toFixed(3)}[v];` +
    `[0:a]asetpts=PTS-STARTPTS[a0];[1:a]asetpts=PTS-STARTPTS[a1];[a0][a1]acrossfade=d=${TRANSITION_SEC}[a]`,
    "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-preset", "fast", "-crf", "18",
    "-c:a", "aac", "-b:a", "192k",
    "-pix_fmt", "yuv420p",
    "-y", mergedFile,
  ], `Merge ${i}/${watermarkedFiles.length - 1}`);
  
  if (ok) {
    currentFile = mergedFile;
    currentDuration = offset + nextDuration; // approximate
  } else {
    // Fallback: simple concat without transition
    console.log(`  ⚠ Fallback: concat sin transición para clip ${i + 1}`);
    const listFile = path.join(tmpDir, `concat_${i}.txt`);
    fs.writeFileSync(listFile, 
      `file '${currentFile.replace(/\\/g, "/")}'\nfile '${nextFile.replace(/\\/g, "/")}'`, "utf8");
    ffmpegSync([
      "-f", "concat", "-safe", "0", "-i", listFile,
      "-c:v", "libx264", "-preset", "fast", "-crf", "18",
      "-c:a", "aac", "-b:a", "192k",
      "-pix_fmt", "yuv420p",
      "-y", mergedFile,
    ], `Concat fallback ${i}`);
    currentFile = mergedFile;
    currentDuration = currentDuration + nextDuration;
  }
}

// ======================== STEP 5: Final output with faststart ========================
console.log(`\n📦 Generando output final con faststart...`);

fs.mkdirSync(path.dirname(outPath), { recursive: true });

// Final pass: add faststart for web compatibility + ensure correct pixel format
const finalOk = ffmpegSync([
  "-i", currentFile,
  "-c:v", "libx264", "-preset", "medium", "-crf", "18",
  "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
  "-pix_fmt", "yuv420p",
  "-movflags", "+faststart",
  "-y", outPath,
], "Final encode");

// Cleanup
console.log("🧹 Limpiando temporales...");
fs.rmSync(tmpDir, { recursive: true, force: true });

if (finalOk) {
  const finalSize = fs.statSync(outPath).size;
  const finalDur = getClipDuration(outPath);
  console.log(`\n✅ ¡Listo! ${outPath}`);
  console.log(`   Duración: ${finalDur.toFixed(1)}s | Tamaño: ${(finalSize / 1024 / 1024).toFixed(1)} MB`);
  console.log(`   Resolución: ${W}x${H} | Formato: ${FORMAT}`);
} else {
  console.error("\n✗ Error en el encode final.");
  process.exit(1);
}
