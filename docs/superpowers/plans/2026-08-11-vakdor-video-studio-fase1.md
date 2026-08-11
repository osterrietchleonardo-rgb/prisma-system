# Vakdor Video Studio — Fase 1 (esqueleto híbrido) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un video crudo entre por un solo comando y salga cortado, con movimiento de cámara, color cinematográfico y en cualquier formato — sin efectos de Remotion todavía.

**Architecture:** Cada módulo de `engine/lib/` es una función pura que **devuelve texto de filtro de ffmpeg**, no ejecuta nada. `compose.mjs` junta todos esos textos en un único `filter_complex` y hace **un solo encode**. Eso hace que cada pieza se pueda probar sin renderizar y que no haya pérdida de calidad por encodes encadenados.

**Tech Stack:** Node 24 (ESM, `.mjs`), runner de pruebas nativo `node --test`, ffmpeg 8.1.1, encoder `h264_amf` con fallback a NVENC/QSV/libx264.

## Global Constraints

- Node v24.12.0, ESM puro (`import`, no `require`). Extensión `.mjs`.
- Runner de pruebas: `node --test` nativo. **No** agregar jest/vitest/mocha.
- Cero dependencias npm nuevas en Fase 1.
- Todo texto visible al usuario va en **castellano rioplatense**.
- Los módulos de `lib/` **no ejecutan ffmpeg**, salvo `probe.mjs`, `encoder.mjs` y `compose.mjs`.
- Formatos válidos: `16:9` (1920×1080), `9:16` (1080×1920), `1:1` (1080×1080), `4:5` (1080×1350).
- Presets de color: `cinematic`, `warm`, `cool`, `vintage`, `bw`, `highContrast`, `moody`, `golden`, `teal-orange`.
- Sobre-muestreo de zoom: default `3`, baja a `2` si el total de tramos con zoom supera 360 s (medición en §12 del spec).
- Nunca `git add -A`. Se agregan los archivos del task por nombre.
- El trabajo va en el worktree `C:\Users\LENOVO\Desktop\CODE\prisma-wt-video-studio`, rama `feat/vakdor-video-studio`.

**Ruta base de todo el código:** `.claude/skills/vakdor-video/engine/`

---

### Task 1: Andamiaje de pruebas + `probe.mjs`

Lee los datos técnicos de un video. Todo lo demás depende de saber duración, fps y dimensiones.

**Files:**
- Create: `.claude/skills/vakdor-video/engine/lib/probe.mjs`
- Create: `.claude/skills/vakdor-video/engine/tests/helpers.mjs`
- Test: `.claude/skills/vakdor-video/engine/tests/probe.test.mjs`
- Modify: `.claude/skills/vakdor-video/engine/package.json` (agregar script `test`)

**Interfaces:**
- Produces: `probe(rutaVideo) -> { durationSec: number, fps: number, width: number, height: number, hasAudio: boolean }` (async). Lanza `Error` con mensaje en castellano si el archivo no existe o ffprobe falla.
- Produces: `crearClipDePrueba({ segundos, ancho, alto, conAudio, salida })` en `tests/helpers.mjs` — genera un mp4 sintético con ffmpeg para que las pruebas no dependan de archivos externos.

- [ ] **Step 1: Escribir el helper de pruebas**

`tests/helpers.mjs`:

```js
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const dirTemporal = () =>
  fs.mkdtempSync(path.join(os.tmpdir(), "vakdor-studio-"));

export function crearClipDePrueba({
  segundos = 3,
  ancho = 1920,
  alto = 1080,
  conAudio = true,
  salida,
}) {
  const args = ["-y", "-v", "error",
    "-f", "lavfi", "-i", `testsrc2=size=${ancho}x${alto}:rate=30:duration=${segundos}`];
  if (conAudio) args.push("-f", "lavfi", "-i", `sine=frequency=440:duration=${segundos}`);
  args.push("-c:v", "libx264", "-crf", "24", "-pix_fmt", "yuv420p");
  if (conAudio) args.push("-c:a", "aac", "-shortest");
  args.push(salida);

  const r = spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`No pude crear el clip de prueba: ${r.stderr}`);
  return salida;
}
```

- [ ] **Step 2: Escribir la prueba que falla**

`tests/probe.test.mjs`:

```js
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { probe } from "../lib/probe.mjs";
import { crearClipDePrueba, dirTemporal } from "./helpers.mjs";

let dir, clip;
before(() => {
  dir = dirTemporal();
  clip = crearClipDePrueba({ segundos: 3, salida: path.join(dir, "clip.mp4") });
});
after(() => fs.rmSync(dir, { recursive: true, force: true }));

test("probe devuelve duracion, fps, dimensiones y audio", async () => {
  const info = await probe(clip);
  assert.ok(Math.abs(info.durationSec - 3) < 0.2, `duracion rara: ${info.durationSec}`);
  assert.equal(info.fps, 30);
  assert.equal(info.width, 1920);
  assert.equal(info.height, 1080);
  assert.equal(info.hasAudio, true);
});

test("probe detecta cuando no hay audio", async () => {
  const mudo = crearClipDePrueba({ segundos: 1, conAudio: false, salida: path.join(dir, "mudo.mp4") });
  const info = await probe(mudo);
  assert.equal(info.hasAudio, false);
});

test("probe da un error claro si el archivo no existe", async () => {
  await assert.rejects(() => probe(path.join(dir, "no-existe.mp4")), /no existe/i);
});
```

- [ ] **Step 3: Correr la prueba y verificar que falla**

```bash
cd ".claude/skills/vakdor-video/engine" && node --test tests/probe.test.mjs
```

Esperado: FALLA con `Cannot find module '../lib/probe.mjs'`.

- [ ] **Step 4: Implementar `lib/probe.mjs`**

```js
import { spawn } from "node:child_process";
import fs from "node:fs";

const correr = (cmd, args) =>
  new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", () => reject(new Error(`No encontre "${cmd}" en el PATH. Instalalo o agregalo al PATH.`)));
    p.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${cmd} fallo (codigo ${code}): ${err.trim()}`)));
  });

/** Lee los datos tecnicos de un video. */
export async function probe(ruta) {
  if (!fs.existsSync(ruta)) throw new Error(`El archivo no existe: ${ruta}`);

  const salida = await correr("ffprobe", [
    "-v", "error", "-show_streams", "-show_format", "-of", "json", ruta,
  ]);
  const datos = JSON.parse(salida);
  const video = datos.streams.find((s) => s.codec_type === "video");
  if (!video) throw new Error(`El archivo no tiene pista de video: ${ruta}`);

  const [num, den] = String(video.avg_frame_rate || "30/1").split("/").map(Number);
  const fps = den ? Math.round((num / den) * 1000) / 1000 : 30;

  return {
    durationSec: Number(datos.format?.duration ?? video.duration ?? 0),
    fps: Number.isInteger(fps) ? fps : Math.round(fps * 1000) / 1000,
    width: Number(video.width),
    height: Number(video.height),
    hasAudio: datos.streams.some((s) => s.codec_type === "audio"),
  };
}
```

- [ ] **Step 5: Agregar el script de test al `package.json`**

En `"scripts"`, agregar: `"test": "node --test tests/"`

- [ ] **Step 6: Correr las pruebas y verificar que pasan**

```bash
cd ".claude/skills/vakdor-video/engine" && npm test
```

Esperado: `pass 3`, `fail 0`.

- [ ] **Step 7: Commit**

```bash
git add .claude/skills/vakdor-video/engine/lib/probe.mjs \
        .claude/skills/vakdor-video/engine/tests/helpers.mjs \
        .claude/skills/vakdor-video/engine/tests/probe.test.mjs \
        .claude/skills/vakdor-video/engine/package.json
git commit -m "feat(studio): probe.mjs lee duracion, fps, dimensiones y audio"
```

---

### Task 2: `encoder.mjs` — elegir el encoder probándolo, no asumiéndolo

**Files:**
- Create: `.claude/skills/vakdor-video/engine/lib/encoder.mjs`
- Test: `.claude/skills/vakdor-video/engine/tests/encoder.test.mjs`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `ENCODERS` — array ordenado por preferencia: `[{ nombre, esGpu, args(calidad) }]`.
  - `probarEncoder(nombre) -> Promise<boolean>` — intenta encodear 1 frame de verdad.
  - `elegirEncoder({ forzar }) -> Promise<{ nombre, esGpu, args }>` — primero que funcione. Si `forzar` está y falla, lanza error en vez de degradar en silencio.

- [ ] **Step 1: Escribir la prueba que falla**

`tests/encoder.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { ENCODERS, probarEncoder, elegirEncoder } from "../lib/encoder.mjs";

test("el orden de preferencia arranca por GPU y termina en CPU", () => {
  assert.equal(ENCODERS[0].nombre, "h264_amf");
  assert.equal(ENCODERS.at(-1).nombre, "libx264");
  assert.equal(ENCODERS.at(-1).esGpu, false);
});

test("libx264 siempre esta disponible", async () => {
  assert.equal(await probarEncoder("libx264"), true);
});

test("un encoder inventado da false, no explota", async () => {
  assert.equal(await probarEncoder("h264_inventado"), false);
});

test("elegirEncoder devuelve uno que funciona", async () => {
  const e = await elegirEncoder({});
  assert.ok(ENCODERS.some((x) => x.nombre === e.nombre));
  assert.ok(Array.isArray(e.args));
});

test("forzar un encoder inexistente da error claro, no cae a CPU en silencio", async () => {
  await assert.rejects(() => elegirEncoder({ forzar: "h264_inventado" }), /no funciona|no esta disponible/i);
});
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
cd ".claude/skills/vakdor-video/engine" && node --test tests/encoder.test.mjs
```

Esperado: FALLA con `Cannot find module '../lib/encoder.mjs'`.

- [ ] **Step 3: Implementar `lib/encoder.mjs`**

```js
import { spawn } from "node:child_process";

/** Encoders en orden de preferencia. `calidad` es "max" | "rapido". */
export const ENCODERS = [
  { nombre: "h264_amf",   esGpu: true,
    args: (c) => c === "max"
      ? ["-quality", "quality", "-rc", "cqp", "-qp_i", "16", "-qp_p", "16"]
      : ["-quality", "balanced", "-rc", "cqp", "-qp_i", "20", "-qp_p", "20"] },
  { nombre: "h264_nvenc", esGpu: true,
    args: (c) => ["-preset", c === "max" ? "p7" : "p4", "-rc", "constqp",
                  "-qp", c === "max" ? "16" : "20"] },
  { nombre: "h264_qsv",   esGpu: true,
    args: (c) => ["-global_quality", c === "max" ? "16" : "22"] },
  { nombre: "libx264",    esGpu: false,
    args: (c) => ["-preset", c === "max" ? "slow" : "veryfast",
                  "-crf", c === "max" ? "16" : "20"] },
];

