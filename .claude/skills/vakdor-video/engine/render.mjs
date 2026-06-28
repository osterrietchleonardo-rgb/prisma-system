// render.mjs — wrapper de render del motor Vakdor-Video.
// Uso:
//   node render.mjs --props=<ruta props.json> --out=<ruta salida.mp4>
//
// Que hace:
//  1) Lee el props.json (datos de la propiedad).
//  2) Las fotos que sean ARCHIVOS LOCALES las copia a public/current/ y reescribe
//     las rutas a "current/N.ext" (Remotion sirve fotos desde public/).
//     Las fotos que ya sean URL http las deja igual.
//  3) Renderiza la composicion PropertyReel a la ruta de salida pedida.
//
// Regla de oro: la salida (.mp4) SIEMPRE va a una carpeta de "Prisma - MK".
// Este script NUNCA escribe dentro de PRISMA-SYSTEM.

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

const propsPath = args.props;
const outPath = args.out;
if (!propsPath || !outPath) {
  console.error("Faltan argumentos. Uso: node render.mjs --props=props.json --out=salida.mp4");
  process.exit(1);
}

const props = JSON.parse(fs.readFileSync(propsPath, "utf8"));

// Preparar carpeta de fotos servidas
const publicCurrent = path.join(__dirname, "public", "current");
fs.rmSync(publicCurrent, { recursive: true, force: true });
fs.mkdirSync(publicCurrent, { recursive: true });

const isHttp = (p) => /^https?:\/\//.test(p) || p.startsWith("data:");

props.photos = (props.photos || []).map((photo, i) => {
  if (isHttp(photo)) return photo;
  const abs = path.isAbsolute(photo) ? photo : path.resolve(path.dirname(propsPath), photo);
  if (!fs.existsSync(abs)) {
    console.error(`AVISO: no existe la foto local: ${abs}`);
    return photo;
  }
  const ext = path.extname(abs) || ".jpg";
  const dest = `${i + 1}${ext}`;
  fs.copyFileSync(abs, path.join(publicCurrent, dest));
  return `current/${dest}`;
});

// props resueltos en archivo temporal dentro del engine
const resolvedPath = path.join(__dirname, ".props.resolved.json");
fs.writeFileSync(resolvedPath, JSON.stringify(props, null, 2));

// Asegurar carpeta de salida
fs.mkdirSync(path.dirname(outPath), { recursive: true });

// Llamamos al CLI de Remotion por su JS directo con `node` (sin shell), asi los
// paths con espacios (ej. "Prisma - MK") no rompen el render.
const cliPath = path.join(
  __dirname,
  "node_modules",
  "@remotion",
  "cli",
  "remotion-cli.js"
);
const result = spawnSync(
  process.execPath,
  [cliPath, "render", "PropertyReel", outPath, `--props=${resolvedPath}`],
  { cwd: __dirname, stdio: "inherit" }
);

fs.rmSync(resolvedPath, { force: true });
process.exit(result.status ?? 1);
