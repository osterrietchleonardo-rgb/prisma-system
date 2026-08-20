// burn-amf.mjs — Quema subtítulos (SRT/ASS) usando aceleración por hardware AMD GPU (h264_amf).
//   node burn-amf.mjs --in="stage1.mp4" --srt="subs.srt" --out="final.mp4"
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

if (!IN || !SRT || !OUT) {
  console.error("Uso: node burn-amf.mjs --in=stage1.mp4 --srt=subs.srt --out=final.mp4");
  process.exit(1);
}

// Parse SRT to ASS
const raw = fs.readFileSync(SRT, "utf8").replace(/\r/g, "");
const blocks = raw.split(/\n\n+/).filter((b) => b.trim());
const toAssTime = (t) => {
  const m = t.match(/(\d+):(\d+):(\d+),(\d+)/);
  if (!m) return "0:00:00.00";
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

const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Vakdor,Inter SemiBold,46,&H00FFFFFF,&H000000FF,&H00120C07,&H96000000,0,0,0,0,100,100,0.3,0,1,3.0,1.4,2,340,380,54,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.map((e) => `Dialogue: 0,${e.start},${e.end},Vakdor,,0,0,0,,${e.text}`).join("\n")}
`;

const assPath = path.join(path.dirname(OUT), "subs.ass");
fs.writeFileSync(assPath, ass, "utf8");

const assFF = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");
const fontsDir = path.join(__dirname, "fonts").replace(/\\/g, "/").replace(/:/g, "\\:");

// Usamos h264_amf para aceleración AMD GPU si está disponible, con fallback a libx264
console.log("Probando render con aceleración AMD GPU (h264_amf)...");

const amfArgs = [
  "-i", IN,
  "-vf", `subtitles='${assFF}':fontsdir='${fontsDir}'`,
  "-c:v", "h264_amf", "-quality", "quality", "-rc", "cqp", "-qp_i", "18", "-qp_p", "18",
  "-pix_fmt", "yuv420p", "-r", "30",
  "-c:a", "copy",
  "-movflags", "+faststart",
  "-y", OUT,
];

let p = spawn("ffmpeg", amfArgs, { stdio: "inherit" });
p.on("exit", (code) => {
  if (code === 0) {
    console.log(`\n✓ Render completado con GPU AMD Radeon: ${OUT}`);
    process.exit(0);
  } else {
    console.log("Fallback a libx264 CPU...");
    const cpuArgs = [
      "-i", IN,
      "-vf", `subtitles='${assFF}':fontsdir='${fontsDir}'`,
      "-c:v", "libx264", "-preset", "fast", "-crf", "17",
      "-pix_fmt", "yuv420p", "-r", "30",
      "-c:a", "copy",
      "-movflags", "+faststart",
      "-y", OUT,
    ];
    const pCpu = spawn("ffmpeg", cpuArgs, { stdio: "inherit" });
    pCpu.on("exit", (c) => process.exit(c ?? 0));
  }
});