/** Encodea 1 frame de verdad. Es la unica forma honesta de saber si anda. */
export function probarEncoder(nombre) {
  return new Promise((resolve) => {
    const p = spawn("ffmpeg", [
      "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=1:duration=1",
      "-frames:v", "1", "-c:v", nombre, "-f", "null", "-",
    ]);
    p.on("error", () => resolve(false));
    p.on("close", (code) => resolve(code === 0));
  });
}

export async function elegirEncoder({ forzar, calidad = "rapido" } = {}) {
  if (forzar) {
    const e = ENCODERS.find((x) => x.nombre === forzar);
    // "no esta disponible" (nombre desconocido) vs "no funciona" (conocido pero falla al correr).
    // Los dos textos tienen que matchear el regex de la prueba: /no funciona|no esta disponible/i
    if (!e) throw new Error(`El encoder "${forzar}" no esta disponible.`);
    if (!(await probarEncoder(forzar)))
      throw new Error(`El encoder "${forzar}" no funciona en esta maquina.`);
    return { nombre: e.nombre, esGpu: e.esGpu, args: e.args(calidad) };
  }
  for (const e of ENCODERS) {
    if (await probarEncoder(e.nombre))
      return { nombre: e.nombre, esGpu: e.esGpu, args: e.args(calidad) };
  }
  throw new Error("Ningun encoder de video funciona en esta maquina. Revisa la instalacion de ffmpeg.");
}
```

- [ ] **Step 4: Correr y verificar que pasan**

```bash
cd ".claude/skills/vakdor-video/engine" && node --test tests/encoder.test.mjs
```

Esperado: `pass 5`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/vakdor-video/engine/lib/encoder.mjs \
        .claude/skills/vakdor-video/engine/tests/encoder.test.mjs
git commit -m "feat(studio): encoder.mjs prueba AMF/NVENC/QSV/CPU en vez de asumir"
```

---

### Task 3: `grade.mjs` — los 9 presets de color en ffmpeg

Traduce los presets de `src/ColorGrade.tsx` (que son filtros CSS) a filtros de ffmpeg, para que el video se vea igual venga del motor que venga.

**Files:**
- Create: `.claude/skills/vakdor-video/engine/lib/grade.mjs`
- Test: `.claude/skills/vakdor-video/engine/tests/grade.test.mjs`
- Read (referencia): `.claude/skills/vakdor-video/engine/src/ColorGrade.tsx`

**Interfaces:**
- Produces:
  - `PRESETS_COLOR` — objeto `{ [nombre]: { eq?, curves?, colorbalance?, vignette? } }` con los 9 presets.
  - `filtroDeColor(preset, { vignette = null }) -> string` — cadena de filtros lista para el grafo. Devuelve `""` si `preset` es `null` o `"ninguno"`. Lanza error si el preset no existe.

- [ ] **Step 1: Escribir la prueba que falla**

`tests/grade.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { PRESETS_COLOR, filtroDeColor } from "../lib/grade.mjs";

const LOS_NUEVE = ["cinematic","warm","cool","vintage","bw","highContrast","moody","golden","teal-orange"];

test("estan los 9 presets", () => {
  assert.deepEqual(Object.keys(PRESETS_COLOR).sort(), [...LOS_NUEVE].sort());
});

test("sin preset devuelve cadena vacia", () => {
  assert.equal(filtroDeColor(null), "");
  assert.equal(filtroDeColor("ninguno"), "");
});

test("un preset inventado da error claro", () => {
  assert.throws(() => filtroDeColor("neon"), /no existe|desconocido/i);
});

test("vignette se puede forzar aunque el preset no lo traiga", () => {
  assert.ok(filtroDeColor("warm", { vignette: true }).includes("vignette"));
  assert.ok(!filtroDeColor("cinematic", { vignette: false }).includes("vignette"));
});

// La prueba que importa: que ffmpeg acepte de verdad cada filtro.
for (const p of LOS_NUEVE) {
  test(`ffmpeg acepta el preset ${p}`, () => {
    const r = spawnSync("ffmpeg", [
      "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=1:duration=1",
      "-frames:v", "1", "-vf", filtroDeColor(p), "-f", "null", "-",
    ], { encoding: "utf8" });
    assert.equal(r.status, 0, `ffmpeg rechazo "${p}": ${r.stderr}`);
  });
}
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
cd ".claude/skills/vakdor-video/engine" && node --test tests/grade.test.mjs
```

Esperado: FALLA con `Cannot find module '../lib/grade.mjs'`.

- [ ] **Step 3: Implementar `lib/grade.mjs`**

```js
/**
 * Los 9 presets de ColorGrade.tsx traducidos a ffmpeg.
 * eq: contrast/brightness/saturation/gamma. colorbalance: rs/gs/bs (sombras), rm/gm/bm (medios),
 * rh/gh/bh (altas). Valores entre -1 y 1.
 */
export const PRESETS_COLOR = {
  cinematic:      { eq: "contrast=1.15:brightness=-0.05:saturation=0.90:gamma=0.95", colorbalance: "rs=-0.05:bs=0.08", vignette: true },
  warm:           { eq: "contrast=1.05:saturation=1.10",            colorbalance: "rm=0.10:bm=-0.06" },
  cool:           { eq: "contrast=1.05:saturation=0.90",            colorbalance: "rm=-0.08:bm=0.12" },
  vintage:        { eq: "contrast=0.95:saturation=0.65:gamma=1.05", colorbalance: "rs=0.08:bs=-0.10", vignette: true },
  bw:             { eq: "contrast=1.10:saturation=0.00" },
  highContrast:   { eq: "contrast=1.35:saturation=1.15" },
  moody:          { eq: "contrast=1.20:brightness=-0.10:saturation=0.80", colorbalance: "bs=0.10", vignette: true },
  golden:         { eq: "contrast=1.08:saturation=1.15:gamma=1.02",  colorbalance: "rm=0.14:gm=0.05:bm=-0.10" },
  "teal-orange":  { eq: "contrast=1.18:saturation=1.05",             colorbalance: "rh=0.12:bs=0.14" },
};

const VINETA = "vignette=angle=PI/5";

/** Devuelve la cadena de filtros de color, lista para meter en el grafo. */
export function filtroDeColor(preset, { vignette = null } = {}) {
  if (!preset || preset === "ninguno") return "";
  const p = PRESETS_COLOR[preset];
  if (!p) {
    throw new Error(
      `El preset de color "${preset}" no existe. Los validos son: ${Object.keys(PRESETS_COLOR).join(", ")}.`
    );
  }
  const partes = [];
  if (p.eq) partes.push(`eq=${p.eq}`);
  if (p.colorbalance) partes.push(`colorbalance=${p.colorbalance}`);

  const quiereVineta = vignette === null ? Boolean(p.vignette) : vignette;
  if (quiereVineta) partes.push(VINETA);

  return partes.join(",");
}
```

- [ ] **Step 4: Correr y verificar que pasan**

```bash
cd ".claude/skills/vakdor-video/engine" && node --test tests/grade.test.mjs
```

Esperado: `pass 13`, `fail 0` (4 de lógica + 9 de aceptación de ffmpeg).

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/vakdor-video/engine/lib/grade.mjs \
        .claude/skills/vakdor-video/engine/tests/grade.test.mjs
git commit -m "feat(studio): grade.mjs traduce los 9 presets de color a ffmpeg"
```

---

### Task 4: `reframe.mjs` — los 4 formatos

**Files:**
- Create: `.claude/skills/vakdor-video/engine/lib/reframe.mjs`
- Test: `.claude/skills/vakdor-video/engine/tests/reframe.test.mjs`

**Interfaces:**
- Produces:
  - `FORMATOS` — `{ "16:9": {ancho:1920,alto:1080}, "9:16": {ancho:1080,alto:1920}, "1:1": {ancho:1080,alto:1080}, "4:5": {ancho:1080,alto:1350} }`.
  - `ZONAS_SEGURAS` — `{ [formato]: { subtitulosY: number, evitarCentro: boolean } }` donde `subtitulosY` es la fracción de altura (0 arriba, 1 abajo). Lo consume la Fase 2.
  - `filtroDeFormato({ anchoOrigen, altoOrigen, formato, modo }) -> string`. `modo` es `"recortar"` (default, llena el cuadro) o `"barras"` (entra completo con barras).

- [ ] **Step 1: Escribir la prueba que falla**

`tests/reframe.test.mjs`:

```js
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { FORMATOS, ZONAS_SEGURAS, filtroDeFormato } from "../lib/reframe.mjs";
import { crearClipDePrueba, dirTemporal } from "./helpers.mjs";

let dir, clip;
before(() => {
  dir = dirTemporal();
  clip = crearClipDePrueba({ segundos: 1, ancho: 1920, alto: 1080, salida: path.join(dir, "h.mp4") });
});
after(() => fs.rmSync(dir, { recursive: true, force: true }));

test("los 4 formatos con sus medidas", () => {
  assert.deepEqual(Object.keys(FORMATOS).sort(), ["1:1", "16:9", "4:5", "9:16"]);
  assert.deepEqual(FORMATOS["9:16"], { ancho: 1080, alto: 1920 });
});

test("en vertical los subtitulos suben para esquivar la UI de las redes", () => {
  assert.ok(ZONAS_SEGURAS["9:16"].subtitulosY <= 0.62);
  assert.ok(ZONAS_SEGURAS["9:16"].evitarCentro);
  assert.ok(ZONAS_SEGURAS["16:9"].subtitulosY > 0.62);
});

test("un formato invalido da error claro", () => {
  assert.throws(() => filtroDeFormato({ anchoOrigen: 1920, altoOrigen: 1080, formato: "21:9" }), /no existe|valido/i);
});

// Lo que importa: que el video salga con las medidas exactas.
for (const [formato, medidas] of Object.entries(FORMATOS)) {
  test(`convertir 16:9 a ${formato} da ${medidas.ancho}x${medidas.alto}`, () => {
    const salida = path.join(dir, `out-${formato.replace(":", "x")}.mp4`);
    const vf = filtroDeFormato({ anchoOrigen: 1920, altoOrigen: 1080, formato });
    const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-i", clip, "-vf", vf,
      "-frames:v", "1", "-c:v", "libx264", "-pix_fmt", "yuv420p", salida], { encoding: "utf8" });
    assert.equal(r.status, 0, `ffmpeg fallo: ${r.stderr}`);
    const dims = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0",
      "-show_entries", "stream=width,height", "-of", "csv=p=0", salida], { encoding: "utf8" }).stdout.trim();
    assert.equal(dims, `${medidas.ancho},${medidas.alto}`);
  });
}
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
cd ".claude/skills/vakdor-video/engine" && node --test tests/reframe.test.mjs
```

Esperado: FALLA con `Cannot find module '../lib/reframe.mjs'`.

- [ ] **Step 3: Implementar `lib/reframe.mjs`**

```js
export const FORMATOS = {
  "16:9": { ancho: 1920, alto: 1080 },
  "9:16": { ancho: 1080, alto: 1920 },
  "1:1":  { ancho: 1080, alto: 1080 },
  "4:5":  { ancho: 1080, alto: 1350 },
};

