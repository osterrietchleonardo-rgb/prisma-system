# Modo C — Editor conversacional pro (playbook)

Editá **cualquier** video por conversación: transcribir → elegir tomas → cortar → color →
subtítulos → overlays. Sin presets rígidos, sin menús. Preguntá, confirmá el plan, ejecutá,
iterá, persistí. Las reglas de correctitud son duras; el resto es libertad artística.

Motor: **whisper.cpp** (gratis, offline, español) + **ffmpeg** + **Python** (los helpers de
`helpers/`). NO usa ElevenLabs. NO necesita API keys.

---

## Principios

1. **El audio manda, el video sigue.** Los candidatos a corte salen de límites de palabra
   (whisper word-level) y de silencios reales (`silences.py` = ffmpeg silencedetect). whisper
   con `-ojf` da timestamps casi contiguos, así que las **pausas para cortar salen de
   `silences.py`, no del ASR**.
2. **Razonar desde el transcript + visual on-demand.** El único artefacto derivado que vale es
   `takes_packed.md` (frases con su rango de tiempo). Todo lo demás (muletillas, retomas,
   énfasis) se decide en el momento leyendo el transcript, y se mira el video solo en los
   puntos de decisión con `timeline_view.py`.
3. **Preguntar → confirmar → ejecutar → iterar → persistir.** Nunca tocar el corte hasta que el
   usuario confirmó la estrategia en español claro.
4. **Generalizar.** No asumir qué tipo de video es (VSL, testimonio, tutorial, reel, ad…).
   Mirar el material, preguntar, y recién editar.
5. **Libertad artística por default.** Cada valor concreto acá (preset, fuente, duración) es un
   ejemplo, no un mandato. Lo único obligatorio son las **Reglas Duras**.
6. **Verificar tu propio output antes de mostrarlo.** Si no lo publicarías, no lo muestres.

---

## Reglas Duras (correctitud de producción — NO negociables)

1. **Los subtítulos se aplican AL FINAL** de la cadena de filtros, después de todo overlay.
   Si no, los overlays tapan los subtítulos (falla silenciosa). → `render.py` ya lo hace.
2. **Extract por-segmento → concat lossless `-c copy`**, no un solo filtergraph. Si no,
   re-encodeás cada segmento dos veces al sumar overlays. → `render.py`.
3. **Fades de audio de 30 ms en cada borde de segmento** (`afade`). Si no, hay "pops"
   audibles en cada corte. → `render.py` (`FADE=0.03`).
4. **Overlays con `setpts=PTS-STARTPTS+T/TB`** para llevar el frame 0 del overlay al inicio de
   su ventana. Si no, ves la mitad de la animación. → `render.py`.
5. **El SRT master usa offsets de la timeline de SALIDA**: `t_salida = word.start −
   range.start + offset_del_range`. → `edl.master_srt_offsets`.
6. **Nunca cortar dentro de una palabra.** Cada borde de corte se pega a un límite de palabra
   del transcript.
7. **Padding en cada borde de corte.** Ventana de trabajo 30–200 ms (más ajustado para ritmo
   rápido, más holgado para cine). Los timestamps de whisper driftean 50–100 ms; el padding
   lo absorbe.
8. **ASR word-level verbatim.** Nunca SRT/modo frase (perdés los gaps sub-segundo). Nunca
   fillers normalizados. → whisper.cpp `-ojf` + `parse_whisper_tokens`.
9. **Cachear transcripts por fuente.** No re-transcribir salvo que cambie el archivo fuente.
   → `transcribe.py` (cache versionado por mtime+size+parser_version).
10. **Sub-agentes en paralelo para múltiples animaciones.** Nunca secuencial. Ver `animations.md`.
11. **Confirmación de estrategia antes de ejecutar.** Nunca tocar el corte sin OK del usuario.
12. **Todo output de sesión va en `<carpeta-del-fuente>/edit/`.** Nunca dentro de la skill.
13. **Las máscaras de privacidad van ANTES de los overlays** (se tapa la fuente, nunca los
    gráficos que ponemos nosotros) y **DESPUÉS del concat**. → `render.py`.
14. **Se mide el encuadre antes de poner nada encima**, y nada informativo entra en la danger
    zone de la plataforma. → `frame_map.py`, `caption_margin_v()`.
