// thumbnail.mjs — Genera una imagen de thumbnail/portada para un reel.
// Uso:
//   node thumbnail.mjs --props=props.json --out=thumb.jpg
//
// El props.json debe tener: photo, title, price, tag (opcional), format (opcional).
// Si no se pasa props, usa los defaults de la composicion.
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

const outPath = args.out;
if (!outPath) {
  console.error("Falta --out. Uso: node thumbnail.mjs --out=thumb.jpg [--props=props.json]");
  process.exit(1);
}

let props = {};
if (args.props) {
  props = JSON.parse(fs.readFileSync(args.props, "utf8"));

  // Si la foto es un archivo local, copiar a public/current/
  if (props.photo && !/^https?:\/\//.test(props.photo) && !props.photo.startsWith("data:")) {
    const abs = path.isAbsolute(props.photo)
      ? props.photo
      : path.resolve(path.dirname(args.props), props.photo);
    if (fs.existsSync(abs)) {
      const publicCurrent = path.join(__dirname, "public", "current");
      fs.mkdirSync(publicCurrent, { recursive: true });
      const ext = path.extname(abs) || ".jpg";
      fs.copyFileSync(abs, path.join(publicCurrent, `thumb${ext}`));
      props.photo = `current/thumb${ext}`;
    }
  }
}

const resolvedPath = path.join(__dirname, ".thumb.props.json");
fs.writeFileSync(resolvedPath, JSON.stringify(props, null, 2));

fs.mkdirSync(path.dirname(outPath), { recursive: true });

const cliPath = path.join(
  __dirname,
  "node_modules",
  "@remotion",
  "cli",
  "remotion-cli.js"
);

// Renderizar 1 frame (still) en vez de video
const result = spawnSync(
  process.execPath,
  [
    cliPath,
    "still",
    "Thumbnail",
    outPath,
    `--props=${resolvedPath}`,
    "--image-format=jpeg",
    "--jpeg-quality=92",
  ],
  { cwd: __dirname, stdio: "inherit" }
);

fs.rmSync(resolvedPath, { force: true });
process.exit(result.status ?? 1);