/**
 * subtitulosY: fraccion de la altura donde va la linea de subtitulos (0 arriba, 1 abajo).
 * En 9:16 sube a 0.62 porque la UI de Instagram/TikTok tapa el fondo del cuadro.
 * evitarCentro: los callouts no pueden invadir el tercio central (ahi esta la cara).
 */
export const ZONAS_SEGURAS = {
  "16:9": { subtitulosY: 0.88, evitarCentro: false },
  "9:16": { subtitulosY: 0.62, evitarCentro: true },
  "1:1":  { subtitulosY: 0.84, evitarCentro: true },
  "4:5":  { subtitulosY: 0.85, evitarCentro: true },
};

/** Escala y recorta (o pone barras) para llegar al formato pedido. */
export function filtroDeFormato({ anchoOrigen, altoOrigen, formato, modo = "recortar" }) {
  const destino = FORMATOS[formato];
  if (!destino) {
    throw new Error(
      `El formato "${formato}" no existe. Los validos son: ${Object.keys(FORMATOS).join(", ")}.`
    );
  }
  const { ancho: W, alto: H } = destino;

  if (anchoOrigen === W && altoOrigen === H) return `scale=${W}:${H},setsar=1`;

  if (modo === "barras") {
    // Entra completo, se rellena con negro.
    return [
      `scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos`,
      `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black`,
      "setsar=1",
    ].join(",");
  }
  // "recortar": llena el cuadro y recorta el sobrante, centrado.
  return [
    `scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos`,
    `crop=${W}:${H}`,
    "setsar=1",
  ].join(",");
}
```

- [ ] **Step 4: Correr y verificar que pasan**

```bash
cd ".claude/skills/vakdor-video/engine" && node --test tests/reframe.test.mjs
```

Esperado: `pass 7`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/vakdor-video/engine/lib/reframe.mjs \
        .claude/skills/vakdor-video/engine/tests/reframe.test.mjs
git commit -m "feat(studio): reframe.mjs con los 4 formatos y sus zonas seguras"
```

---

### Task 5: `camera.mjs` — zoom lento, jump cut, whip pan, push

El módulo más delicado. La técnica está medida en la §12 del spec: `zoompan` con sobre-muestreo 3×.

**Files:**
- Create: `.claude/skills/vakdor-video/engine/lib/camera.mjs`
- Test: `.claude/skills/vakdor-video/engine/tests/camera.test.mjs`
- Read (referencia): `docs/superpowers/specs/2026-08-11-vakdor-video-studio-hibrido-design.md` §12

**Interfaces:**
- Produces:
  - `MULTIPLICADOR_DEFAULT = 3`, `SEGUNDOS_PARA_BAJAR_A_2X = 360`.
  - `elegirMultiplicador(segundosConZoom) -> 2 | 3`.
  - `filtroZoom({ tipo, pct, duracionSec, fps, ancho, alto, multiplicador }) -> string` — `tipo` es `"zoomIn"` o `"zoomOut"`.
  - `filtroEscalaFija({ escala, ancho, alto }) -> string` — para `jumpCutClose` (escala > 1) y `jumpCutWide` (escala < 1).
  - `filtroWhipPan({ fps, ancho, direccion }) -> string` — `direccion` es `"izq"` o `"der"`.
  - `filtroPush({ pct, duracionSec, fps, ancho, alto }) -> string`.

- [ ] **Step 1: Escribir la prueba que falla**

`tests/camera.test.mjs`:

```js
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { elegirMultiplicador, filtroZoom, filtroEscalaFija, filtroWhipPan, filtroPush } from "../lib/camera.mjs";
import { crearClipDePrueba, dirTemporal } from "./helpers.mjs";

let dir, clip;
before(() => {
  dir = dirTemporal();
  clip = crearClipDePrueba({ segundos: 2, salida: path.join(dir, "c.mp4") });
});
after(() => fs.rmSync(dir, { recursive: true, force: true }));

const aplicar = (vf, nombre) => {
  const salida = path.join(dir, `${nombre}.mp4`);
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-i", clip, "-vf", vf,
    "-c:v", "libx264", "-crf", "24", "-pix_fmt", "yuv420p", salida], { encoding: "utf8" });
  assert.equal(r.status, 0, `ffmpeg rechazo "${nombre}": ${r.stderr}`);
  const dims = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height", "-of", "csv=p=0", salida], { encoding: "utf8" }).stdout.trim();
  assert.equal(dims, "1920,1080", `"${nombre}" cambio las dimensiones: ${dims}`);
  return salida;
};

test("el multiplicador baja a 2x cuando hay mucho zoom", () => {
  assert.equal(elegirMultiplicador(60), 3);
  assert.equal(elegirMultiplicador(359), 3);
  assert.equal(elegirMultiplicador(361), 2);
});

test("el zoom usa sobre-muestreo, no scale con eval=frame", () => {
  const vf = filtroZoom({ tipo: "zoomIn", pct: 8, duracionSec: 2, fps: 30, ancho: 1920, alto: 1080, multiplicador: 3 });
  assert.ok(vf.includes("zoompan"), "tiene que usar zoompan");
  assert.ok(vf.includes("5760:3240"), "tiene que sobre-muestrear 3x antes");
  assert.ok(!vf.includes("eval=frame"), "scale con eval=frame quedo descartado por la medicion");
});

test("zoomOut arranca ampliado y termina en 1", () => {
  const vf = filtroZoom({ tipo: "zoomOut", pct: 8, duracionSec: 2, fps: 30, ancho: 1920, alto: 1080, multiplicador: 2 });
  assert.ok(vf.includes("1.08"), `deberia partir de 1.08: ${vf}`);
});

test("ffmpeg acepta los 4 movimientos y no cambia las dimensiones", () => {
  aplicar(filtroZoom({ tipo: "zoomIn", pct: 8, duracionSec: 2, fps: 30, ancho: 1920, alto: 1080, multiplicador: 2 }), "zoomIn");
  aplicar(filtroZoom({ tipo: "zoomOut", pct: 6, duracionSec: 2, fps: 30, ancho: 1920, alto: 1080, multiplicador: 2 }), "zoomOut");
  aplicar(filtroEscalaFija({ escala: 1.18, ancho: 1920, alto: 1080 }), "jumpCutClose");
  aplicar(filtroWhipPan({ fps: 30, ancho: 1920, direccion: "der" }), "whipPan");
  aplicar(filtroPush({ pct: 6, duracionSec: 1, fps: 30, ancho: 1920, alto: 1080 }), "push");
});

test("el zoom no deja frames congelados (la medicion del spec)", () => {
  // OJO: esta prueba EXIGE una fuente FIJA. `crearClipDePrueba` usa testsrc2, que se
  // mueve solo: con esa fuente la diferencia entre frames nunca da cero y la prueba
  // pasaria siempre, aunque el zoom trepidara. Con imagen fija, la unica diferencia
  // entre frames es el zoom, que es justo lo que hay que medir.
  const quieto = path.join(dir, "quieto.mp4");
  spawnSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=1920x1080",
    "-frames:v", "1", path.join(dir, "quieto.png")]);
  spawnSync("ffmpeg", ["-y", "-v", "error", "-loop", "1", "-i", path.join(dir, "quieto.png"),
    "-t", "2", "-r", "30", "-c:v", "libx264", "-crf", "12", "-pix_fmt", "yuv420p", quieto]);

  const vf = filtroZoom({ tipo: "zoomIn", pct: 2, duracionSec: 2, fps: 30, ancho: 1920, alto: 1080, multiplicador: 3 });
  const salida = path.join(dir, "suavidad.mp4");
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-i", quieto, "-vf", vf,
    "-c:v", "libx264", "-crf", "12", "-pix_fmt", "yuv420p", salida], { encoding: "utf8" });
  assert.equal(r.status, 0, `ffmpeg fallo: ${r.stderr}`);
  const out = spawnSync("ffmpeg", ["-v", "error", "-i", salida, "-vf",
    "tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-",
    "-f", "null", "-"], { encoding: "utf8" }).stdout;
  const vals = [...out.matchAll(/YAVG=([0-9.]+)/g)].map((m) => Number(m[1]));
  assert.ok(vals.length > 10, "no pude medir los frames");
  const media = vals.reduce((a, b) => a + b, 0) / vals.length;
  const congelados = vals.filter((v) => v < media * 0.35).length;
  assert.ok(congelados <= vals.length * 0.05, `${congelados}/${vals.length} frames congelados, el zoom escalona`);
});
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
cd ".claude/skills/vakdor-video/engine" && node --test tests/camera.test.mjs
```

Esperado: FALLA con `Cannot find module '../lib/camera.mjs'`.

- [ ] **Step 3: Implementar `lib/camera.mjs`**