15. **El cap de bitrate se aplica UNA sola vez**, en el archivo final. Los pasos intermedios van
    en calidad alta: capear en cada paso suma una generación de compresión por paso.
    Y el color se etiqueta con `-x264-params`, no solo con `-color_primaries` (ver
    `produccion.md` §7). → `export.py`.
16. **La mezcla se mide, nunca se pone un volumen fijo**, y `loudnorm` va al FINAL, sobre una
    mezcla que ya está bien. → `mix_audio.py`.

> Las reglas de **qué** poner y dónde (la regla de oro de los gráficos, la estructura de
> retención, las marcas mal transcritas, lo que no se hace) están en **`produccion.md`**.
> Estas doce y cuatro son de correctitud; ésas son de criterio. Las dos se leen.

---

## Layout de la carpeta `edit/`

```
<carpeta del video fuente>/
├── <fuentes, intactas>
└── edit/
    ├── project.md               ← memoria; se agrega por sesión
    ├── takes_packed.md          ← transcript phrase-level (vista de lectura)
    ├── edl.json                 ← cortes + máscaras + overlays + audio
    ├── transcripts/<name>.json  ← whisper word-level cacheado (+ silences)
    ├── mapa/                    ← tira de contactos y regla (frame_map.py)
    ├── audio/                   ← camas y efectos de la mezcla
    ├── animations/slot_<id>/    ← una animación por slot
    ├── verify/                  ← frames/timelines de debug + recortes de máscaras
    ├── master.srt               ← subtítulos en timeline de salida
    ├── master.ass               ← lo que se quema (margen en px reales + cobre)
    ├── preview.mp4
    └── final.mp4
```

---

## Los helpers (uso exacto)

Todos se corren con `python "<skill>/helpers/<script>.py"`. `<edit>` = carpeta `edit/` junto al fuente.

- **`prep.py <video> [--transcript t.json] [--master OUT --use-sibling]`**
  Ficha del archivo, pistas duplicadas de OBS, micrófono limpio al lado, y si el take ya viene
  editado (*overlay-only*) o hay silencio real para sacar.
- **`frame_map.py <video> [--crop x,y,w,h --at <seg>]`**
  Cortes de plano, tira de contactos, regla con rejilla y danger zones, recorte en nativo.
- **`privacy.py <video> --masks <edl.json> [-o out] [--verify DIR] [--print-filter]`**
  Máscaras de blur. Con `--verify` sobre el archivo FINAL, saca recortes nativos de cada borde.
- **`mix_audio.py <video> -o out.mp4 --bgm cama.wav [--duck 12] [--sfx sfx.json]`**
  Mezcla medida con sidechain. El video se copia tal cual (no se recomprime).
- **`transcribe.py <video> --edit-dir <edit> [--lang es] [--model medium]`**
  whisper.cpp word-level, cacheado. Escribe `transcripts/<stem>.json` con `words`, `phrases`, `silences`.
- **`transcribe_batch.py <dir> --edit-dir <edit> [--workers 4]`** — transcribe todos los videos del dir.
- **`pack_transcripts.py --edit-dir <edit>`** — arma `takes_packed.md` (frases cortadas por silencios reales).
- **`silences.py <video> [--noise-db -30] [--min-dur 0.4]`** — lista de pausas (para decidir cortes/tensar).
- **`timeline_view.py <video> <start> <end> [-o out.png] [--frames 6]`** — filmstrip + waveform. En puntos de decisión, NO como scanner.
- **`grade.py --list-presets`** · **`grade.py <in> -o <out> --preset luxury`** — color grade.
- **`render.py <edl.json> -o <out.mp4> [--preview] [--build-subtitles] [--edit-dir <edit>]`** — compositor final (Reglas Duras).

---

## El proceso (8 pasos)

1. **Inventario.** `prep.py` cada fuente (ficha, pistas de OBS, micrófono hermano, y si hay que
   cortar o es *overlay-only*). `frame_map.py` para medir el encuadre y las danger zones ANTES de
   pensar dónde va un gráfico. `transcribe_batch.py`. `pack_transcripts.py`. Un par de
   `timeline_view` para primera impresión.
2. **Pre-scan de problemas.** Una pasada por `takes_packed.md` anotando slips, mis-speaks, frases
   a evitar, y **marcas mal transcritas** (van al diccionario, no a mano). En paralelo, una
   pasada por la tira de contactos anotando **todo dato privado visible**: teléfonos de clientes,
   chats, precios, correos, rutas, tokens.
