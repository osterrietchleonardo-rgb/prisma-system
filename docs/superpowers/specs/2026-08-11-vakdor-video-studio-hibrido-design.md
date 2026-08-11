# Vakdor Video Studio — motor híbrido ffmpeg + Remotion

**Fecha:** 11 de agosto de 2026
**Rama:** `feat/vakdor-video-studio` (worktree `C:\Users\LENOVO\Desktop\CODE\prisma-wt-video-studio`)
**Estado:** diseño aprobado, pendiente de implementar

---

## 1. Qué problema resuelve

La skill `vakdor-video` hoy edita videos, pero el resultado se ve **plano**: corta silencios, quema
subtítulos, pone una marca de agua fija. Le falta todo lo que hace que un video se sienta profesional
y con autoridad — movimiento de cámara, gráficos que aparecen cuando decís algo importante, tipografía
que acompaña el ritmo del habla.

Agregar eso choca con una tensión real entre los dos motores disponibles:

| | Fuerte en | Débil en |
|---|---|---|
| **ffmpeg** | Velocidad. Acelerado por GPU. Mueve píxeles pesados sin esfuerzo | Diseño. Solo sabe hacer rectángulos y texto plano |
| **Remotion** | Diseño. Es React: cualquier animación es posible | Velocidad. Renderiza frame por frame con Chromium |

Renderizar un VSL de 19 minutos entero en Remotion tarda alrededor de una hora. Hacer los gráficos
con ffmpeg da un resultado pobre. **Este diseño usa los dos, cada uno donde gana.**

## 2. Principio de arquitectura

Toda decisión sale de una sola pregunta por efecto:

> ¿Este efecto **transforma** los píxeles que ya existen, o **agrega** píxeles nuevos encima?

- **Transforma** → ffmpeg. Es una operación de píxeles pura, va acelerada por GPU y entra en el
  encode que ya se hace igual. Costo adicional: prácticamente cero.
- **Agrega encima** → Remotion, renderizado como capa con **fondo transparente**, y **solo durante
  los segundos que el efecto ocupa**.

La consecuencia importante: Remotion nunca renderiza el video completo. Un VSL con 40 callouts
produce 40 clips de ~2 segundos, no 19 minutos de render. Después ffmpeg los estampa en el lugar
exacto con `overlay ... enable='between(t,inicio,fin)'`.

**Verificado en esta máquina antes de diseñar:**

- ffmpeg 8.1.1 full build con `h264_amf` y `hevc_amf` (GPU AMD), más `nvenc` y `qsv` de respaldo.
- Filtros presentes: `zoompan`, `crop`, `scale`, `overlay`, `xfade`, `gblur`, `vignette`, `eq`,
  `curves`, `colorchannelmixer`, `showwaves`, `concat`.
- Remotion 4.0.290 exporta con transparencia: `prores` perfil `4444` y pixel format `yuva420p`
  presentes en el renderer instalado.
- `@remotion/media-utils` exporta `getAudioData`, `visualizeAudio` y `createSmoothSvgPath`
  (habilita los efectos reactivos a la voz).

## 3. Flujo completo

```
crudo.mp4
   │
   ├─[1] cut.mjs        ffmpeg → corta silencios + normaliza audio a −14 LUFS
   │                             (existe hoy como cut-exact.mjs)
   ├─[2] transcribe.mjs Groq whisper-large-v3 → SRT + tiempo de cada palabra (~3 s)
   │                             (existe hoy como transcribe-groq.mjs)
   ├─[3] DIRECCIÓN      Claude lee la transcripción y escribe receta.json      ← NUEVO
   │                    Leonardo la revisa y corrige en castellano
   ├─[4] fx.mjs         Remotion → renderiza SOLO los efectos, con alfa,       ← NUEVO
   │                    en paralelo
   └─[5] compose.mjs    ffmpeg, UNA sola pasada con GPU:                       ← NUEVO
                        cámara + color + b-roll + overlays + subtítulos → final.mp4
```