```js
/**
 * Movimientos de camara, todos en ffmpeg.
 * La tecnica del zoom esta MEDIDA en la §12 del spec: zoompan con sobre-muestreo 3x
 * da 0 frames congelados; scale con eval=frame daba 35 de 89. No cambiar sin volver a medir.
 */
export const MULTIPLICADOR_DEFAULT = 3;
export const SEGUNDOS_PARA_BAJAR_A_2X = 360;

/** 3x es mas suave pero cuesta 0,76x tiempo real. Con mucho zoom, 2x (1,96x tiempo real). */
export const elegirMultiplicador = (segundosConZoom) =>
  segundosConZoom > SEGUNDOS_PARA_BAJAR_A_2X ? 2 : MULTIPLICADOR_DEFAULT;

const centrado = "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'";

export function filtroZoom({ tipo, pct, duracionSec, fps, ancho, alto, multiplicador = MULTIPLICADOR_DEFAULT }) {
  if (tipo !== "zoomIn" && tipo !== "zoomOut")
    throw new Error(`Tipo de zoom desconocido: "${tipo}". Usa "zoomIn" o "zoomOut".`);

  const frames = Math.max(1, Math.round(duracionSec * fps));
  const factor = 1 + pct / 100;
  // `on` es el numero de frame de salida.
  const z = tipo === "zoomIn"
    ? `1+${(pct / 100).toFixed(4)}*on/${frames}`
    : `${factor.toFixed(4)}-${(pct / 100).toFixed(4)}*on/${frames}`;

  const W = ancho * multiplicador, H = alto * multiplicador;
  return [
    `scale=${W}:${H}:flags=bilinear`,
    `zoompan=z='${z}':d=1:${centrado}:s=${ancho}x${alto}:fps=${fps}`,
    "setsar=1",
  ].join(",");
}

/** Cambio de plano sin movimiento: recorta y vuelve a escalar. */
export function filtroEscalaFija({ escala, ancho, alto }) {
  if (escala <= 0) throw new Error(`La escala tiene que ser mayor que 0, vino ${escala}.`);
  if (escala === 1) return `scale=${ancho}:${alto},setsar=1`;
  const W = Math.round((ancho * escala) / 2) * 2;
  const H = Math.round((alto * escala) / 2) * 2;
  return [`scale=${W}:${H}:flags=lanczos`, `crop=${ancho}:${alto}`, "setsar=1"].join(",");
}

/**
 * Barrido rapido de camara: ~8 frames de desplazamiento + desenfoque horizontal.
 * PROBADO: `gblur` NO acepta expresiones en `sigma` (da "Unable to parse sigma option value").
 * Por eso el desenfoque se hace en 3 escalones con `enable=between(n,...)`, que si funciona.
 * `crop` en cambio SI evalua `n` por frame en x/y — ahi va el desplazamiento continuo.
 */
export function filtroWhipPan({ fps, ancho, direccion = "der" }) {
  const frames = Math.max(4, Math.round(fps * 0.27)); // ~8 frames a 30fps
  const signo = direccion === "izq" ? "-" : "";
  const a = Math.max(1, Math.round(frames * 0.25));
  const b = Math.max(a + 1, Math.round(frames * 0.65));
  const desplazamiento = `${signo}(${ancho}*0.35)*if(lt(n,${frames}),sin(PI*n/${frames}),0)`;
  return [
    `gblur=sigma=8:sigmaV=0:enable='between(n,1,${a})'`,
    `gblur=sigma=22:sigmaV=0:enable='between(n,${a + 1},${b})'`,
    `gblur=sigma=8:sigmaV=0:enable='between(n,${b + 1},${frames})'`,
    `crop=w=iw:h=ih:x='${desplazamiento}':y=0:exact=1`,
    "setsar=1",
  ].join(",");
}

/** Empuje corto y firme para entrar a una idea fuerte. */
export function filtroPush({ pct, duracionSec, fps, ancho, alto }) {
  return filtroZoom({ tipo: "zoomIn", pct, duracionSec, fps, ancho, alto, multiplicador: 2 });
}
```

- [ ] **Step 4: Correr y verificar que pasan**

```bash
cd ".claude/skills/vakdor-video/engine" && node --test tests/camera.test.mjs
```

Esperado: `pass 5`, `fail 0`. Si falla la prueba de suavidad, **no bajar el umbral**: revisar el filtro.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/vakdor-video/engine/lib/camera.mjs \
        .claude/skills/vakdor-video/engine/tests/camera.test.mjs
git commit -m "feat(studio): camera.mjs con zoom medido (zoompan 3x), jump cut, whip pan y push"
```

---

### Task 6: `recipe.mjs` — validar la receta y anclar efectos a palabras

**Files:**
- Create: `.claude/skills/vakdor-video/engine/lib/recipe.mjs`
- Test: `.claude/skills/vakdor-video/engine/tests/recipe.test.mjs`

**Interfaces:**
- Consumes: `FORMATOS` de `reframe.mjs`, `PRESETS_COLOR` de `grade.mjs`.
- Produces:
  - `RECETA_DEFAULT` — objeto con los valores por defecto de todos los campos.
  - `cargarReceta(rutaOObjeto, { durationSec, palabras }) -> { receta, avisos: string[] }` — `palabras` es `[{ texto, inicioSec }]`. Resuelve los anclajes por palabra a `t`, aplica defaults, valida. Los efectos que no se pueden anclar **se descartan y se listan en `avisos`**; los errores duros lanzan `Error`.

- [ ] **Step 1: Escribir la prueba que falla**

`tests/recipe.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { cargarReceta, RECETA_DEFAULT } from "../lib/recipe.mjs";

const PALABRAS = [
  { texto: "hola", inicioSec: 0.5 },
  { texto: "trazabilidad", inicioSec: 12.4 },
  { texto: "control", inicioSec: 20.0 },
  { texto: "control", inicioSec: 35.5 },
];
const CTX = { durationSec: 60, palabras: PALABRAS };

test("aplica los valores por defecto", () => {
  const { receta } = cargarReceta({}, CTX);
  assert.equal(receta.formato, RECETA_DEFAULT.formato);
  assert.equal(receta.estilo, RECETA_DEFAULT.estilo);
  assert.deepEqual(receta.fx, []);
});

test("ancla un efecto a la palabra hablada", () => {
  const { receta } = cargarReceta({ fx: [{ palabra: "trazabilidad", tipo: "callout", texto: "X" }] }, CTX);
  assert.equal(receta.fx[0].t, 12.4);
});

test("ocurrencia elige cual repeticion", () => {
  const { receta } = cargarReceta({ fx: [{ palabra: "control", ocurrencia: 2, tipo: "callout", texto: "X" }] }, CTX);
  assert.equal(receta.fx[0].t, 35.5);
});

test("el anclaje no distingue mayusculas ni acentos", () => {
  const { receta } = cargarReceta({ fx: [{ palabra: "TRAZABILIDAD", tipo: "callout", texto: "X" }] }, CTX);
  assert.equal(receta.fx[0].t, 12.4);
});

test("palabra inexistente: se saltea con aviso, NO rompe", () => {
  const { receta, avisos } = cargarReceta({ fx: [{ palabra: "blockchain", tipo: "callout", texto: "X" }] }, CTX);
  assert.equal(receta.fx.length, 0);
  assert.match(avisos[0], /blockchain/);
});

test("tiempo fuera del video: se saltea con aviso", () => {
  const { receta, avisos } = cargarReceta({ fx: [{ t: 999, tipo: "callout", texto: "X" }] }, CTX);
  assert.equal(receta.fx.length, 0);
  assert.match(avisos[0], /999/);
});

test("formato invalido: error duro", () => {
  assert.throws(() => cargarReceta({ formato: "21:9" }, CTX), /formato/i);
});

test("preset de color invalido: error duro", () => {
  assert.throws(() => cargarReceta({ grade: { preset: "neon" } }, CTX), /neon/);
});

test("b-roll con archivo inexistente: error duro antes de renderizar", () => {
  assert.throws(() => cargarReceta({ broll: [{ t: 5, dur: 3, src: "no/existe.mp4" }] }, CTX), /no existe/i);
});
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
cd ".claude/skills/vakdor-video/engine" && node --test tests/recipe.test.mjs
```

Esperado: FALLA con `Cannot find module '../lib/recipe.mjs'`.

- [ ] **Step 3: Implementar `lib/recipe.mjs`**

```js
import fs from "node:fs";
import path from "node:path";
import { FORMATOS } from "./reframe.mjs";
import { PRESETS_COLOR } from "./grade.mjs";

export const RECETA_DEFAULT = {
  formato: "16:9",
  estilo: "autoridad",
  calidad: "auto",
  corte: { db: -30, min: 0.6, pad: 0.15 },
  grade: { preset: "cinematic", vignette: null },
  subtitulos: { modo: "karaoke", posicion: "inferior" },
  camara: [],
  fx: [],
  broll: [],
};

const ESTILOS = ["autoridad", "dinamico", "demo"];
const CALIDADES = ["auto", "max", "rapido"];
const MODOS_SUBS = ["karaoke", "premium", "simple", "no"];

/** Saca acentos y pasa a minusculas, para que el anclaje no falle por tipeo. */
const normalizar = (s) =>
  String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]/gu, "");

function resolverTiempo(item, palabras, avisos, etiqueta) {
  if (typeof item.t === "number") return item.t;
  if (!item.palabra) {
    avisos.push(`Un efecto de ${etiqueta} no tiene ni "t" ni "palabra". Lo salteo.`);
    return null;
  }
  const buscada = normalizar(item.palabra);
  const cuales = palabras.filter((p) => normalizar(p.texto) === buscada);
  const n = item.ocurrencia ?? 1;
  if (cuales.length < n) {
    avisos.push(
      cuales.length === 0
        ? `No encontre la palabra "${item.palabra}" en lo que decis. Salteo ese efecto de ${etiqueta}.`
        : `La palabra "${item.palabra}" aparece ${cuales.length} vez/veces, pediste la numero ${n}. Salteo ese efecto.`
    );
    return null;
  }
  return cuales[n - 1].inicioSec;
}

export function cargarReceta(origen, { durationSec, palabras = [] }) {
  const cruda = typeof origen === "string"
    ? JSON.parse(fs.readFileSync(origen, "utf8"))
    : (origen ?? {});
  const baseDir = typeof origen === "string" ? path.dirname(origen) : process.cwd();

  const receta = {
    ...RECETA_DEFAULT, ...cruda,
    corte: { ...RECETA_DEFAULT.corte, ...(cruda.corte ?? {}) },
    grade: { ...RECETA_DEFAULT.grade, ...(cruda.grade ?? {}) },
    subtitulos: { ...RECETA_DEFAULT.subtitulos, ...(cruda.subtitulos ?? {}) },
  };
  const avisos = [];

  // --- Errores duros: no tiene sentido renderizar y descubrirlo al final ---
  if (!FORMATOS[receta.formato])
    throw new Error(`El formato "${receta.formato}" no existe. Validos: ${Object.keys(FORMATOS).join(", ")}.`);
  if (!ESTILOS.includes(receta.estilo))
    throw new Error(`El estilo "${receta.estilo}" no existe. Validos: ${ESTILOS.join(", ")}.`);
  if (!CALIDADES.includes(receta.calidad))
    throw new Error(`La calidad "${receta.calidad}" no existe. Validas: ${CALIDADES.join(", ")}.`);
  if (!MODOS_SUBS.includes(receta.subtitulos.modo))
    throw new Error(`El modo de subtitulos "${receta.subtitulos.modo}" no existe. Validos: ${MODOS_SUBS.join(", ")}.`);
  if (receta.grade.preset && receta.grade.preset !== "ninguno" && !PRESETS_COLOR[receta.grade.preset])
    throw new Error(`El preset de color "${receta.grade.preset}" no existe. Validos: ${Object.keys(PRESETS_COLOR).join(", ")}.`);

  for (const b of receta.broll) {
    const ruta = path.isAbsolute(b.src) ? b.src : path.join(baseDir, b.src);
    if (!fs.existsSync(ruta)) throw new Error(`El b-roll no existe: ${ruta}`);
    b.src = ruta;
  }

  // --- Avisos: se saltea el efecto, el render sigue ---
  const resolverLista = (lista, etiqueta) =>
    lista.map((item) => {
      const t = resolverTiempo(item, palabras, avisos, etiqueta);
      if (t === null) return null;
      if (t < 0 || t > durationSec) {
        avisos.push(`El efecto de ${etiqueta} en el segundo ${t} cae fuera del video (dura ${durationSec.toFixed(1)}s). Lo salteo.`);
        return null;
      }
      return { ...item, t };
    }).filter(Boolean).sort((a, b) => a.t - b.t);

  receta.camara = resolverLista(receta.camara, "camara");
  receta.fx = resolverLista(receta.fx, "efectos");
  receta.broll = resolverLista(receta.broll, "b-roll");

  return { receta, avisos };
}
```

- [ ] **Step 4: Correr y verificar que pasan**

```bash
cd ".claude/skills/vakdor-video/engine" && node --test tests/recipe.test.mjs
```

Esperado: `pass 9`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/vakdor-video/engine/lib/recipe.mjs \
        .claude/skills/vakdor-video/engine/tests/recipe.test.mjs
git commit -m "feat(studio): recipe.mjs valida y ancla efectos a la palabra hablada"
```