3. **Conversar.** Describir en español claro lo que ves. Preguntar según el material: tipo de contenido, largo/aspecto objetivo, estética/marca, ritmo, momentos a preservar/cortar, subtítulos, animaciones, grade. Sin checklist fijo.
4. **Proponer estrategia** (4–8 frases): forma, tomas, dirección de corte, plan de animación, grade, estilo de subtítulos, largo estimado. **Esperar confirmación.**
5. **Ejecutar.** Armar `edl.json` (cortes, máscaras, grade, overlays, audio). Drill con
   `timeline_view` en momentos ambiguos; medir en nativo con `frame_map.py --crop` lo que haya
   que tapar. Animaciones en sub-agentes paralelos. Componer con `render.py`.
6. **Preview.** `render.py --preview`.
7. **Auto-eval (antes de mostrar).** `timeline_view` sobre la SALIDA en cada corte (±1.5s): discontinuidad/flash, pico de waveform (pop que pasó el fade), subtítulo tapado por overlay, overlay desalineado. Muestrear primeros 2s, últimos 2s, y 2–3 puntos medios. `ffprobe` de duración vs EDL. Si algo falla: arreglar → re-render → re-eval. Máximo 3 pasadas; si persiste, avisar al usuario.
   Además, sobre el archivo final:
   - `privacy.py <final> --masks edl.json --verify <edit>/verify/` y mirar el **borde** de cada
     recorte: si se lee texto nítido, la caja quedó chica.
   - que **ningún gráfico repita** lo que dice la voz en ese segundo (`produccion.md` §1).
   - que nada informativo caiga en la danger zone.
   - `ffprobe` de color: los cuatro campos en bt709/tv, y el bitrate por debajo del cap.
8. **Iterar + persistir.** Feedback en lenguaje natural, re-planear, re-render. Nunca re-transcribir. Render final con confirmación. Agregar sección a `project.md`.

---

## Cut craft

- **Audio-first.** Candidatos = límites de palabra + silencios (`silences.py`).
- **Preservar picos.** Remates, énfasis, momentos de autoridad. Extender un toque después del remate.
- **Handoffs / respiros.** 400–600 ms de aire entre frases fuertes (menos para ritmo rápido, más para cine).
- **Silencios ≥400 ms** son los cortes más limpios. 150–400 ms usables con chequeo visual. <150 ms inseguro (mitad de frase).
- **Padding** 30–200 ms en cada borde (Regla Dura 7). Ejemplo: 50 ms antes de la 1ª palabra, 80 ms después de la última.
- **Nunca razonar audio y video por separado.** Cada corte tiene que funcionar en ambos.

---

## Brief del sub-agente editor (selección multi-take)

Cuando la tarea es "elegí la mejor toma de cada beat entre muchos clips", despachá un sub-agente
con este molde (la estructura es lo que importa):

```
Estás editando un video <tipo>. Elegí la mejor toma de cada beat y ordenalos por beat
(no por orden de clip).
INPUTS: takes_packed.md · contexto en 2 frases · hablante(s) · estructura esperada (arquetipo o inventá) · slips a evitar · runtime objetivo.
REGLAS: start/end en límites de palabra · padding 30–200 ms · preferir silencios ≥400 ms como corte · slips inevitables se dejan si no hay mejor toma (anotalo en "reason") · si te pasás de largo, recortá y reportá.
OUTPUT (JSON, sin prosa): [{"source","start","end","beat","quote","reason"}]
Devolvé el EDL final + un chequeo de runtime total en una línea.
```

Arquetipos: VSL/venta (HOOK→PROBLEMA→MECANISMO→PRUEBA→OFERTA→CTA) · tutorial · entrevista ·
testimonio · documental · o inventá.

---

## Formato EDL (`edl.json`)

```json
{
  "version": 1,
  "sources": {"vsl": "C:/ruta/VSL.mp4"},
  "ranges": [
    {"source": "vsl", "start": 2.42, "end": 6.85, "beat": "HOOK", "quote": "...", "reason": "..."}
  ],
  "grade": "luxury",
  "masks": [
    {"from": 18.4, "to": 21.8,
     "rects": [[250, 300, 600, 470]], "rects_end": [[250, 300, 830, 600]],
     "note": "chat con el teléfono del cliente; la cámara deriva"},
    {"from": 21.8, "to": 22.5, "rects": "full", "note": "barrido"}
  ],
  "overlays": [
    {"file": "edit/animations/slot_1/render.mp4", "start_in_output": 0.0, "duration": 5.0}
  ],
  "subtitles": "edit/master.srt",
  "audio": {
    "bgm": ["edit/audio/cama_a.wav", "edit/audio/cama_b.wav"],
    "swap": 30.0, "duck_lu": 12,
    "sfx": [{"file": "edit/audio/whoosh.wav", "at": 18.6, "rel_db": -9}]
  }
}
```

