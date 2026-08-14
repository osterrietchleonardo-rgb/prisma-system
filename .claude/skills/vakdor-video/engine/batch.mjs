// batch.mjs — Renderiza multiples videos en serie.
// Uso:
//   node batch.mjs --manifest=manifest.json
//
// El manifest.json es un array de objetos, cada uno con:
//   { "composition": "PropertyReel"|"EditedReel"|"Thumbnail", "props": "ruta/props.json", "out": "ruta/salida.mp4" }
//
// Ejemplo de manifest.json:
// [
//   { "composition": "PropertyReel", "props": "activo1/props.json", "out": "activo1/reel.mp4" },
//   { "composition": "PropertyReel", "props": "activo2/props.json", "out": "activo2/reel.mp4" },
//   { "composition": "Thumbnail", "props": "activo1/thumb-props.json", "out": "activo1/thumb.jpg" }
// ]
//
// Regla de oro: todas las rutas de salida deben ir a "Prisma - MK".

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

const manifestPath = args.manifest;
if (!manifestPath) {
  console.error("Falta --manifest. Uso: node batch.mjs --manifest=manifest.json");
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (!Array.isArray(manifest) || manifest.length === 0) {
  console.error("El manifest debe ser un array no vacio.");
  process.exit(1);
}

const cliPath = path.join(
  __dirname,
  "node_modules",
  "@remotion",
  "cli",
  "remotion-cli.js"
);

let passed = 0;
let failed = 0;

for (let i = 0; i < manifest.length; i++) {
  const item = manifest[i];
  const { composition, props: propsFile, out: outFile } = item;

  console.log(`\n━━━ [${i + 1}/${manifest.length}] ${composition} → ${outFile} ━━━`);

  if (!composition || !outFile) {
    console.error("  ✗ Falta 'composition' o 'out' en el item.");
    failed++;
    continue;
  }

  // Leer y resolver props (si existe)
  let resolvedPropsPath = null;
  if (propsFile && fs.existsSync(propsFile)) {
    const props = JSON.parse(fs.readFileSync(propsFile, "utf8"));

    // Si tiene fotos locales (PropertyReel), copiar a public/current/
    if (props.photos && Array.isArray(props.photos)) {
      const publicCurrent = path.join(__dirname, "public", "current");
      fs.rmSync(publicCurrent, { recursive: true, force: true });
      fs.mkdirSync(publicCurrent, { recursive: true });
      props.photos = props.photos.map((photo, j) => {
        if (/^https?:\/\//.test(photo) || photo.startsWith("data:")) return photo;
        const abs = path.isAbsolute(photo) ? photo : path.resolve(path.dirname(propsFile), photo);
        if (!fs.existsSync(abs)) return photo;
        const ext = path.extname(abs) || ".jpg";
        const dest = `${j + 1}${ext}`;
        fs.copyFileSync(abs, path.join(publicCurrent, dest));
        return `current/${dest}`;
      });
    }

    resolvedPropsPath = path.join(__dirname, `.batch.props.${i}.json`);
    fs.writeFileSync(resolvedPropsPath, JSON.stringify(props, null, 2));
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });

  // Thumbnail usa "still", el resto usa "render"
  const isStill = composition === "Thumbnail";
  const cliArgs = isStill
    ? [cliPath, "still", composition, outFile, "--image-format=jpeg", "--jpeg-quality=92"]
    : [cliPath, "render", composition, outFile];

  if (resolvedPropsPath) {
    cliArgs.push(`--props=${resolvedPropsPath}`);
  }

  const result = spawnSync(process.execPath, cliArgs, {
    cwd: __dirname,
    stdio: "inherit",
  });

  if (resolvedPropsPath) fs.rmSync(resolvedPropsPath, { force: true });

  if (result.status === 0) {
    console.log(`  ✓ Listo: ${outFile}`);
    passed++;
  } else {
    console.error(`  ✗ Error (exit ${result.status})`);
    failed++;
  }
}

console.log(`\n━━━ Batch completo: ${passed} OK, ${failed} errores de ${manifest.length} total ━━━\n`);
process.exit(failed > 0 ? 1 : 0);