---

### Task 7: `compose.mjs` — un solo grafo, un solo encode

**Files:**
- Create: `.claude/skills/vakdor-video/engine/lib/compose.mjs`
- Test: `.claude/skills/vakdor-video/engine/tests/compose.test.mjs`

**Interfaces:**
- Consumes: `filtroDeColor`, `filtroDeFormato`, `filtroZoom`/`filtroEscalaFija`/`filtroWhipPan`/`filtroPush`/`elegirMultiplicador`, `elegirEncoder`.
- Produces:
  - `construirGrafo({ receta, info }) -> { filtroVideo: string, tramos: Array<{desde,hasta,filtro}> }`. `info` es lo que devuelve `probe`.
  - `componer({ entrada, salida, receta, info, encoder, alSalir }) -> Promise<{ segundos: number, encoder: string }>` — ejecuta ffmpeg una sola vez.

**Regla de diseño:** los tramos con zoom se procesan por separado (sobre-muestreo caro) y se concatenan; los tramos sin movimiento pasan derecho. Ver §12 del spec.

- [ ] **Step 1: Escribir la prueba que falla**

`tests/compose.test.mjs`:

```js
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { construirGrafo, componer } from "../lib/compose.mjs";
import { cargarReceta } from "../lib/recipe.mjs";
import { probe } from "../lib/probe.mjs";
import { crearClipDePrueba, dirTemporal } from "./helpers.mjs";

let dir, clip, info;
before(async () => {
  dir = dirTemporal();
  clip = crearClipDePrueba({ segundos: 6, salida: path.join(dir, "in.mp4") });
  info = await probe(clip);
});
after(() => fs.rmSync(dir, { recursive: true, force: true }));

test("sin camara ni color, el grafo solo ajusta el formato", () => {
  const { receta } = cargarReceta({ grade: { preset: "ninguno" } }, { durationSec: 6, palabras: [] });
  const { filtroVideo } = construirGrafo({ receta, info });
  assert.ok(filtroVideo.includes("scale"));
  assert.ok(!filtroVideo.includes("zoompan"));
  assert.ok(!filtroVideo.includes("eq="));
});

test("el color entra al grafo", () => {
  const { receta } = cargarReceta({ grade: { preset: "moody" } }, { durationSec: 6, palabras: [] });
  const { filtroVideo } = construirGrafo({ receta, info });
  assert.ok(filtroVideo.includes("eq="));
  assert.ok(filtroVideo.includes("vignette"));
});

test("el zoom solo se aplica al tramo pedido, no a todo el video", () => {
  const { receta } = cargarReceta(
    { camara: [{ t: 2, dur: 2, fx: "zoomIn", pct: 8 }] },
    { durationSec: 6, palabras: [] }
  );
  const { tramos } = construirGrafo({ receta, info });
  assert.equal(tramos.length, 3, "deberia partir en: antes, zoom, despues");
  assert.ok(tramos[1].filtro.includes("zoompan"));
  assert.ok(!tramos[0].filtro.includes("zoompan"));
  assert.ok(!tramos[2].filtro.includes("zoompan"));
});

test("renderiza de verdad y respeta duracion y formato", async () => {
  const salida = path.join(dir, "out.mp4");
  const { receta } = cargarReceta(
    { formato: "9:16", grade: { preset: "cinematic" }, camara: [{ t: 1, dur: 2, fx: "zoomIn", pct: 8 }] },
    { durationSec: 6, palabras: [] }
  );
  const r = await componer({ entrada: clip, salida, receta, info });
  assert.ok(r.segundos > 0);

  const datos = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height:format=duration", "-of", "csv=p=0", salida], { encoding: "utf8" }).stdout;
  assert.match(datos, /1080,1920/);
  const dur = Number(datos.trim().split("\n").pop());
  assert.ok(Math.abs(dur - 6) < 0.4, `la duracion cambio: ${dur}`);
});
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
cd ".claude/skills/vakdor-video/engine" && node --test tests/compose.test.mjs
```

Esperado: FALLA con `Cannot find module '../lib/compose.mjs'`.

- [ ] **Step 3: Implementar `lib/compose.mjs`**

```js
import { spawn } from "node:child_process";
import { filtroDeColor } from "./grade.mjs";
import { filtroDeFormato, FORMATOS } from "./reframe.mjs";
import { filtroZoom, filtroEscalaFija, filtroWhipPan, filtroPush, elegirMultiplicador } from "./camera.mjs";
import { elegirEncoder } from "./encoder.mjs";

const MOVIMIENTOS_CON_DURACION = new Set(["zoomIn", "zoomOut", "push"]);

/** Parte la linea de tiempo en tramos: solo los que tienen movimiento pagan el sobre-muestreo. */
export function construirGrafo({ receta, info }) {
  const { ancho, alto } = FORMATOS[receta.formato];
  const formato = filtroDeFormato({
    anchoOrigen: info.width, altoOrigen: info.height, formato: receta.formato,
  });
  const color = filtroDeColor(receta.grade.preset, { vignette: receta.grade.vignette });

  const segundosConZoom = receta.camara
    .filter((c) => MOVIMIENTOS_CON_DURACION.has(c.fx))
    .reduce((a, c) => a + (c.dur ?? 3), 0);
  const multiplicador = elegirMultiplicador(segundosConZoom);

  const movimientoDe = (c) => {
    const comun = { fps: info.fps, ancho, alto };
    if (c.fx === "zoomIn" || c.fx === "zoomOut")
      return filtroZoom({ tipo: c.fx, pct: c.pct ?? 8, duracionSec: c.dur ?? 3, multiplicador, ...comun });
    if (c.fx === "push")
      return filtroPush({ pct: c.pct ?? 6, duracionSec: c.dur ?? 1, ...comun });
    if (c.fx === "jumpCutClose") return filtroEscalaFija({ escala: c.escala ?? 1.18, ancho, alto });
    if (c.fx === "jumpCutWide")  return filtroEscalaFija({ escala: c.escala ?? 0.88, ancho, alto });
    if (c.fx === "whipPan")      return filtroWhipPan({ fps: info.fps, ancho, direccion: c.direccion ?? "der" });
    throw new Error(`Movimiento de camara desconocido: "${c.fx}".`);
  };

  // Tramos: los huecos entre movimientos pasan sin filtro de camara.
  const tramos = [];
  let cursor = 0;
  for (const c of receta.camara) {
    const dur = c.dur ?? (MOVIMIENTOS_CON_DURACION.has(c.fx) ? 3 : Math.max(0.5, info.durationSec - c.t));
    if (c.t > cursor) tramos.push({ desde: cursor, hasta: c.t, filtro: "" });
    tramos.push({ desde: c.t, hasta: Math.min(c.t + dur, info.durationSec), filtro: movimientoDe(c) });
    cursor = Math.min(c.t + dur, info.durationSec);
  }
  if (cursor < info.durationSec) tramos.push({ desde: cursor, hasta: info.durationSec, filtro: "" });
  if (tramos.length === 0) tramos.push({ desde: 0, hasta: info.durationSec, filtro: "" });

  // `base` es lo que se le aplica a TODOS los tramos: formato + color.
  const filtroVideo = [formato, color].filter(Boolean).join(",");
  return { filtroVideo, tramos, multiplicador };
}

/** Ejecuta ffmpeg una sola vez. Separado para que `componer` no use un executor async. */
function correrFfmpeg(args, alSalir) {
  return new Promise((resolve, reject) => {
    const inicio = Date.now();
    const p = spawn("ffmpeg", args);
    let err = "";
    p.stderr.on("data", (d) => { err += d; if (alSalir) alSalir(String(d)); });
    p.on("error", (e) => reject(new Error(`No pude ejecutar ffmpeg: ${e.message}`)));
    p.on("close", (code) =>
      code === 0
        ? resolve({ segundos: (Date.now() - inicio) / 1000 })
        : reject(new Error(`ffmpeg fallo (codigo ${code}):\n${err.slice(-2000)}`)));
  });
}

/** Arma el filter_complex definitivo y hace UN solo encode. */
export async function componer({ entrada, salida, receta, info, encoder = null, alSalir = null }) {
  const { filtroVideo: base, tramos } = construirGrafo({ receta, info });
  const enc = encoder ?? (await elegirEncoder({
    calidad: receta.calidad === "max" ? "max" : "rapido",
  }));

  const partes = [];
  const etiquetas = [];
  tramos.forEach((t, i) => {
    const cadena = [
      `trim=start=${t.desde.toFixed(3)}:end=${t.hasta.toFixed(3)}`,
      "setpts=PTS-STARTPTS",
      base,
      t.filtro,
    ].filter(Boolean).join(",");
    partes.push(`[0:v]${cadena}[v${i}]`);
    etiquetas.push(`[v${i}]`);
  });
  partes.push(`${etiquetas.join("")}concat=n=${tramos.length}:v=1:a=0[vout]`);

  const args = [
    "-y", "-v", "error", "-stats", "-i", entrada,
    "-filter_complex", partes.join(";"),
    "-map", "[vout]", "-map", "0:a?",
    "-c:v", enc.nombre, ...enc.args,
    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart", salida,
  ];

  const r = await correrFfmpeg(args, alSalir);
  return { segundos: r.segundos, encoder: enc.nombre };
}
```