- Las rutas relativas se resuelven **contra la carpeta del EDL**, no contra el cwd.
- `grade` = nombre de preset o filtro ffmpeg crudo.
- `masks` = privacidad. Los tiempos van en **tiempo de la FUENTE** (`source` es opcional si hay
  una sola); el corte las lleva solas a la salida. Si ya las mediste sobre el archivo cortado,
  poné `"timeline": "output"`. Detalle y los 4 errores caros en `produccion.md` §4.
- `overlays` = clips de animación, en tiempo de salida.
- `subtitles` opcional (si no está y pasás `--build-subtitles`, se arma desde los transcripts).
- `audio` = mezcla. Máximo 2 camas (la segunda marca el giro del video, y entonces `swap` es
  obligatorio). `duck_lu`: 8 presente, 12 normal, 15-16 discreta. `rel_db` de los efectos en
  `produccion.md` §6.

Banderas útiles de `render.py`: `--profile social|master|intermediate` (el final; `social` es el
que capea para redes), `--no-masks` y `--no-audio` para aislar un problema.

---

## Subtítulos

Tres dimensiones a decidir: **chunking** (1/2/3 palabras o frase), **caja** (MAYÚS/Título/Natural),
**posición** (margen inferior). El default de `render.py` es word-by-word (dinámico, social).
Para un VSL de autoridad/lujo suele leer mejor **frases cortas** (3–5 palabras) en caja natural.
Regla Dura: subtítulos AL FINAL (1) y offsets de timeline de salida (5).

Para chunking por frases en vez de palabra-por-palabra: agrupá los `words` del transcript en
cues de N palabras (o usá `phrases`) antes de escribir el SRT, o editá `master.srt` a mano.

---

## Color grade

`grade.py` trae presets: `none`, `neutral_punch`, `warm_cinematic`, `luxury` (premium: contraste
alto, sombras frías profundas, altas cálidas, nitidez). O pasá un filtro crudo con `--filter`.
Modelo mental ASC CDL: por canal `out = (in*slope + offset)**power`, luego saturación global.
Se aplica **por-segmento** en la extracción (nunca post-concat, que re-encodea doble).

---

## Memoria — `project.md`

Agregar una sección por sesión en `<edit>/project.md`:
```markdown
## Sesión N — YYYY-MM-DD
**Estrategia:** …
**Decisiones:** tomas, cortes, grade, animaciones + por qué
**Pendiente:** …
```
Al arrancar, leer `project.md` si existe y resumir la última sesión antes de preguntar si se continúa.

---

## Anti-patrones (fallan siempre)

- whisper en modo SRT/frase (perdés gaps). Siempre `-ojf` word-level.
- Quemar subtítulos antes de los overlays (los tapan). Subs al final.
- Un solo filtergraph con overlays (re-encodea doble). Extract → concat → overlays.
- Cortes duros de audio sin fade (pops). 30 ms siempre.
- Easing lineal en animaciones (robótico). Cubic.
- Re-transcribir fuentes cacheadas.
- Asumir qué tipo de video es. Mirar, preguntar, editar.
- Editar antes de confirmar la estrategia.
- Poner un gráfico antes de medir el encuadre (le tapás la cara a alguien).
- Tapar con caja negra en vez de blur (matás el movimiento, que es la demo).
- Ajustar la caja de blur exacta al texto (se lee en el filo por el borde).
- Perseguir con la caja un texto que se mueve (temblor + renglones al aire). Anclar y crecer.
- Verificar las máscaras con tiempos de la fuente sobre el archivo ya cortado.
- Poner la música a un volumen fijo, o normalizar la suma para "arreglarla".
- Exportar al máximo bitrate (la recompresión de la plataforma pega más fuerte).
- Capear el bitrate en pasos intermedios (una generación de compresión por paso).
- Dar por buena la etiqueta de color sin verla en `ffprobe`.
