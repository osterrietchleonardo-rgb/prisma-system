---
name: vakdor-video
description: Super skill de video de Vakdor — crea y EDITA videos en cualquier formato (vertical, horizontal/LinkedIn/YouTube, cuadrado). Cuatro modos: (A) Reel/Video de Propiedad desde fotos+datos con Remotion; (B) Editor rápido de un crudo a video de marca (saca silencios, subtítulos, marca); (C) Editor conversacional PRO de CUALQUIER video (VSL, testimonio, ad, tutorial): transcribe con whisper.cpp local (gratis), elige tomas, corta, color grade, subtítulos y overlays de animación (PIL/Remotion/HyperFrames/Manim); (D) VIDEO STUDIO (`studio.mjs`, un solo comando): movimiento de cámara real sobre video hablado — zoom lento medido, dolly, drift tipo cámara en mano, jump cut de escala, whip pan — más color, limpieza de imagen medida con VMAF, estabilización, 4 formatos con zonas seguras, y efectos anclados a UNA PALABRA HABLADA vía receta.json; con `--check` gratis e instantáneo y `--preview` para juzgar un efecto sin renderizar todo. Incluye producción completa: TAPAR datos privados con blur (teléfonos, chats, precios, correos, tokens en pantalla), medir el encuadre y las danger zones de TikTok/Reels antes de poner gráficos, mezcla de música y efectos MEDIDA en LUFS con sidechain sobre la voz, y export a la spec de redes (bitrate capeado, bt709, faststart, -14 LUFS). Usar SIEMPRE que pidan un reel, video de propiedad, video para IG/TikTok/LinkedIn/YouTube, "editá este video", "sacá los silencios", "ponele subtítulos", "editá mi VSL", "video horizontal", transcribir, color/grade, "tapá los datos", "censurá", "difuminá", "ponele música", "mezclá el audio", "por qué se ve mal en Instagram", "no se lee el subtítulo", "ponele zoom", "movimiento de cámara", "que no se vea estático", "acercamiento lento", "cambio de plano", "que aparezca algo cuando digo tal palabra", "pasalo a vertical", "limpiá la imagen", "se ve pixelado", "estabilizá". Hermana en video de vakdor-carousel: misma marca (brand.json), copy delegado a vakdor-copywriter.
---

# Vakdor Video — Super Skill de Video

Tres modos, todos **multi-formato** (vertical 9:16 · horizontal 16:9 · cuadrado 1:1).

| Modo | Qué hace | Motor | Salida |
|---|---|---|---|
| **A — Video de Propiedad** | fotos + datos → video de marca | Remotion | `Prisma - MK` |
| **B — Editor rápido de crudo** | crudo → video de marca (jump cuts + subs + marca) | Remotion | `Prisma - MK` |
| **C — Editor conversacional PRO** | *cualquier* video: transcribe → tomas → corta → color → subs → overlays | ffmpeg + whisper.cpp + Python | `edit/` junto al fuente |

- **Modos A y B** = video **de marca** (Remotion). Salida SIEMPRE a `Prisma - MK` (regla de oro).
- **Modo C** = editor **general** (VSL, ad, testimonio, tutorial, con o sin marca). Salida en
  `edit/` **junto al video fuente**. Motor propio (ffmpeg + Python + whisper.cpp), gratis y offline.