- [ ] **Step 4: Correr y verificar que pasan**

```bash
cd ".claude/skills/vakdor-video/engine" && node --test tests/compose.test.mjs
```

Esperado: `pass 4`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/vakdor-video/engine/lib/compose.mjs \
        .claude/skills/vakdor-video/engine/tests/compose.test.mjs
git commit -m "feat(studio): compose.mjs arma un grafo unico con un solo encode"
```

---

### Task 8: `studio.mjs` — el comando único, con `--check`, `--preview` y reporte final

**Files:**
- Create: `.claude/skills/vakdor-video/engine/studio.mjs`
- Test: `.claude/skills/vakdor-video/engine/tests/studio.test.mjs`

**Interfaces:**
- Consumes: todo `lib/`.
- Produces: CLI. Flags: `--in`, `--out`, `--receta`, `--formato`, `--calidad`, `--check`, `--preview=<segundo>`, `--encoder`.
- Produces: `parsearArgs(argv) -> objeto` exportado, para poder probarlo sin ejecutar nada.

- [ ] **Step 1: Escribir la prueba que falla**

`tests/studio.test.mjs`:

```js
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parsearArgs } from "../studio.mjs";
import { crearClipDePrueba, dirTemporal } from "./helpers.mjs";

const STUDIO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "studio.mjs");
let dir, clip;
before(() => {
  dir = dirTemporal();
  clip = crearClipDePrueba({ segundos: 8, salida: path.join(dir, "in.mp4") });
});
after(() => fs.rmSync(dir, { recursive: true, force: true }));

test("parsea flags con y sin valor", () => {
  const a = parsearArgs(["--in=x.mp4", "--formato=9:16", "--check"]);
  assert.equal(a.in, "x.mp4");
  assert.equal(a.formato, "9:16");
  assert.equal(a.check, true);
});

test("--check valida sin renderizar", () => {
  const salida = path.join(dir, "no-deberia-existir.mp4");
  const r = spawnSync("node", [STUDIO, `--in=${clip}`, `--out=${salida}`, "--check"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /receta|grafo/i);
  assert.equal(fs.existsSync(salida), false, "--check no tiene que escribir el video");
});

test("--check falla con codigo != 0 si la receta esta mal", () => {
  const receta = path.join(dir, "mala.json");
  fs.writeFileSync(receta, JSON.stringify({ formato: "21:9" }));
  const r = spawnSync("node", [STUDIO, `--in=${clip}`, `--out=${path.join(dir, "x.mp4")}`,
    `--receta=${receta}`, "--check"], { encoding: "utf8" });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /21:9/);
});

test("--preview renderiza solo una ventana corta", () => {
  const salida = path.join(dir, "prev.mp4");
  const r = spawnSync("node", [STUDIO, `--in=${clip}`, `--out=${salida}`, "--preview=4"],
    { encoding: "utf8", timeout: 180000 });
  assert.equal(r.status, 0, r.stderr);
  const dur = Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration",
    "-of", "csv=p=0", salida], { encoding: "utf8" }).stdout.trim());
  assert.ok(dur < 8, `la preview deberia ser corta, dio ${dur}s`);
});

test("render completo y reporte final", () => {
  const salida = path.join(dir, "full.mp4");
  const r = spawnSync("node", [STUDIO, `--in=${clip}`, `--out=${salida}`, "--formato=1:1"],
    { encoding: "utf8", timeout: 300000 });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(salida));
  assert.match(r.stdout, /encoder/i);
  assert.match(r.stdout, /segundos|tardo/i);
});
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
cd ".claude/skills/vakdor-video/engine" && node --test tests/studio.test.mjs
```

Esperado: FALLA con `Cannot find module '../studio.mjs'`.

- [ ] **Step 3: Implementar `studio.mjs`**

```js
#!/usr/bin/env node
/**
 * studio.mjs — el comando unico del Vakdor Video Studio.
 *
 *   node studio.mjs --in=crudo.mp4 --out=final.mp4 --receta=receta.json
 *   node studio.mjs --in=crudo.mp4 --out=final.mp4 --check
 *   node studio.mjs --in=crudo.mp4 --out=final.mp4 --preview=125
 */
import fs from "node:fs";
import path from "node:path";
import { probe } from "./lib/probe.mjs";
import { cargarReceta } from "./lib/recipe.mjs";
import { construirGrafo, componer } from "./lib/compose.mjs";
import { elegirEncoder } from "./lib/encoder.mjs";

export function parsearArgs(argv) {
  return Object.fromEntries(argv.map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  }));
}

const VENTANA_PREVIEW = 20;

async function main() {
  const args = parsearArgs(process.argv.slice(2));
  if (!args.in || !args.out) {
    console.error("Uso: node studio.mjs --in=crudo.mp4 --out=final.mp4 [--receta=receta.json] [--check] [--preview=SEG]");
    process.exit(1);
  }

  const info = await probe(args.in);
  console.log(`Entrada: ${path.basename(args.in)} — ${info.width}x${info.height} @ ${info.fps}fps, ${info.durationSec.toFixed(1)}s`);

  const crudaReceta = args.receta ? args.receta : {};
  const { receta, avisos } = cargarReceta(crudaReceta, { durationSec: info.durationSec, palabras: [] });
  if (args.formato) receta.formato = args.formato;
  if (args.calidad) receta.calidad = args.calidad;

  const { filtroVideo, tramos, multiplicador } = construirGrafo({ receta, info });
  console.log(`Receta: formato ${receta.formato}, estilo ${receta.estilo}, color ${receta.grade.preset}`);
  console.log(`Grafo: ${tramos.length} tramo(s), sobre-muestreo ${multiplicador}x`);
  if (process.env.STUDIO_DEBUG) console.log(filtroVideo);

  if (avisos.length) {
    console.log("\nAvisos:");
    for (const a of avisos) console.log(`  - ${a}`);
  }

  if (args.check) {
    console.log("\n--check: la receta es valida y el grafo se puede construir. No renderice nada.");
    return;
  }

  let entrada = args.in, recorte = null;
  if (args.preview !== undefined) {
    const centro = Number(args.preview) || 0;
    const desde = Math.max(0, centro - VENTANA_PREVIEW / 2);
    recorte = { desde, dur: Math.min(VENTANA_PREVIEW, info.durationSec - desde) };
    console.log(`\nPreview: ${recorte.desde.toFixed(1)}s a ${(recorte.desde + recorte.dur).toFixed(1)}s`);
  }

  const encoder = await elegirEncoder({
    forzar: typeof args.encoder === "string" ? args.encoder : undefined,
    calidad: receta.calidad === "max" ? "max" : "rapido",
  });
  console.log(`Encoder: ${encoder.nombre}${encoder.esGpu ? " (GPU)" : " (CPU)"}`);

  const infoEfectiva = recorte ? { ...info, durationSec: recorte.dur } : info;
  const recetaEfectiva = recorte
    ? { ...receta,
        camara: receta.camara.filter((c) => c.t >= recorte.desde && c.t < recorte.desde + recorte.dur)
                             .map((c) => ({ ...c, t: c.t - recorte.desde })) }
    : receta;

  if (recorte) {
    const tmp = path.join(path.dirname(args.out), ".preview-fuente.mp4");
    const { spawnSync } = await import("node:child_process");
    spawnSync("ffmpeg", ["-y", "-v", "error", "-ss", String(recorte.desde), "-t", String(recorte.dur),
      "-i", args.in, "-c", "copy", tmp]);
    entrada = tmp;
  }

  const r = await componer({ entrada, salida: args.out, receta: recetaEfectiva, info: infoEfectiva, encoder });
  if (recorte) fs.rmSync(entrada, { force: true });

  console.log(`\nListo: ${args.out}`);
  console.log(`Tardo ${r.segundos.toFixed(1)} segundos con el encoder ${r.encoder}.`);
  console.log(`Efectos de camara aplicados: ${recetaEfectiva.camara.length}. Salteados: ${avisos.length}.`);
}

main().catch((e) => { console.error(`\nError: ${e.message}`); process.exit(1); });
```

- [ ] **Step 4: Correr y verificar que pasan**

```bash
cd ".claude/skills/vakdor-video/engine" && node --test tests/studio.test.mjs
```

Esperado: `pass 5`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/vakdor-video/engine/studio.mjs \
        .claude/skills/vakdor-video/engine/tests/studio.test.mjs
git commit -m "feat(studio): studio.mjs, comando unico con --check, --preview y reporte final"
```

---

### Task 9: Mudar `cut` y `transcribe` a `lib/` y conectarlos al pipeline

Hoy `cut-exact.mjs` y `transcribe-groq.mjs` viven sueltos en `Prisma - MK\_motor-video` y no están en el repo. Se traen, se convierten en módulos y se enchufan a `studio.mjs`.

**Files:**
- Create: `.claude/skills/vakdor-video/engine/lib/cut.mjs` (desde `Prisma - MK\_motor-video\cut-exact.mjs`)
- Create: `.claude/skills/vakdor-video/engine/lib/transcribe.mjs` (desde `Prisma - MK\_motor-video\transcribe-groq.mjs`)
- Test: `.claude/skills/vakdor-video/engine/tests/cut.test.mjs`
- Modify: `.claude/skills/vakdor-video/engine/studio.mjs` (agregar los pasos 1 y 2 del pipeline)

**Interfaces:**
- Produces: `detectarSilencios({ entrada, db, min }) -> Promise<Array<[inicio, fin]>>`.
- Produces: `cortarSilencios({ entrada, salida, db, min, pad }) -> Promise<{ salida, tramos, duracionFinal }>`.
- Produces: `transcribir({ entrada, apiKey, idioma }) -> Promise<{ srt: string, palabras: Array<{texto, inicioSec}> }>`.
- Modifica `studio.mjs`: flag nuevo `--sin-corte` para saltear el paso 1, y `--srt=archivo.srt` para saltear el paso 2.

- [ ] **Step 1: Escribir la prueba que falla**

`tests/cut.test.mjs`:

```js
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { detectarSilencios, cortarSilencios } from "../lib/cut.mjs";
import { dirTemporal } from "./helpers.mjs";

let dir, conSilencio;
before(() => {
  dir = dirTemporal();
  // 2s de tono, 2s de silencio, 2s de tono
  conSilencio = path.join(dir, "silencios.mp4");
  const r = spawnSync("ffmpeg", ["-y", "-v", "error",
    "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=6",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=6",
    "-af", "volume=enable='between(t,2,4)':volume=0",
    "-c:v", "libx264", "-crf", "28", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", conSilencio],
    { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
});
after(() => fs.rmSync(dir, { recursive: true, force: true }));

test("detecta el silencio del medio", async () => {
  const sil = await detectarSilencios({ entrada: conSilencio, db: -30, min: 0.5 });
  assert.ok(sil.length >= 1, "tendria que encontrar al menos un silencio");
  const [ini, fin] = sil[0];
  assert.ok(ini > 1.5 && ini < 2.5, `el silencio arranca raro: ${ini}`);
  assert.ok(fin > 3.5 && fin < 4.5, `el silencio termina raro: ${fin}`);
});

test("cortar deja el video mas corto y con los tramos buenos", async () => {
  const salida = path.join(dir, "cortado.mp4");
  const r = await cortarSilencios({ entrada: conSilencio, salida, db: -30, min: 0.5, pad: 0.1 });
  assert.ok(r.duracionFinal < 5.5, `no acorto: ${r.duracionFinal}`);
  assert.ok(r.duracionFinal > 3.5, `corto de mas: ${r.duracionFinal}`);
  assert.equal(r.tramos.length, 2);
});
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
cd ".claude/skills/vakdor-video/engine" && node --test tests/cut.test.mjs
```

Esperado: FALLA con `Cannot find module '../lib/cut.mjs'`.

- [ ] **Step 3a: Portar `cut-exact.mjs` a `lib/cut.mjs`**

Fuente: `C:\Users\LENOVO\Desktop\CODE\Antigravity - Apps\Prisma - MK\_motor-video\cut-exact.mjs`.

Conservar **exacta** la lógica que ya está probada en producción, y solo cambiar la envoltura:

- Sacar el bloque `process.argv`, los `console.log` de progreso y el `process.exit`.
- `detectarSilencios` = pasos 1 y 2 del script (ffprobe de duración + `silencedetect`), devolviendo
  el array `sil` de pares `[inicio, fin]`.
- `cortarSilencios` = pasos 3 a 6: colchón `PAD`, descarte de tramos < 0.2 s, fusión de adyacentes
  con hueco < 0.05 s, extracción tramo por tramo con `-ss`/`-to` **antes** de `-i` y re-encode
  `libx264 -preset ultrafast -crf 16` (esto es lo que evita los duplicados por I-frames),
  `concat demuxer`, y las dos pasadas de `loudnorm` a −14 LUFS con las mediciones de la primera.
- Devolver `{ salida, tramos: merged, duracionFinal }`.
- Borrar `_cut_exact_tmp` en un `finally`, no en el `exit` del proceso.

- [ ] **Step 3b: Portar `transcribe-groq.mjs` a `lib/transcribe.mjs`**

**Corrección obligatoria, verificada contra la API el 11-ago-2026:** el script actual pide
`response_format=verbose_json` pero **no** pide granularidad de palabra, así que reparte los tiempos
dividiendo el texto del segmento — los tiempos por palabra de hoy son **estimados**. El anclaje por
palabra necesita tiempos reales, así que el pedido cambia. Probado con voz real: devuelve 87
palabras con `start`/`end` propios y 6 segmentos.

Hay que pedir **las dos granularidades**. Si se pide solo `word`, `segments` vuelve `null` y se
pierden las líneas del SRT.

```js
const form = new FormData();
form.append("file", new Blob([fs.readFileSync(entrada)]), path.basename(entrada));
form.append("model", "whisper-large-v3");
form.append("response_format", "verbose_json");
form.append("timestamp_granularities[]", "word");     // <-- sin esto, los tiempos son estimados
form.append("timestamp_granularities[]", "segment");  // <-- sin esto, segments vuelve null
form.append("language", idioma ?? "es");

const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
  method: "POST",
  headers: { Authorization: `Bearer ${apiKey}` },
  body: form,
});
if (!r.ok) throw new Error(`Groq respondio ${r.status}: ${await r.text()}`);
const data = await r.json();

// Lo que consume recipe.mjs para anclar efectos a la palabra hablada.
const palabras = (data.words ?? []).map((w) => ({
  texto: w.word,
  inicioSec: w.start,
  finSec: w.end,
}));
```

Conservar del script original: la lectura de `GROQ_API_KEY` desde `.env`, y el armado del SRT desde
`data.segments` con corte de línea a 46 caracteres.

Si `data.words` viene vacío, **no inventar tiempos**: devolver `palabras: []` y que `recipe.mjs`
avise que no puede anclar por palabra. Es preferible un aviso claro a un efecto en el momento
equivocado.

- [ ] **Step 4: Correr y verificar que pasan**

```bash
cd ".claude/skills/vakdor-video/engine" && node --test tests/cut.test.mjs
```

Esperado: `pass 2`, `fail 0`.

- [ ] **Step 5: Conectar los pasos 1 y 2 en `studio.mjs`**

Antes de `probe`, si no viene `--sin-corte`, correr `cortarSilencios` y usar su salida como entrada.
Si no viene `--srt` y hay `GROQ_API_KEY`, correr `transcribir` sobre el video **ya cortado** y pasar
`palabras` a `cargarReceta`. Agregar al reporte final las líneas:

```
Corte: de 19.2 min a 16.4 min (2.8 min de silencios).
Transcripcion: 3120 palabras.
```

- [ ] **Step 6: Correr TODA la batería**

```bash
cd ".claude/skills/vakdor-video/engine" && npm test
```

Esperado: `fail 0` en las 7 pruebas de archivo.

- [ ] **Step 7: Commit**

```bash
git add .claude/skills/vakdor-video/engine/lib/cut.mjs \
        .claude/skills/vakdor-video/engine/lib/transcribe.mjs \
        .claude/skills/vakdor-video/engine/tests/cut.test.mjs \
        .claude/skills/vakdor-video/engine/studio.mjs
git commit -m "feat(studio): cut y transcribe pasan a lib/ y se enchufan al pipeline"
```

---

### Task 10: `enhance.mjs` — limpieza de imagen medida y estabilización

Para video grabado con celular o que pasó por WhatsApp. **Medido con VMAF el 11-ago-2026** sobre 8 s
del VSL comprimido a 500 kbps: sin tratar 77,47 · solo `cas` 78,13 · `hqdn3d`+`cas`+`unsharp`
**83,48** (+6,0 puntos). `nlmeans` se descartó: tardó más de 2 minutos para 8 segundos.

**Files:**
- Create: `.claude/skills/vakdor-video/engine/lib/enhance.mjs`
- Test: `.claude/skills/vakdor-video/engine/tests/enhance.test.mjs`
- Modify: `.claude/skills/vakdor-video/engine/studio.mjs` (flags `--limpiar` y `--estabilizar`)

**Interfaces:**
- Produces: `NIVELES_LIMPIEZA` — `{ suave, normal, fuerte }`, cada uno `{ hqdn3d, cas, unsharp }`.
- Produces: `filtroDeLimpieza(nivel) -> string`. `nivel` `null` o `"no"` devuelve `""`.
- Produces: `estabilizar({ entrada, salida, suavizado }) -> Promise<{ salida }>` — dos pasadas de
  vidstab. Se ejecuta **antes** de `compose`, porque necesita su propio análisis del archivo entero.

- [ ] **Step 1: Escribir la prueba que falla**

`tests/enhance.test.mjs`:

```js
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { NIVELES_LIMPIEZA, filtroDeLimpieza, estabilizar } from "../lib/enhance.mjs";
import { crearClipDePrueba, dirTemporal } from "./helpers.mjs";

let dir, clip;
before(() => {
  dir = dirTemporal();
  clip = crearClipDePrueba({ segundos: 3, salida: path.join(dir, "e.mp4") });
});
after(() => fs.rmSync(dir, { recursive: true, force: true }));

test("los 3 niveles y el apagado", () => {
  assert.deepEqual(Object.keys(NIVELES_LIMPIEZA).sort(), ["fuerte", "normal", "suave"]);
  assert.equal(filtroDeLimpieza(null), "");
  assert.equal(filtroDeLimpieza("no"), "");
});

test("la cadena medida usa hqdn3d + cas + unsharp, NO nlmeans", () => {
  const f = filtroDeLimpieza("normal");
  assert.ok(f.includes("hqdn3d"));
  assert.ok(f.includes("cas"));
  assert.ok(f.includes("unsharp"));
  assert.ok(!f.includes("nlmeans"), "nlmeans se descarto por lento (2 min para 8 s)");
});

test("ffmpeg acepta los 3 niveles", () => {
  for (const n of Object.keys(NIVELES_LIMPIEZA)) {
    const r = spawnSync("ffmpeg", ["-v", "error", "-i", clip, "-vf", filtroDeLimpieza(n),
      "-frames:v", "2", "-f", "null", "-"], { encoding: "utf8" });
    assert.equal(r.status, 0, `ffmpeg rechazo el nivel "${n}": ${r.stderr}`);
  }
});

test("estabilizar hace las 2 pasadas y no cambia las dimensiones", async () => {
  const salida = path.join(dir, "estab.mp4");
  await estabilizar({ entrada: clip, salida, suavizado: 30 });
  const dims = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height", "-of", "csv=p=0", salida], { encoding: "utf8" }).stdout.trim();
  assert.equal(dims, "1920,1080");
});

test("estabilizar limpia el archivo .trf temporal", async () => {
  const salida = path.join(dir, "estab2.mp4");
  await estabilizar({ entrada: clip, salida, suavizado: 20 });
  const sobrantes = fs.readdirSync(dir).filter((f) => f.endsWith(".trf"));
  assert.deepEqual(sobrantes, [], `quedaron temporales: ${sobrantes.join(", ")}`);
});
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
cd ".claude/skills/vakdor-video/engine" && node --test tests/enhance.test.mjs
```

Esperado: FALLA con `Cannot find module '../lib/enhance.mjs'`.

- [ ] **Step 3: Implementar `lib/enhance.mjs`**

```js
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Cadena MEDIDA con VMAF sobre video comprimido tipo WhatsApp (ver Task 10 del plan):
 *   sin tratar 77,47 | solo cas 78,13 | hqdn3d+cas+unsharp 83,48
 * `nlmeans` da mejor denoise pero tarda mas de 2 min para 8 s: descartado para produccion.
 */
export const NIVELES_LIMPIEZA = {
  suave:  { hqdn3d: "2:1.5:4:4",   cas: 0.3, unsharp: "5:5:0.4:5:5:0.0" },
  normal: { hqdn3d: "3:3:6:6",     cas: 0.4, unsharp: "5:5:0.6:5:5:0.0" },
  fuerte: { hqdn3d: "5:4:9:9",     cas: 0.6, unsharp: "5:5:0.9:5:5:0.0" },
};

export function filtroDeLimpieza(nivel) {
  if (!nivel || nivel === "no") return "";
  const n = NIVELES_LIMPIEZA[nivel];
  if (!n) {
    throw new Error(
      `El nivel de limpieza "${nivel}" no existe. Validos: ${Object.keys(NIVELES_LIMPIEZA).join(", ")}.`
    );
  }
  return [`hqdn3d=${n.hqdn3d}`, `cas=strength=${n.cas}`, `unsharp=${n.unsharp}`].join(",");
}

const correr = (args) =>
  new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args);
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => reject(new Error(`No pude ejecutar ffmpeg: ${e.message}`)));
    p.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg fallo (${c}):\n${err.slice(-1500)}`))));
  });

