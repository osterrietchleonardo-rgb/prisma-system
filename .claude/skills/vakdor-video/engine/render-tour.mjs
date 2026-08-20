// render-tour.mjs — wrapper de render del TOUR premium de propiedad (PropertyTour).
// Uso:
//   node render-tour.mjs --props=<ruta props.json> --out=<ruta salida.mp4>
//
// Igual que render.mjs pero para la composición PropertyTour, cuyas fotos viven en
// props.scenes = [{ src, highlight? }]. Las fotos que sean ARCHIVOS LOCALES se copian
// a public/current/ y se reescriben a "current/N.ext"; las URL http se dejan igual.
// El logo del branding (props.brand.logoUrl) se resuelve igual si es archivo local.
//
// Regla de oro: la salida (.mp4) SIEMPRE va a una carpeta de "Prisma - MK".

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
  console.error("Faltan argumentos. Uso: node render-tour.mjs --props=props.json --out=salida.mp4");
  process.exit(1);
}

const props = JSON.parse(fs.readFileSync(propsPath, "utf8"));

const publicCurrent = path.join(__dirname, "public", "current");
fs.rmSync(publicCurrent, { recursive: true, force: true });
fs.mkdirSync(publicCurrent, { recursive: true });

const isHttp = (p) => /^https?:\/\//.test(p) || p.startsWith("data:");

// Copia una foto/logo local a public/current/ y devuelve la ruta servible.
let counter = 0;
const resolveLocal = (p) => {
  if (!p || isHttp(p)) return p;
  // Si ya es un archivo que Remotion sirve desde public/ (ej. "logo-vakdor.png"), dejarlo.
  if (fs.existsSync(path.join(__dirname, "public", p))) return p;
  const abs = path.isAbsolute(p) ? p : path.resolve(path.dirname(propsPath), p);
  if (!fs.existsSync(abs)) {
    console.error(`AVISO: no existe el archivo local: ${abs}`);
    return p;
  }
  const ext = path.extname(abs) || ".jpg";
  const dest = `${++counter}${ext}`;
  fs.copyFileSync(abs, path.join(publicCurrent, dest));
  return `current/${dest}`;
};

props.scenes = (props.scenes || []).map((s) => ({
  ...s,
  src: resolveLocal(s.src),
}));
if (props.brand) props.brand.logoUrl = resolveLocal(props.brand.logoUrl);

const resolvedPath = path.join(__dirname, ".props.tour.resolved.json");
fs.writeFileSync(resolvedPath, JSON.stringify(props, null, 2));

fs.mkdirSync(path.dirname(outPath), { recursive: true });

const cliPath = path.join(
  __dirname,
  "node_modules",
  "@remotion",
  "cli",
  "remotion-cli.js"
);
const result = spawnSync(
  process.execPath,
  [cliPath, "render", "PropertyTour", outPath, `--props=${resolvedPath}`],
  { cwd: __dirname, stdio: "inherit" }
);

fs.rmSync(resolvedPath, { force: true });
process.exit(result.status ?? 1);