> 📦 **Setup (una vez):** ver `install.md` (whisper ya instalado, `pip install -r requirements.txt`,
> y las 4 vías de animación del Modo C). Motor Remotion en `Prisma - MK\_motor-video\` (Paso 0).
> 📜 **Licencia Remotion:** gratis hasta 3 personas (caso de Leonardo). 4+ requiere licencia.

---

## ⛔ Regla de Oro de Salida

Esta skill se INVOCA desde `PRISMA-SYSTEM` pero **NUNCA** escribe dentro de `PRISMA-SYSTEM`
(solo LEE: logos, `.env`, datos). Modos A/B escriben en `Prisma - MK`. Modo C escribe en la
carpeta `edit/` junto al video que te den.

---

## MODO D — Video Studio (`studio.mjs`) ⭐ el más nuevo

**Para editar un video grabado a cámara** (VSL, testimonio, pitch) con movimiento de cámara, color
y limpieza de imagen. Un solo comando reemplaza los cuatro que había que correr en orden.

```bash
# parado en .claude/skills/vakdor-video/engine
node studio.mjs --in=crudo.mp4 --out=final.mp4 --receta=receta.json
```

**Antes de renderizar nada, usar siempre estos dos:**

| Flag | Para qué |
|---|---|
| `--check` | Valida la receta y arma el grafo **sin renderizar**. Un segundo en vez de veinte minutos para encontrar un error de tipeo. **No gasta ni un peso de API.** |
| `--preview=125` | Renderiza 20 segundos alrededor del segundo 125. Para juzgar un efecto sin esperar el video entero. La primera vez corta y transcribe; después reusa el caché. |

**El resto de los flags:** `--formato=16:9\|9:16\|1:1\|4:5` · `--calidad=auto\|max\|rapido` ·
`--limpiar=suave\|normal\|fuerte` · `--estabilizar` · `--sin-corte` · `--srt=archivo.srt` ·
`--rehacer` (ignora el caché) · `--encoder=...`

### La receta

Un `receta.json` describe todo el video. Lo escribe Claude leyendo la transcripción y lo corrige
Leonardo. Lo distintivo: un efecto se ancla a **una palabra hablada**, no solo a un segundo.

```json
{
  "formato": "16:9",
  "estilo": "autoridad",
  "grade": { "preset": "cinematic" },
  "camara": [
    { "t": 0, "dur": 45, "fx": "zoomIn", "pct": 8 },
    { "palabra": "control", "fx": "jumpCutClose", "escala": 1.18 },
    { "t": 95, "dur": 20, "fx": "drift", "intensidad": 0.5 }
  ]
}
```

`camara[].fx`: `zoomIn` · `zoomOut` · `dolly` · `push` · `drift` · `jumpCutClose` · `jumpCutWide` ·
`whipPan`. Los tiempos son del video **ya cortado**, nunca del crudo.

### Portada y cierre: el gotcha del audio

Al pegar portada + cuerpo + cierre con `concat`, **las tres partes tienen que tener
el MISMO layout de audio**. Si el video se grabó en mono y las portadas se generan
en estéreo (que es el default de `anullsrc`), `concat` mezcla formatos incompatibles
y el tramo final **suena a ruido en vez de a silencio**. No da error: sale un mp4
perfecto que hace un ruido raro al final.

Se detecta midiendo, no escuchando: `volumedetect` sobre los últimos segundos tiene
que dar −91 dB. Si da −3 dB, es esto.

La forma correcta es leer el layout del cuerpo y generar las portadas igual:

```bash
CH=$(ffprobe -v error -select_streams a:0 -show_entries stream=channels -of csv=p=0 cuerpo.mp4)
LAYOUT=$([ "$CH" = "1" ] && echo mono || echo stereo)
ffmpeg ... -f lavfi -i "anullsrc=r=48000:cl=$LAYOUT" ... -ac $CH ...
```

### Dónde va cada cosa en el cuadro (9:16)

| | Altura | Por qué |
|---|---|---|
| Visualización / panel | hasta 740 px | sobre la pared, arriba de la cabeza |
| Subtítulo | ~1585 px | debajo de la cara, sin meterse en el último 12% |
| Subtítulo con panel activo | ~1790 px | el video baja, la altura de siempre le cae en la cara |

El último 12% del cuadro es donde Instagram y TikTok ponen el texto del posteo y
los botones: lo que quede ahí, no se lee.

### Reglas que no se negocian

- **`--check` primero, siempre.** Es gratis e instantáneo.
- **Nada falla en silencio.** Si un tramo del corte falla, el reporte lo grita y ese corte **no se
  cachea**, para que el aviso no desaparezca en la corrida siguiente.
- **La transcripción cuesta plata.** Se cachea por archivo + fecha + parámetros de corte. `--rehacer`
  solo si de verdad hace falta.
- **Los 9 presets de color son los mismos que en Remotion**, así que un mismo look se ve igual venga
  del motor que venga.

Diseño completo y mediciones en `docs/superpowers/specs/2026-08-11-vakdor-video-studio-hibrido-design.md`.
Ahí está por qué el zoom usa sobre-muestreo 3× y por qué el bokeh se descartó.

---

## Multi-formato (los 3 modos)

Formatos: `vertical` (1080×1920, TikTok/Reels), `horizontal` (1920×1080, LinkedIn/YouTube/blog),
`cuadrado` (1080×1080, feed IG). Detalle y plataformas en `references/formats.md`.

- **Modos A/B:** se elige con `--format=vertical|horizontal|cuadrado`. **Si no se especifica,
  PREGUNTAR** antes de renderizar (no asumir). El layout se adapta solo.
- **Modo C:** agnóstico; default = conservar el aspecto del fuente; reframe si se pide otro.

---

## MODO A — Video de Propiedad (`PropertyReel`)

Reel/video de marca desde **fotos + datos** de una propiedad. Campos (props.json):
`operation, title, location, price, specs[], photos[], cta, contact, secondsPerPhoto, format`.
El `cta` y todo texto persuasivo los define **vakdor-copywriter** (esta skill NO inventa copy).
Los datos duros (precio, ambientes, zona) son de la propiedad.

**Render** (parado en `Prisma - MK\_motor-video`):
```
node render.mjs --props="<props.json>" --out="<activo>\video.mp4" --format=horizontal
```
Duración automática: 2s intro + (Nº fotos × secondsPerPhoto) + 2.5s outro.

## MODO B — Editor rápido de crudo (`EditedReel`)

Toma un video crudo (recorrida, testimonio, pitch) y lo deja de marca: saca silencios
(ffmpeg silencedetect → jump cuts), subtítulos (whisper local o `.srt`), marca de agua + intro/outro.

```
node edit.mjs --video="<crudo.mp4>" --out="<activo>\final.mp4" --format=horizontal --subtitles
```
Opciones: `--captions=x.srt` · `--silence-db=-30` `--min-silence=0.6` `--pad=0.06` ·
`--no-intro --no-outro --no-watermark --no-subtitles` · `--title` `--contact` · `--lang=es`.

> Modos A/B: si el motor no existe, hacer el Paso 0 (copiar `engine\` → `_motor-video\`, `npm install`).

---

## MODO C — Editor conversacional PRO (cualquier video)

El motor "video-use" con **whisper.cpp** (gratis, offline, español) en vez de ElevenLabs.
Agnóstico de formato, marca opcional, salida en `edit/` junto al fuente. Para VSLs, ads,
testimonios, tutoriales, material de cliente — vertical u horizontal.

> **Antes de arrancar el Modo C, leé `references/video-use.md`** (playbook completo + las 16
> Reglas Duras de correctitud) y **`references/produccion.md`** (el criterio: dónde puede ir un
> gráfico, qué se tapa, cómo se mide el audio, con qué se exporta).
> Animaciones en `references/animations.md`. Formatos en `references/formats.md`.

**Regla de oro del Modo C:** preguntar → confirmar la estrategia en español → recién ahí editar.
Nunca tocar el corte sin OK.

**Flujo mínimo** (helpers en `helpers/`, `<edit>` = carpeta `edit/` junto al fuente):
1. `prep.py <video>` — ficha, pistas de OBS, y si el take ya viene editado (*overlay-only*).
2. `frame_map.py <video>` — cortes de plano, tira de contactos y **regla con danger zones**.
   Se mide el encuadre ANTES de decidir dónde va un gráfico.
3. `transcribe_batch.py <dir> --edit-dir <edit>` — transcribe (word-level, cacheado).
4. `pack_transcripts.py --edit-dir <edit>` — arma `takes_packed.md` (frases por silencios reales).
5. **Conversar + proponer estrategia + esperar OK.**
6. Armar `edit/edl.json` (cortes, **máscaras**, grade, overlays, subtítulos, **audio**).
   Formato en `references/video-use.md`.
7. `render.py <edl.json> -o <edit>/preview.mp4 --preview --build-subtitles --edit-dir <edit>`.
8. Auto-eval sobre la salida (cortes, pops, subtítulos, fugas de privacidad) → arreglar → re-render.
9. Render final: `render.py ... -o final.mp4` (perfil `social` por defecto: capea el bitrate,
   etiqueta bt709 y deja `+faststart`).

**Reglas Duras críticas** (las 16 en `references/video-use.md`, ya implementadas en `render.py`):
subtítulos AL FINAL · extract por-segmento → concat lossless · fades 30ms · overlays PTS-shift ·
nunca cortar dentro de una palabra · **máscaras antes de los overlays** · **nada informativo en
la danger zone** · **el cap de bitrate una sola vez** · **la mezcla se mide** · cache de
transcript por fuente · **confirmar estrategia antes de ejecutar**.

**Privacidad y audio (opcionales, van en el EDL):**
```
"masks": [{"from": 18.4, "to": 21.8, "rects": [[250,300,600,470]], "rects_end": [[250,300,830,600]]}]
"audio": {"bgm": ["cama.wav"], "duck_lu": 12, "sfx": [{"file": "whoosh.wav", "at": 18.6, "rel_db": -9}]}
```
Verificar la privacidad SIEMPRE sobre el archivo final:
`privacy.py <final.mp4> --masks edl.json --verify <edit>/verify/`

**Animaciones (opcionales, vos decidís por video):** 4 vías disponibles — PIL, Remotion,
HyperFrames, Manim (ver `references/animations.md` y `references/manim.md`). Cada una = un slot en
`edit/animations/slot_<id>/`; múltiples animaciones = sub-agentes en paralelo.

---

## Copy y marca

- **Copy** (ganchos, CTA, textos persuasivos): siempre **vakdor-copywriter**. Esta skill no inventa copy.
- **Marca:** `assets/brand.json` (fondo `#0A0F1A`, título `#FFFFFF`, texto `#B4BAC5`, acento cobre
  `#C07C41`, fuente Inter). Fuente única; si cambia el color/logo, editar ahí (y recopiar al motor).

## Estructura de la skill

```
SKILL.md · install.md · requirements.txt
references/  video-use.md (correctitud) · produccion.md (criterio) ·
             animations.md · formats.md · manim.md
helpers/     ── material ──   prep · frame_map
             ── voz ──        whisper_parse · transcribe · transcribe_batch · pack_transcripts ·
                              silences · subtitles
             ── imagen ──     privacy · grade · timeline_view
             ── armado ──     edl · render · export
             ── audio ──      mix_audio
tests/       test_whisper_parse · test_edl · test_render_helpers · test_produccion
assets/      brand.json (+ logos)
engine/      motor Remotion de A/B (multi-formato: format.ts + PropertyReel/EditedReel responsivos)
```

## Composiciones Remotion (`engine/`)

- **`PropertyReel`** — Modo A. Prop `format`; dimensiones vía `calculateMetadata`; layout escalado por `unit()`.
- **`EditedReel`** — Modo B. Ídem `format`; subtítulos con posición relativa al alto.
- `render.mjs` / `edit.mjs` reciben `--format`. `format.ts` centraliza dimensiones y el factor de escala.