/** Estabilizacion vidstab en 2 pasadas. Corre ANTES de compose: necesita analizar el archivo entero. */
export async function estabilizar({ entrada, salida, suavizado = 30 }) {
  const trf = path.join(path.dirname(salida), `.vidstab-${Date.now()}.trf`);
  try {
    await correr(["-y", "-v", "error", "-i", entrada,
      "-vf", `vidstabdetect=shakiness=5:accuracy=15:result=${trf}`, "-f", "null", "-"]);
    await correr(["-y", "-v", "error", "-i", entrada,
      "-vf", `vidstabtransform=input=${trf}:smoothing=${suavizado}:zoom=1,unsharp=5:5:0.5`,
      "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", "-c:a", "copy", salida]);
    return { salida };
  } finally {
    fs.rmSync(trf, { force: true });
  }
}
```

- [ ] **Step 4: Enchufar en `studio.mjs`**

`--limpiar=suave|normal|fuerte` agrega `filtroDeLimpieza()` a la cadena base de `compose`
(justo después del formato, antes del color). `--estabilizar` corre `estabilizar()` sobre la entrada
antes de todo lo demás y usa su salida. Sumar al reporte final: `Limpieza: normal. Estabilizacion: si.`

- [ ] **Step 5: Correr y verificar que pasan**

```bash
cd ".claude/skills/vakdor-video/engine" && node --test tests/enhance.test.mjs
```

Esperado: `pass 5`, `fail 0`.

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/vakdor-video/engine/lib/enhance.mjs \
        .claude/skills/vakdor-video/engine/tests/enhance.test.mjs \
        .claude/skills/vakdor-video/engine/studio.mjs
git commit -m "feat(studio): enhance.mjs con limpieza medida por VMAF (+6 puntos) y estabilizacion"
```

---

### Task 11: `drift` y `dolly` — flotación de cámara en mano y acercamiento continuo

**Files:**
- Modify: `.claude/skills/vakdor-video/engine/lib/camera.mjs` (agregar 2 funciones)
- Modify: `.claude/skills/vakdor-video/engine/tests/camera.test.mjs` (agregar pruebas)
- Modify: `.claude/skills/vakdor-video/engine/lib/compose.mjs` (reconocer `drift` y `dolly`)

**Interfaces:**
- Produces: `filtroDrift({ ancho, alto, intensidad })` — `intensidad` 0 a 1, default 0.5.
- Produces: `filtroDolly({ pct, duracionSec, fps, ancho, alto, direccion })` — `direccion` `"in"` o `"out"`.

- [ ] **Step 1: Agregar las pruebas que fallan**

Agregar al final de `tests/camera.test.mjs`:

```js
import { filtroDrift, filtroDolly } from "../lib/camera.mjs";

test("drift es determinista: mismo input, mismo filtro", () => {
  const a = filtroDrift({ ancho: 1920, alto: 1080, intensidad: 0.5 });
  const b = filtroDrift({ ancho: 1920, alto: 1080, intensidad: 0.5 });
  assert.equal(a, b, "el drift no puede usar azar: el render tiene que ser repetible");
  assert.ok(!a.includes("random"), "nada de aleatoriedad");
});

test("drift y dolly pasan por ffmpeg sin cambiar dimensiones", () => {
  aplicar(filtroDrift({ ancho: 1920, alto: 1080, intensidad: 0.5 }), "drift");
  aplicar(filtroDolly({ pct: 6, duracionSec: 2, fps: 30, ancho: 1920, alto: 1080, direccion: "out" }), "dolly");
});

test("mas intensidad = mas desplazamiento", () => {
  const suave = filtroDrift({ ancho: 1920, alto: 1080, intensidad: 0.2 });
  const fuerte = filtroDrift({ ancho: 1920, alto: 1080, intensidad: 1 });
  const num = (s) => Number(s.match(/\+([0-9.]+)\*sin/)[1]);
  assert.ok(num(fuerte) > num(suave));
});
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
cd ".claude/skills/vakdor-video/engine" && node --test tests/camera.test.mjs
```

Esperado: FALLA con `filtroDrift is not a function` (o error de import).

- [ ] **Step 3: Agregar las dos funciones a `lib/camera.mjs`**

```js
/**
 * Flotacion sutil tipo camara en mano. Tres senos de periodo distinto para que
 * no se note el ciclo. DETERMINISTA a proposito: nada de azar, si no el render
 * no seria repetible.
 */
export function filtroDrift({ ancho, alto, intensidad = 0.5 }) {
  const amp = Math.max(0, Math.min(1, intensidad));
  const ax = (18 * amp).toFixed(2), ax2 = (9 * amp).toFixed(2), ay = (12 * amp).toFixed(2);
  // Se agranda un 10% para tener margen donde flotar sin mostrar bordes negros.
  const W = Math.round((ancho * 1.1) / 2) * 2, H = Math.round((alto * 1.1) / 2) * 2;
  return [
    `scale=${W}:${H}:flags=bilinear`,
    `crop=${ancho}:${alto}:x='(iw-ow)/2+${ax}*sin(2*PI*n/210)+${ax2}*sin(2*PI*n/97)':y='(ih-oh)/2+${ay}*sin(2*PI*n/173)':exact=1`,
    "setsar=1",
  ].join(",");
}

/** Acercamiento o alejamiento continuo. Es el zoom, con nombre de cine. */
export function filtroDolly({ pct, duracionSec, fps, ancho, alto, direccion = "in", multiplicador }) {
  return filtroZoom({
    tipo: direccion === "out" ? "zoomOut" : "zoomIn",
    pct, duracionSec, fps, ancho, alto,
    multiplicador: multiplicador ?? MULTIPLICADOR_DEFAULT,
  });
}
```

- [ ] **Step 4: Reconocerlos en `compose.mjs`**

En `movimientoDe`, agregar antes del `throw`:

```js
if (c.fx === "drift") return filtroDrift({ ancho, alto, intensidad: c.intensidad ?? 0.5 });
if (c.fx === "dolly")
  return filtroDolly({ pct: c.pct ?? 6, duracionSec: c.dur ?? 4, direccion: c.direccion ?? "in", ...comun });
```

Y agregar `"dolly"` al set `MOVIMIENTOS_CON_DURACION`. `drift` no entra: no tiene sobre-muestreo caro.

- [ ] **Step 5: Correr y verificar que pasan**

```bash
cd ".claude/skills/vakdor-video/engine" && node --test tests/camera.test.mjs tests/compose.test.mjs
```

Esperado: `fail 0`.

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/vakdor-video/engine/lib/camera.mjs \
        .claude/skills/vakdor-video/engine/lib/compose.mjs \
        .claude/skills/vakdor-video/engine/tests/camera.test.mjs
git commit -m "feat(studio): drift (flotacion de camara en mano) y dolly"
```

---

### Task 12: Experimento — desenfoque de fondo con máscara fija (con criterio de corte)

**Esto es un experimento, no una promesa.** Separar figura de fondo frame a frame no es viable
(19 min = 34.200 frames). La hipótesis es que con cámara fija alcanza una máscara ovalada suave.
**Si no pasa el criterio, se descarta y se documenta por qué.** No se entrega algo que se vea mal.

**Files:**
- Create: `.claude/skills/vakdor-video/engine/lib/bokeh.mjs` (solo si pasa el criterio)
- Test: `.claude/skills/vakdor-video/engine/tests/bokeh.test.mjs`
- Modify: `docs/superpowers/specs/2026-08-11-vakdor-video-studio-hibrido-design.md` (anotar el resultado)

**Interfaces:**
- Produces: `filtroBokeh({ ancho, alto, centroX, centroY, radioX, radioY, fuerza }) -> string`.

- [ ] **Step 1: Construir el prototipo y mirarlo**

Técnica: se duplica el stream, una copia va desenfocada, y se mezclan con una máscara ovalada
suave generada con `geq` sobre una fuente `color`:

```bash
ffmpeg -y -i entrada.mp4 -filter_complex "\
[0:v]split=3[base][blur][mk];\
[blur]gblur=sigma=18[bg];\
[mk]geq=lum='255*(1-exp(-0.5*pow(hypot((X-W/2)/(W*0.22),(Y-H*0.55)/(H*0.42)),2)))':cb=128:cr=128,format=gray[mask];\
[bg][base][mask]maskedmerge[vout]" -map "[vout]" -frames:v 1 prueba.png
```

Extraer 3 frames del resultado (uno donde estés centrado, uno donde te muevas, uno donde gesticules)
y **mirarlos**. El criterio de corte es concreto:

- El borde entre vos y el fondo desenfocado **no puede tener halo visible**.
- Si movés la cabeza dentro del cuadro, **la oreja o el hombro no pueden quedar desenfocados**.

- [ ] **Step 2: Decidir**

Si pasa: escribir `lib/bokeh.mjs` con la función, sus pruebas de aceptación por ffmpeg (mismo patrón
que `grade.test.mjs`), y enchufarlo en `studio.mjs` como `--bokeh`.

Si no pasa: **no escribir el módulo.** Agregar al spec, en la tabla de decisiones descartadas, la
fila con el motivo y los frames que lo muestran. Commitear solo esa documentación.

- [ ] **Step 3: Commit (en cualquiera de los dos casos)**

```bash
# si paso
git commit -m "feat(studio): bokeh.mjs, desenfoque de fondo con mascara fija"
# si no paso
git commit -m "docs(studio): descarto el bokeh por mascara fija, con la evidencia"
```

---

## Cierre de la Fase 1

- [ ] **Verificación sobre el video real de Leonardo**

Correr sobre el VSL de 19 min (`Prisma - MK\video-demo-maestro\Video VSL - Vakdor_Prisma\`), primero
con `--check`, después con `--preview=300`, y recién ahí completo. Extraer frames del resultado y
**mirarlos** antes de dar nada por bueno. Anotar el tiempo real medido y reemplazar con él la
estimación de la §8 del spec.

- [ ] **Actualizar el spec con los números reales**

Reemplazar la estimación de 4–6 minutos por el tiempo medido.

- [ ] **Commit final de fase**

```bash
git commit -m "docs(studio): tiempos reales medidos en el VSL de 19 min"
```