**Dos encodes en total** — los mismos que hoy. El corte va a CRF 16 (visualmente sin pérdida) y todo
lo demás entra en la pasada final. Los overlays con alfa nunca se comprimen dos veces.

**Regla de tiempos (crítica):** todos los tiempos de la receta se refieren al video **ya cortado**,
no al crudo. Tiene que ser así porque sacar silencios corre todo hacia atrás. Por eso la
transcripción corre después del corte. Si cambia el umbral de silencio, la receta se regenera.

## 4. Estructura de archivos

Lo existente no se toca: `PropertyReel`, `EditedReel`, `Thumbnail` y los helpers de Python del
Modo C siguen funcionando igual.

```
.claude/skills/vakdor-video/
├── SKILL.md                    reescrito en Fase 3: unifica Modo C + Remotion + Studio
├── _SKILL-borrador-remotion.md temporal, se fusiona y se borra en Fase 3
│
└── engine/
    ├── studio.mjs              ★ único comando de entrada
    │
    ├── lib/                    ★ lado ffmpeg
    │   ├── probe.mjs             duración, fps, resolución, presencia de audio
    │   ├── recipe.mjs            carga y valida receta.json
    │   ├── cut.mjs               corte de silencios (desde cut-exact.mjs)
    │   ├── transcribe.mjs        Groq (desde transcribe-groq.mjs)
    │   ├── camera.mjs            zoom lento · jump cut de escala · whip pan · push
    │   ├── reframe.mjs           16:9 ↔ 9:16 ↔ 1:1 ↔ 4:5
    │   ├── grade.mjs             9 presets de color, espejo de ColorGrade.tsx
    │   ├── broll.mjs             clips locales y capturas de PRISMA con paneo lento
    │   ├── subs.mjs              SRT → ASS con karaoke (palabra por palabra)
    │   ├── fx.mjs                dispara los renders con alfa de Remotion, en paralelo
    │   ├── encoder.mjs           elige y prueba el encoder: AMF → NVENC → QSV → CPU
    │   └── compose.mjs           arma y ejecuta el grafo final
    │
    └── src/fx/                 ★ lado Remotion
        ├── FxRoot.tsx            contenedor transparente, dimensiones por formato
        ├── FxCallout.tsx
        ├── FxKineticText.tsx
        ├── FxAmbient.tsx
        ├── FxAudioBars.tsx
        ├── FxLowerThird.tsx
        ├── FxShape.tsx
        └── FxCaptions.tsx
```

Cada módulo de `lib/` **devuelve datos y no renderiza**. `camera.mjs` no ejecuta ffmpeg: devuelve el
fragmento de filtro que le corresponde. Eso es lo que permite que `compose.mjs` arme un único grafo
y haga un único encode. También hace que cada módulo se pueda probar solo.

## 5. La receta

Un `receta.json` por video. La escribe Claude leyendo la transcripción; Leonardo la corrige.

```json
{
  "formato": "16:9",
  "estilo": "autoridad",
  "calidad": "auto",

  "corte":       { "db": -30, "min": 0.6, "pad": 0.15 },
  "grade":       { "preset": "cinematic", "vignette": true },
  "subtitulos":  { "modo": "karaoke", "posicion": "inferior" },

  "camara": [
    { "t": 0,    "dur": 45, "fx": "zoomIn",       "pct": 8 },
    { "palabra": "control",  "fx": "jumpCutClose", "escala": 1.18 },
    { "t": 212,              "fx": "whipPan" }
  ],

  "fx": [
    { "palabra": "trazabilidad", "tipo": "callout", "texto": "Trazabilidad total", "pos": "der-medio" },
    { "t": 8, "dur": 3, "tipo": "kinetic",    "texto": "No es un bot" },
    { "t": 0, "dur": 6, "tipo": "lowerThird", "nombre": "Leonardo Osterrietch", "cargo": "Vakdor" }
  ],

  "broll": [
    { "t": 95, "dur": 7, "src": "broll/prisma-pipeline.mp4", "paneo": "lento-der" }
  ]
}
```

### Vocabulario de la receta

Valores admitidos, para que no haya interpretación libre:

| Campo | Valores |
|---|---|
| `formato` | `16:9` · `9:16` · `1:1` · `4:5` |
| `estilo` | `autoridad` (ritmo lento, letterbox, zooms de 8%, pocos efectos) · `dinamico` (ritmo rápido, cortes de escala frecuentes, kinetic text) · `demo` (pensado para producto: b-roll de pantalla, callouts sobre la UI) |
| `calidad` | `auto` (por duración) · `max` (x264 CRF 16) · `rapido` (GPU) |
| `camara[].fx` | `zoomIn` · `zoomOut` · `jumpCutClose` · `jumpCutWide` · `whipPan` · `push` |
| `fx[].tipo` | `callout` · `kinetic` · `ambient` · `audioBars` · `lowerThird` · `shape` · `marca` |
| `fx[].pos` | `izq-arriba` · `izq-medio` · `izq-abajo` · `der-arriba` · `der-medio` · `der-abajo` · `centro` |
| `subtitulos.modo` | `karaoke` (ASS, GPU) · `premium` (Remotion) · `simple` (SRT quemado) · `no` |
| `broll[].paneo` | `lento-der` · `lento-izq` · `lento-zoom` · `fijo` |

### Anclaje por palabra

Un efecto se puede ubicar de dos formas: `"t": 12.4` (segundo exacto) o `"palabra": "trazabilidad"`
(el frame exacto donde se pronuncia). Si la palabra se repite, `"ocurrencia": 2` elige cuál. Si se
regraba el video y la palabra cae en otro momento, el efecto se re-ancla solo.

**Verificado contra la API de Groq el 11-ago-2026, con voz real de Leonardo:** pidiendo
`timestamp_granularities[]=word` la respuesta trae cada palabra con su `start` y `end` propios (87
palabras en 25 segundos de audio). El anclaje es real, no interpolado.

**Gotcha que hay que corregir al portar:** el `transcribe-groq.mjs` de hoy **no** pide esa
granularidad — reparte los tiempos dividiendo el texto de cada segmento, así que sus tiempos por
palabra son estimados. Además, si se pide *solo* `word`, el campo `segments` vuelve `null` y se
pierden las líneas del SRT: hay que pedir `word` **y** `segment` juntas.

### Validación y errores

`recipe.mjs` valida antes de renderizar y habla en castellano. Reglas:

- Palabra no encontrada en la transcripción → **se saltea ese efecto, se avisa al final, el render
  sigue**. No se rompe todo por un callout.
- Tiempo fuera de la duración del video → mismo tratamiento.
- Efectos superpuestos en la misma posición de pantalla → aviso explícito, se respeta el orden de la
  receta.
- Archivo de b-roll inexistente → error duro antes de empezar (no tiene sentido renderizar 5 minutos
  para descubrirlo al final).

## 6. Catálogo de efectos

### Lado ffmpeg — transforman la imagen

| Efecto | Técnica |
|---|---|
| Zoom lento in/out | `zoompan` con **sobre-muestreo 3×** (`scale=5760:3240` antes). Ver la medición en §12 |
| Jump cut de escala | Crop fijo a 1.15×/1.25× durante ese tramo. Cambia el plano sin mover la cámara |
| Whip pan | 6–8 frames de desplazamiento acelerado + `gblur` direccional que sube y baja |
| Push | Escala 1.0 → 1.06 con easing en 8 frames |
| Color grading | Los 9 presets de `ColorGrade.tsx` traducidos a `eq` / `curves` / `colorbalance` / `vignette`. Mismo look en los dos motores |
| B-roll con paneo | Crop animado lento sobre clips locales y capturas de PRISMA. Entra por corte o por push |
| Letterbox cine | Barras 2.39:1, opcional, para el estilo "autoridad" |
| Reframe | 16:9 ↔ 9:16 ↔ 1:1 ↔ 4:5 |

### Lado Remotion — dibujan encima, con alfa

