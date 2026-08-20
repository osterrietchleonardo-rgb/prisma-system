// burn.mjs — Quema subtitulos (SRT) con estilo de marca Vakdor sobre el video 16:9, y re-encode final.
//   node burn.mjs --in="stage1.mp4" --srt="subs.srt" --out="final.mp4"
// Genera un ASS con PlayRes 1920x1080 (tamano predecible) y estilo limpio/premium:
// texto blanco bold, borde oscuro, abajo-centro, margen que no pisa la burbuja de camara (abajo-der).
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  })
);
const IN = args.in, SRT = args.srt, OUT = args.out;

// --- Parse SRT ---
const raw = fs.readFileSync(SRT, "utf8").replace(/\r/g, "");
const blocks = raw.split(/\n\n+/).filter((b) => b.trim());
const toAssTime = (t) => {
  // 00:00:01,234 -> 0:00:01.23
  const m = t.match(/(\d+):(\d+):(\d+),(\d+)/);
  const h = +m[1], mi = +m[2], s = +m[3], cs = Math.round(+m[4] / 10);
  return `${h}:${String(mi).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
};
const events = [];
for (const b of blocks) {
  const lines = b.split("\n");
  const timeLine = lines.find((l) => l.includes("-->"));
  if (!timeLine) continue;
  const [start, end] = timeLine.split("-->").map((x) => toAssTime(x.trim()));
  const text = lines.slice(lines.indexOf(timeLine) + 1).join("\\N").trim();
  if (text) events.push({ start, end, text });
}

// --- Estilo ASS de marca ---
// Colores ASS = &HAABBGGRR. Blanco texto, borde casi-negro (base marca #0A0F1A), sombra suave.
// Cobre #C07C41 -> &H00417CC0 (por si se quiere resaltar).
const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Vakdor,Inter SemiBold,48,&H00FFFFFF,&H000000FF,&H00120C07,&H96000000,0,0,0,0,100,100,0.3,0,1,3.0,1.4,2,340,380,54,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.map((e) => `Dialogue: 0,${e.start},${e.end},Vakdor,,0,0,0,,${e.text}`).join("\n")}
`;

const assPath = path.join(path.dirname(OUT), "subs.ass");
fs.writeFileSync(assPath, ass, "utf8");
console.log(`ASS escrito: ${assPath} (${events.length} eventos)`);

// ffmpeg subtitles necesita el path escapado (Windows: barra invertida y ':' problemáticos).
const assFF = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");
// fontsdir con la fuente de marca Inter (no instalada en el sistema).
const fontsDir = path.join(__dirname, "fonts").replace(/\\/g, "/").replace(/:/g, "\\:");

const cmd = [
  "-i", IN,
  "-vf", `subtitles='${assFF}':fontsdir='${fontsDir}'`,
  "-c:v", "libx264", "-preset", "slow", "-crf", "17",
  "-pix_fmt", "yuv420p", "-r", "30",
  "-c:a", "copy",
  "-movflags", "+faststart",
  "-y", OUT,
];
console.log("Quemando subtitulos + encode final...");
const p = spawn("ffmpeg", cmd, { stdio: "inherit" });
p.on("exit", (code) => process.exit(code ?? 0));
