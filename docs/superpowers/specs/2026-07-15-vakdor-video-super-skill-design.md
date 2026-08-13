# Spec — `vakdor-video` como super skill de video (multi-formato + editor conversacional)

**Fecha:** 2026-07-15
**Rama:** `feat/marketing-pipeline` (o rama nueva `feat/vakdor-video-super-skill` desde main)
**Autor:** Claude + Leonardo

---

## 1. Objetivo

Convertir la skill `vakdor-video` en una **super skill de video** unificada, que cubra
todo el espectro de necesidades de video de Vakdor con un solo lugar de invocación:

1. Videos de marca desde datos (propiedad).
2. Edición rápida de crudos a video de marca.
3. **NUEVO:** edición conversacional profesional de *cualquier* video (el playbook de
   `video-use`), reemplazando ElevenLabs por **whisper.cpp** (gratis, offline, español).

Y que **todos** los modos sean **multi-formato** (vertical, horizontal, cuadrado), no solo
reel vertical — porque el uso real hoy es mayormente horizontal (LinkedIn/YouTube).

No se crea una skill nueva. Todo queda dentro de `vakdor-video`.

## 2. Decisiones tomadas (con Leonardo)

- **Una sola super skill** `vakdor-video`, no dos skills separadas.
- **Whisper en vez de ElevenLabs.** Se reusa el binario ya instalado en `C:\whisper-cpp`
  (`main.exe` + `ggml-medium.bin`), el mismo que ya usan los modos actuales. Cero API key,
  cero instalación nueva de ASR.
- **Multi-formato en A y B** (no solo el editor pro): vertical 9:16, horizontal 16:9,
  cuadrado 1:1 / 4:5.
- **Default de formato en A/B:** ninguno fijo → la skill **pregunta el formato siempre**
  antes de renderizar en modos A y B.
- **Salida del modo C:** carpeta `edit/` **junto al video fuente** (comportamiento nativo de
  video-use), no forzado a Prisma - MK. Los modos A y B siguen yendo a Prisma - MK.
- **Marca opcional en modo C:** logos/intro/outro/subtítulos-en-cobre se ponen solo si es
  contenido de marca; si es un VSL de cliente o material crudo, sale limpio.
- **TODO incluido y disponible (no lazy, no "futuro").** La skill trae empaquetado el motor
  Remotion **y** el motor video-use completo: todas las referencias, assets, configs,
  procedimientos y el paso a paso. Incluye las **4 vías de animación del modo C**
  (Remotion / Manim / HyperFrames / PIL+ffmpeg) documentadas y con su receta de setup lista.
  Leonardo **decide por video** si suma una animación o no — pero la capacidad tiene que estar
  presente y a un comando de distancia.
- **Instalación hoy:** `pillow` + `numpy` + `yt-dlp` + `manim` (Python), y pre-warm de
  HyperFrames vía `npx`. Remotion ya está en el motor. Los `node_modules` pesados de un slot
  de animación concreto (HyperFrames/Remotion-overlay) se materializan dentro del slot al
  crearlo (patrón correcto de video-use: un slot = una animación), pero la **receta exacta**
  queda en la skill, no se improvisa.

## 3. Entorno verificado (fuentes reales)

- `C:\whisper-cpp\main.exe` presente + `ggml-medium.bin` presente (whisper.cpp 1.5.5).
- `main.exe --help` confirma `-oj` (JSON), `-ojf` (JSON full con tokens), `-ml N` (max-len;
  `-ml 1` ≈ una palabra por segmento → **word-level verbatim**, cumple Regla Dura 8).