| Efecto | Técnica |
|---|---|
| Callout contextual | Pill cobre + línea desde el borde, spring `damping: 200` (entrada limpia, sin rebote) |
| Kinetic typography | `PerLetterReveal` / `WordByWord` existentes, con `slideUp`, Inter, blanco + un solo acento cobre |
| Mesh gradient ambiental | 4 radial-gradients animados + blur amplio + grano. Determinístico con `random(seed)` de Remotion: el render sale idéntico siempre |
| Barras audio-reactive | `getAudioData` + `visualizeAudio` + `createSmoothSvgPath` sobre el `.wav` extraído con ffmpeg |
| Motion graphics minimalistas | `@remotion/shapes` y `@remotion/paths`: líneas que se dibujan, grillas, círculos que respiran |
| Lower third | Placa corporativa (nombre, cargo, tema) |
| Subtítulos premium | Palabra por palabra estilo TikTok — solo videos cortos |
| Marca animada | Logo con entrada y salida, reemplaza la marca de agua fija |

### Sobre el fondo

Leonardo graba con fondo real (oficina/pared), sin croma. Remotion no separa figura de fondo, así que
**el fondo animado no va detrás suyo**. En su lugar:

- Con cámara: halo ambiental en los bordes del cuadro, callouts y gráficos por encima.
- Sin cámara (intro, outro, tarjetas de sección, detrás del b-roll): fondo ambiental completo.

Es lo que hace el 90% de los VSL profesionales con fondo real.

## 7. Formatos

Un solo parámetro, `--formato=16:9|9:16|1:1|4:5`, respetado por los dos motores: `FxRoot` obtiene
`width`/`height` vía `calculateMetadata`, `reframe.mjs` recorta la base.

Cada formato define su **zona segura**:

| Formato | Subtítulos | Callouts |
|---|---|---|
| 16:9 | Abajo, con margen para overlays | Tercios laterales |
| 9:16 | Al 62% de la altura, para que no los tape la UI de Instagram/TikTok | Nunca sobre el tercio central (la cara) |
| 1:1 y 4:5 | Abajo, margen ampliado | Laterales |

## 8. Calidad y velocidad

**Regla automática por duración**, forzable con `--calidad`:

| Duración | Modo | Subtítulos | Encode |
|---|---|---|---|
| < 90 s | premium | Remotion, palabra por palabra | x264 CRF 16 |
| ≥ 90 s | híbrido | Karaoke ASS (GPU) | AMF, alta calidad |

El karaoke ASS es el hallazgo que sostiene el modo híbrido: `libass` soporta etiquetas `\k`, o sea el
resaltado palabra por palabra en cobre **a velocidad de GPU**, sin pasar por Remotion.

**El encoder no se asume, se prueba.** `encoder.mjs` hace un encode de un frame con `h264_amf`; si
falla, prueba `nvenc`, después `qsv`, después CPU. Informa cuál quedó.

**Estimación** para el VSL de 19 min: hoy tarda ~2 min. Sumando ~40 efectos con alfa (1–2 min), el
total estimado es **4 a 6 minutos**. Es una estimación; se mide con el primer render real y se
reemplaza por el número medido.

## 9. Verificación

1. `--check` — valida la receta e imprime el grafo de ffmpeg sin renderizar. Un segundo.
2. `--preview=125` — renderiza 20 segundos alrededor del segundo 125, a 720p. ~10 segundos.
3. **Inspección visual de frames** — se extraen los frames exactos donde entra cada efecto y Claude
   los mira antes de declarar el trabajo terminado. Si un callout tapa la cara, se detecta acá.
4. **Clip patrón de 15 segundos** con los 16 efectos activos, en los 4 formatos. Se corre cada vez
   que se toca el motor; es la red de seguridad contra regresiones.
5. **Reporte final explícito**: efectos aplicados, efectos salteados y por qué, encoder usado,
   tiempo total. Nada falla en silencio.

## 10. Orden de construcción

Las tres fases se hacen; esto es solo la secuencia.

**Fase 1 — Esqueleto híbrido.** `studio.mjs`, `probe`, `recipe`, `encoder`, `camera`, `reframe`,
`grade`, `compose`, y la migración de `cut` y `transcribe` a `lib/`. Al terminar, un video se corta,
se le aplica movimiento de cámara y color, y sale en cualquier formato — sin efectos de Remotion
todavía.