- Python 3.14.0, ffmpeg/ffprobe 8.1.1, node v24.12.0 disponibles.
- `yt-dlp` NO instalado (solo se necesita para el sub-feature de descargas de YouTube).
- Motor Remotion en `Prisma - MK\_motor-video\` (compos `PropertyReel`, `EditedReel`
  clavadas en 1080×1920 hoy).

## 4. Arquitectura

### Los 3 modos

| Modo | Qué hace | Formatos | Motor | Salida |
|---|---|---|---|---|
| **A — Video de Propiedad** | fotos + datos → video de marca | vertical / horizontal / cuadrado | Remotion | Prisma - MK |
| **B — Editor rápido de crudo** | crudo → video de marca (jump cuts + subs) | vertical / horizontal / cuadrado | Remotion | Prisma - MK |
| **C — Editor conversacional pro** | cualquier video: transcribe → tomas → corta → color → subs → overlays | cualquiera (detecta o especificás) | ffmpeg + whisper + Python | `edit/` junto al fuente |

### Estructura de archivos de la skill

```
.claude/skills/vakdor-video/
├── SKILL.md                      ← 3 modos; enruta a las referencias; multi-formato en A/B
├── install.md                    ← setup idempotente de TODO (whisper, python deps, yt-dlp,
│                                    manim, hyperframes, motor Remotion). Se corre 1 vez.
├── references/
│   ├── video-use.md              ← playbook completo del modo C (12 Reglas Duras, proceso
│   │                               ask→confirm→execute, cut craft, EDL, grade, subtítulos)
│   ├── animations.md             ← las 4 vías de animación del modo C (ver sección 4.4):
│   │                               cuándo usar cada una + receta de setup + brief de sub-agente
│   └── formats.md                ← tabla de formatos/plataformas y dimensiones (A/B/C)
├── helpers/                      ← scripts Python del modo C
│   ├── transcribe.py             ← whisper.cpp word-level, cacheado por archivo
│   ├── transcribe_batch.py       ← transcripción paralela (multi-take)
│   ├── pack_transcripts.py       ← transcripts/*.json → takes_packed.md
│   ├── timeline_view.py          ← filmstrip + waveform PNG (Pillow/numpy)
│   ├── render.py                 ← extract por-segmento → concat → overlays → subs AL FINAL
│   └── grade.py                  ← color grade por ffmpeg (presets + --filter)
├── skills/
│   └── manim-video/              ← sub-skill Manim vendida (docs + refs) para slots Manim
├── assets/                       ← brand.json + logos (ya existe), fuente única de marca
└── engine/                       ← motor Remotion de A/B (ya existe), se hace multi-formato
    ├── src/ (PropertyReel, EditedReel responsivos por `format`, Root.tsx)
    ├── render.mjs / edit.mjs (reciben --format)
    └── remotion.config.ts / brand.json / package.json
```

El motor de render Remotion se sigue **copiando** a `Prisma - MK\_motor-video\` como hoy
(regla de oro: la skill lee de PRISMA-SYSTEM, el render vive y escribe en Prisma - MK). El
modo C, en cambio, corre con ffmpeg + Python + whisper directamente y escribe en `edit/`
junto al fuente (no necesita Remotion salvo que un overlay sea un slot Remotion).

### Reemplazo ElevenLabs → Whisper (modo C)

`transcribe.py` (reemplaza al `transcribe.py` de Scribe del video-use original):

1. `ffprobe` valida el fuente.
2. `ffmpeg -i <src> -ar 16000 -ac 1 -y <tmp>.wav` (whisper.cpp quiere WAV 16k mono).
3. `C:\whisper-cpp\main.exe -m C:\whisper-cpp\ggml-medium.bin -l <lang> -ml 1 -oj -of <out>`
   → JSON con un segmento por palabra (`{offsets:{from,to}, text}`), word-level.
4. Se normaliza al formato que consume el resto de la skill: lista de palabras
   `{word, start, end}` en segundos, más agrupación en frases para `pack_transcripts.py`.
5. **Cache** en `edit/transcripts/<name>.json`. No re-transcribir si el fuente no cambió
   (Regla Dura 9). Clave de cache: ruta + mtime + tamaño del fuente.

`transcribe_batch.py`: worker pool (4) que corre `transcribe.py` sobre un directorio.

> Nota de idioma: default `es`. `main.exe -l auto` para autodetección si hace falta.

### Multi-formato en A y B (motor Remotion)

Hoy `PropertyReel`/`EditedReel` están fijos en 1080×1920. Se parametrizan por `format`:

- `--format=vertical` → 1080×1920 (9:16)
- `--format=horizontal` → 1920×1080 (16:9)
- `--format=cuadrado` → 1080×1080 (1:1) [y variante 1080×1350 4:5 opcional]

Enfoque Remotion: dimensiones dinámicas vía `calculateMetadata` (width/height por prop
`format`), y layout **responsivo** dentro de la composición:
- reencuadre de fotos (Ken Burns con `objectFit: cover` adaptado al aspecto),
- posición/escala de lower-thirds, logos, intro/outro según vertical/horizontal/cuadrado.

`render.mjs` (modo A) y `edit.mjs` (modo B) reciben `--format` y lo pasan como prop.
Si no se pasa `--format`, la skill **pregunta** (no asume) antes de renderizar.

### 4.4 Animaciones del modo C (las 4 vías, TODAS disponibles)

El modo C puede sumar overlays de animación. **Leonardo decide por video** si agrega una o
no, pero las 4 vías tienen que estar documentadas y listas (receta de setup en
`references/animations.md`). Ninguna es obligatoria; se elige el motor por slot.

| Vía | Para qué | Setup | Estado |
|---|---|---|---|
| **PIL + PNG + ffmpeg** | tarjetas simples: contadores, typewriter, barras, reveals | `pillow` (se instala hoy) | listo ya |
| **Remotion** | overlays con estado React / sistema de marca ya existente | motor Remotion ya instalado | listo ya |
| **HyperFrames** | motion HTML/CSS/GSAP, UI de producto, kinetic typography, WebM alpha | `npx --yes hyperframes …` (pre-warm hoy) | a un comando |
| **Manim** | diagramas formales, máquinas de estado, ecuaciones, morphs de grafo | sub-skill `manim-video` vendida + `manim` (pip) | listo ya |

- Cada animación = un slot en `edit/animations/slot_<id>/`, un sub-agente en paralelo
  (Regla Dura 10), un archivo de salida único.
- Los `node_modules` pesados de un slot HyperFrames/Remotion se crean **dentro del slot** al
  generarlo (no se vive con 3 frameworks instalados a la vez), pero la receta exacta y el
  brief del sub-agente están en la skill: cero improvisación.
- `references/animations.md` incluye: cuándo usar cada motor, paleta de marca por defecto
  (fondo `#0A0F1A`, acento cobre `#C07C41`), easings (cubic, nunca linear), sync del payoff
  a la palabra hablada, y el brief de sub-agente de 10 puntos.

### render.py (modo C) — cumple las Reglas Duras

- Extract **por-segmento** desde cada fuente (con grade + fades de 30ms aplicados ahí).
- Concat **lossless `-c copy`** de los segmentos.
- Overlays con `setpts=PTS-STARTPTS+T/TB` (shift al inicio de su ventana).
- Subtítulos quemados **AL FINAL** de la cadena (después de overlays).
- Dimensión de salida: la del EDL / lo que pida el usuario; default = aspecto del fuente.
- `--preview` (720p rápido) y `--build-subtitles` (genera master.srt con offsets de timeline).

## 5. Las 12 Reglas Duras (se respetan tal cual en modo C)

Subs al final · extract+concat lossless · fades 30ms en cada corte · overlays PTS-shift ·
SRT master con offsets de output-timeline · nunca cortar dentro de una palabra · padding
30–200ms en cada corte · ASR word-level verbatim (nunca SRT/frase) · cache de transcript
por fuente · sub-agentes paralelos para múltiples animaciones · confirmar estrategia antes
de ejecutar · todos los outputs de sesión en `edit/`.

## 6. Alcance — TODO incluido (nada "lazy", nada "futuro")

La skill trae empaquetado el motor completo, ambos motores, con todo lo necesario para
funcionar de punta a punta. **Dentro:**

- **SKILL.md** con los 3 modos + ruteo a las referencias.
- **`install.md`** idempotente que instala/verifica TODO: whisper (ya está), `pillow`,
  `numpy`, `yt-dlp`, `manim`, pre-warm de HyperFrames, y el motor Remotion.
- **`references/`**: `video-use.md` (playbook completo + 12 Reglas Duras), `animations.md`
  (las 4 vías de animación con setup), `formats.md` (formatos/plataformas/dimensiones).
- **`helpers/`**: los 6 scripts Python del modo C, con whisper en vez de ElevenLabs.
- **`skills/manim-video/`**: sub-skill Manim vendida (para slots Manim del modo C).
- **`assets/`**: brand.json + logos (fuente única de marca).
- **`engine/`**: motor Remotion de A/B, hecho **multi-formato** (vertical/horizontal/cuadrado).
- **Instalación hoy:** `pillow`, `numpy`, `yt-dlp`, `manim` (pip) + pre-warm HyperFrames (npx).

**Único diferido por diseño correcto (no por recorte):** los `node_modules` de un slot de
animación HyperFrames/Remotion concreto se materializan dentro de ese slot al crearlo — es el
patrón de video-use (un slot = una animación), no una funcionalidad ausente. La receta ya está.

**Se agrega si lo pedís:** variante exacta 4:5 (arranca con 1:1 para "cuadrado").

## 7. Verificación (cómo se prueba de verdad)

- **Whisper word-level:** correr `transcribe.py` sobre un video corto real y verificar que el
  JSON tiene palabras con `start/end` coherentes y en español.
- **Modo C end-to-end:** un video crudo → EDL de prueba → `render.py --preview` → abrir el
  MP4 y chequear cortes, fades sin pops, subtítulos visibles sobre overlays.
- **Multi-formato A/B:** render de un `PropertyReel` en `horizontal` y en `vertical`;
  verificar dimensiones con `ffprobe` y que el layout no quede roto.
- **Animaciones disponibles:** `install.md` deja `manim --version`, `yt-dlp --version` y
  `npx hyperframes --help` respondiendo OK; un slot PIL de prueba renderiza un PNG→mp4.
- Todo se prueba en local (Claude levanta lo necesario y entrega el resultado).

> **Modo operandi (memoria de Leonardo):** este trabajo vive en la rama propia
> `feat/vakdor-video-super-skill`, creada desde main actualizado, en un **worktree aislado**
> (`prisma-wt-vakdor-video`). No se commitea en la rama de otra terminal. Se prueba en local
> y se mergea a main **solo con OK explícito** de Leonardo. Al cerrar, actualizar la memoria
> del proyecto (skill vakdor-video ahora super skill).

## 8. Riesgos conocidos

- Whisper.cpp `-ml 1` a veces parte tokens sub-palabra; se agrupan por espacios al normalizar.
- Layout responsivo de Remotion: horizontal/cuadrado necesitan recolocar lower-thirds; hay
  que probar visualmente cada formato (no basta con cambiar width/height).
- Python 3.14 es muy nuevo: verificar que las wheels de Pillow/numpy instalan sin compilar.