**Fase 2 — Capa Remotion con alfa.** `FxRoot` y los 8 componentes, más `fx.mjs` que los renderiza en
paralelo y `compose.mjs` extendido para estamparlos.

**Fase 3 — Completar y documentar.** B-roll, subtítulos karaoke, presets de estilo, `SKILL.md`
reescrito unificando los tres documentos, borrado de `_SKILL-borrador-remotion.md`, y registro en
memoria.

## 11. Decisiones tomadas y descartadas

| Decisión | Por qué |
|---|---|
| Híbrido en vez de todo Remotion | Todo Remotion tarda ~1 hora en un VSL de 19 min |
| Híbrido en vez de todo ffmpeg | ffmpeg solo hace rectángulos y texto plano: no da el nivel de diseño pedido |
| `zoompan` con sobre-muestreo 3× en vez de `crop` animado | Medido, no supuesto: ver §12 |
| Efectos con alfa por tramo en vez de una capa continua | Una capa ProRes 4444 de 19 min ocuparía más de 100 GB |
| Receta editable en vez de automático puro | Permite corregir un efecto suelto sin volver a correr todo, y hace el resultado repetible |
| Karaoke ASS para videos largos | Da el efecto kinético a velocidad de GPU |
| No se toca `PropertyReel` / `EditedReel` / helpers Python | Funcionan hoy; el Studio se suma al costado |
| Sin croma / sin segmentación por IA | Leonardo graba con fondo real y Remotion no separa figura de fondo |

---

## 12. Medición del zoom lento (11-ago-2026)

El zoom lento es el efecto más usado, así que se midió en vez de suponer. Fuente: imagen fija de
1920×1080 con mucho detalle, zoom del 2% en 3 s (misma velocidad por frame que un zoom del 8% en
45 s, el caso real). Métrica: diferencia entre frames consecutivos. Si el zoom es parejo la
diferencia varía suave; si escalona, hay frames idénticos al anterior seguidos de saltos.

| Técnica | Coef. de variación | Frames sin cambio |
|---|---|---|
| `crop` con expresión de tiempo | **no funciona** — ffmpeg no evalúa `t` en el ancho/alto de `crop` | — |
| `scale eval=frame` (paso de 2 px) + crop | 1,96 | 48 de 89 |
| `scale eval=frame` (paso de 1 px) + crop | 2,02 | 35 de 89 |
| `zoompan` con sobre-muestreo 2× | 0,55 | 10 de 89 |
| **`zoompan` con sobre-muestreo 3×** | **0,32** | **0 de 89** |
| `zoompan` con sobre-muestreo 4× | 0,25 | 0 de 89 |

**Conclusión:** 3× es el punto justo. 4× solo mejora 0,07 y cuesta 36% más de tiempo.

### Costo real medido (clip de 20 s, encode con `h264_amf`)

| Sobre-muestreo | Velocidad | Un video de 19 min tardaría |
|---|---|---|
| 2× | 1,96× tiempo real | ~10 min |
| 3× | 0,76× tiempo real | ~25 min |

**Consecuencia de diseño (obligatoria):** el sobre-muestreo se aplica **solo a los tramos que
tienen zoom**, nunca a la línea de tiempo completa. Con un 30% del video con zoom, el costo baja a
unos 8 minutos. Además el multiplicador es un parámetro: default 3×, y baja a 2× automáticamente
cuando el total de tramos con zoom supera los 6 minutos.

Esto **corrige la estimación de la §8**: los 4–6 minutos valen para un video sin zoom o con zoom en
tramos cortos. Con zoom extendido hay que contar el costo de esta tabla.

### Descartado por no estar disponible

`scale_vulkan` habría permitido hacer el sobre-muestreo en la GPU. Se probó en esta máquina y el
dispositivo Vulkan no inicializa (`Error parsing global options`). `scale_cuda` y `scale_qsv`
existen en el build pero requieren GPU NVIDIA/Intel. Queda como mejora si cambia el hardware.
