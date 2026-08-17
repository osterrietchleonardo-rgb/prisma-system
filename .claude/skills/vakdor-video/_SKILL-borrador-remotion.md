---
name: vakdor-video
description: >
  EXPERTO TOTAL en Remotion (video por código con React) y edición/producción de video.
  Crear y EDITAR VIDEOS/reels con la identidad visual de Vakdor. Usar SIEMPRE que el usuario pida
  un reel, video de propiedad, video para redes (IG/TikTok), ficha en video, EDITAR un video crudo
  (sacar silencios, subtítulos, marca, recortes, transiciones) o cualquier pieza audiovisual de marca.
  Triggerea con "reel", "video", "editá este video", "sacá los silencios", "ponele subtítulos",
  "video de la propiedad", "para Instagram/TikTok", "slow-mo", "speed ramp", "transiciones",
  "música de fondo", "picture in picture", "color grading", "thumbnail", "portada", "batch render".
  Capacidades de experto: transiciones (slide/fade/wipe/flip/clockWipe), audio avanzado (música de
  fondo, ducking, SFX, fades), animaciones de texto (per-letter, typewriter, word-by-word, counter,
  gradiente), PiP (cara del broker sobre propiedad), speed ramping (slow-mo, fast-forward, ramp),
  color grading (cinematic/warm/cool/vintage/bw/moody/golden/teal-orange), thumbnails, batch rendering,
  multi-formato (vertical/horizontal/cuadrado), motion blur, SVG paths/shapes, delayRender patterns.
  Es la hermana en video de vakdor-carousel: misma marca (brand.json), mismo destino (Prisma - MK),
  copy delegado a vakdor-copywriter.
---

# Vakdor Video — Skill de Video con Remotion

Esta skill tiene **dos modos**, ambos exportan video vertical 1080x1920 con la marca Vakdor/PRISMA.
El motor es **Remotion** (video por código con React) + **ffmpeg** (análisis de audio).

- **Modo A — Reel de Propiedad** (`PropertyReel`): arma un reel desde **fotos + datos** de una propiedad.
- **Modo B — Editor de Video** (`EditedReel`): toma un **video CRUDO** del usuario y lo edita pro:
  saca silencios (jump cuts), pone subtítulos automáticos, marca de agua e intro/outro de marca.

La skill arma los datos y la marca; el render lo hace el motor.

> 📜 **Licencia Remotion:** gratis para uso comercial con equipos de **hasta 3 personas** (caso de Leonardo, 1 persona). Si el equipo crece a 4+, hay que pagar licencia (ver `https://www.remotion.dev/docs/license`).

---

## ⛔ Regla de Oro de Salida (INQUEBRANTABLE)

Esta skill se INVOCA desde `PRISMA-SYSTEM`, pero **NUNCA** escribe, crea ni renderiza nada
dentro de `PRISMA-SYSTEM`. Se permite **LEER** de PRISMA-SYSTEM (logos, `.env`, datos), nunca escribir.

TODO el output (motor, videos, props, `copy.md`, registro en memoria) va con ruta absoluta dentro de:
`C:\Users\LENOVO\Desktop\CODE\Antigravity - Apps\Prisma - MK`

- **Motor de render (una sola vez):** `Prisma - MK\_motor-video\`
- **Cada video (activo):** `Prisma - MK\Activos de Marketing\[Fecha Actual]\[nombre-del-reel]\`

---

## Paso 0 — Setup del motor (idempotente, una sola vez)

Antes de renderizar, verificar que exista `Prisma - MK\_motor-video\node_modules`.
Si NO existe (primera vez o motor borrado):

1. Copiar el contenido de `.claude\skills\vakdor-video\engine\` → `Prisma - MK\_motor-video\`.
2. Copiar los logos `logo-vakdor.png` y `logo-icon.png` desde `Prisma - MK\assets\`
   → `Prisma - MK\_motor-video\public\`.
3. Instalar: `npm install --no-audit --no-fund` parado en `Prisma - MK\_motor-video`.
   (La primera vez Remotion baja un Chromium Headless ~100 MB; es normal.)

Si el motor ya existe pero cambió la composición (editaste `engine\src\`), recopiar solo `src\`,
`render.mjs`, `remotion.config.ts` y `brand.json` (no hace falta reinstalar).

---

## Paso 1 — Cargar la marca

Leer `assets\brand.json` (FUENTE ÚNICA de la marca; idéntica a vakdor-carousel):
fondo `#0A0F1A`, título `#FFFFFF`, texto `#B4BAC5`, acento cobre `#C07C41`, fuente Inter.
El motor ya consume estos valores vía `engine\brand.json`. Si el usuario dice "cambiá los
colores/el logo", editar `assets\brand.json` (y recopiar al motor) — NO re-escanear PRISMA-SYSTEM.

---

## MODO A — Reel de Propiedad (`PropertyReel`)

### Paso 2 — Definir el contenido (mínimo de preguntas)

El video por defecto es un **Reel de Propiedad** (`PropertyReel`). Necesitás estos datos:

| Campo | Ejemplo | De dónde sale |
|---|---|---|
| `operation` | "En Venta" / "En Alquiler" | dato de la propiedad |
| `title` | "Departamento 3 ambientes" | dato de la propiedad |
| `location` | "Belgrano, CABA" | dato de la propiedad |
| `price` | "USD 185.000" | dato de la propiedad |
| `specs` | ambientes, m², baños, cochera… | dato de la propiedad |
| `photos` | rutas locales o URLs de las fotos | el usuario / Tokko / tabla `properties` |
| `cta` | "Coordiná tu visita hoy" | **vakdor-copywriter** |
| `contact` | "@vakdor · WhatsApp" | el usuario |
| `secondsPerPhoto` | 2.5 (default) | opcional |

Si faltan datos de la propiedad, pedirlos en UNA sola tanda. Si el usuario da un link de Tokko o
un ID de `properties`, ofrecer sacar los datos de ahí. No repreguntar lo que ya esté claro.

---

## Paso 3 — Copy y ángulo: delegar a vakdor-copywriter

Esta skill **NO inventa copy**. El gancho del `cta` (y cualquier texto persuasivo) lo define
**vakdor-copywriter** con la voz de Vakdor. Activarla para resolver el `cta` antes de renderizar.
Los datos duros (precio, ambientes, zona) son de la propiedad, no se inventan.

---

## Paso 4 — Armar el activo y los props

1. Crear la carpeta del activo: `Prisma - MK\Activos de Marketing\[Fecha Actual]\[nombre-del-reel]\`
   (fecha en formato "28 de junio de 2026", igual que carousel).
2. Si las fotos son archivos locales, copiarlas a una subcarpeta `fotos\` del activo.
3. Crear `props.json` en la carpeta del activo con los campos del Paso 2.
   (Hay un molde en `_motor-video\props.example.json`.)

---

## Paso 5 — Renderizar

Parado en `Prisma - MK\_motor-video`, ejecutar:

```
node render.mjs --props="<ruta al props.json del activo>" --out="<ruta del activo>\reel.mp4"
```

El wrapper `render.mjs`:
- copia las fotos locales a `public\current\` (Remotion sirve imágenes desde `public\`),
- las fotos que ya son URL http las deja igual,
- renderiza `PropertyReel` (H.264, vertical 1080x1920, 30fps) al `.mp4` pedido.

La **duración se calcula sola**: 2s intro + (Nº fotos × `secondsPerPhoto`) + 2.5s outro.

> Para previsualizar y ajustar en vivo (opcional): `npm run studio` abre el Remotion Studio.

---

## Paso 6 — Cierre (memoria + copy)

1. **`copy.md`** en la carpeta del activo: descripción del post (IG/TikTok) + primer comentario,
   unificando el material del reel. El copy de redes lo resuelve vakdor-copywriter.
2. **Registro en memoria:** anotar el activo (nombre, propiedad, ángulo, fecha, duración) en
   `Prisma - MK\memoria.md` para no repetir y llevar historial. Revisar ese archivo ANTES de
   empezar para no repetir ángulos.

---

## MODO B — Editor de video crudo (`EditedReel`)

Cuando el usuario te pasa un **video grabado por él** (ej. una recorrida de propiedad, un
testimonio, un pitch a cámara) y quiere que lo dejes profesional. La skill:

1. **Detecta los silencios** con ffmpeg (`silencedetect`) y arma los **jump cuts** (corta los
   "ehhh", pausas y muletillas largas, pega los tramos buenos).
2. **Subtítulos automáticos** (opcional): transcribe el audio con **Whisper local** (gratis,
   offline, anda en español) y los pone estilo TikTok (palabra por palabra, la activa en cobre).
   Alternativa sin Whisper: pasarle un `.srt` ya hecho con `--captions`.
3. **Marca de agua** (logos Vakdor/PRISMA) + **intro y outro** de marca.

### Qué hace Remotion y qué no (honesto)
- ✅ Recorte/trim, pegar tramos, velocidad, volumen, subtítulos, marca, transiciones, render final.
- ⚠️ La **detección de silencios** la hace **ffmpeg**, no Remotion (Remotion arma y renderiza).
- ⚠️ No es un editor de timeline a mano (Descript/Premiere): es **automático y por parámetros**.
  La calidad del corte depende de afinar el umbral (`--silence-db`, `--min-silence`).

### Uso

Parado en `Prisma - MK\_motor-video`:

```
node edit.mjs --video="C:\ruta\al\crudo.mp4" --out="<carpeta del activo>\final.mp4" --subtitles
```

**Opciones** (ver cabecera de `edit.mjs` para la lista completa):
- `--subtitles` → subtítulos con Whisper (la 1ª vez baja/compila Whisper; modelo con `--model=base|small|medium`).
- `--captions="x.srt"` → subtítulos desde un SRT (sin Whisper).
- `--silence-db=-30` `--min-silence=0.6` `--pad=0.06` → afinan el corte de silencios.
- `--no-intro` `--no-outro` `--no-watermark` `--no-subtitles` → apagan partes.
- `--title="..."` `--contact="..."` → textos de intro/outro.
- `--lang=es` → idioma de la transcripción.

> Importante: el video crudo y la salida viven en `Prisma - MK` (regla de oro). `edit.mjs` copia
> el crudo a `public\current\` para que Remotion lo lea, y limpia al terminar.

### Límite de aspecto
`EditedReel` exporta vertical 1080x1920 (reel). Si el crudo es horizontal, se recorta a vertical
(`objectFit: cover`). Para mantener el formato original (16:9) hay que registrar una variante
horizontal en `Root.tsx` — pedir si se necesita.

---

## Composiciones disponibles

- **`PropertyReel`** — reel vertical desde fotos de una propiedad (intro de marca → fotos con
  Ken Burns y specs → outro con CTA y precio).
- **`EditedReel`** — edición de un video crudo (intro → tramos sin silencio con marca de agua y
  subtítulos → outro). 
- Se puede extender con más plantillas (ej. "mercado en video", "testimonios") agregando
  componentes en `engine\src\` y registrándolos en `engine\src\Root.tsx`.

## Detalle técnico del motor (`engine\`)

- `src\PropertyReel.tsx` — composición del reel de propiedad (Ken Burns, lower-thirds, logos).
- `src\EditedReel.tsx` — composición del editor (OffthreadVideo con trimBefore/trimAfter por tramo,
  subtítulos con `@remotion/captions`, marca de agua, intro/outro).
- `src\brand.ts` + `brand.json` — colores de marca que consumen las composiciones.
- `src\Root.tsx` / `src\index.ts` — registro de composiciones Remotion.
- `render.mjs` — wrapper del Modo A (resuelve fotos y dispara el render).
- `edit.mjs` — orquestador del Modo B: ffmpeg silencedetect → tramos → (Whisper/SRT → subtítulos
  re-mapeados a la línea editada) → render de `EditedReel`. Llama al CLI de Remotion por su JS
  directo con `node` (para no romper con los espacios de "Prisma - MK").
- `remotion.config.ts` — calidad de salida (H.264, CRF 18).

### Componentes avanzados (nuevos, aditivos al engine original)

- `src/transitions.ts` — presets de transiciones usando `@remotion/transitions`: slide, fade,
  wipe, flip, clockWipe, con timings spring y linear. Helper `getTransition(name)` y
  `randomTransition()`.
- `src/AudioLayer.tsx` — componentes de audio: `AudioLayer` (música/SFX con fade in/out, loop,
  start offset), `AudioDucked` (música que baja cuando hay voz), `Sfx` (efecto puntual).
- `src/TextFx.tsx` — animaciones de texto avanzadas: `PerLetterReveal`, `Typewriter`,
  `WordByWord`, `CountUp` (contador animado), `GradientText`.
- `src/PictureInPicture.tsx` — overlay PiP (ej: cara del broker sobre la propiedad), con
  posiciones, tamaño, borde, animación, y soporte video/imagen.
- `src/SpeedSegment.tsx` — speed ramping: `SpeedSegment` (velocidad constante, slow-mo/fast),
  `SpeedRamp` (velocidad variable con curva de puntos), helper `speedSegmentFrames()`.
- `src/ColorGrade.tsx` — color grading por CSS filters con presets: `cinematic`, `warm`, `cool`,
  `vintage`, `bw`, `highContrast`, `moody`, `golden`, `teal-orange`. Soporte de vignette y tint.
- `src/Thumbnail.tsx` — composición de 1 frame para generar thumbnails/portadas de reels.
- `src/utils.ts` — utilidades compartidas: `secToFrames`, `framesToSec`, `msToFrames`,
  `getSpringDuration` (via `measureSpring`), presets de `Easing`, catálogo de `FORMATS`
  (reelHD, landscape1080, square, portrait4x5, etc.), helpers `fadeIn`, `fadeOut`, `slideUp`,
  `pulse`, `formatPrice`, `formatDuration`.
- `thumbnail.mjs` — script de render de thumbnails (`remotion still`).
- `batch.mjs` — renderizado en serie desde un `manifest.json`.

---

## 📚 Referencia Experta de Remotion (v4.0.290)

Esta sección es la **referencia completa** que convierte a esta skill en experta en Remotion.
Consultarla antes de usar cualquier API avanzada.

### Paquetes disponibles en el engine

| Paquete | Uso |
|---|---|
| `remotion` | Core: `AbsoluteFill`, `Sequence`, `Series`, `Loop`, `Freeze`, `Img`, `OffthreadVideo`, `Audio`, `interpolate`, `spring`, `measureSpring`, `useCurrentFrame`, `useVideoConfig`, `staticFile`, `delayRender`, `continueRender`, `cancelRender`, `Easing`, `random` |
| `@remotion/cli` | CLI: `render`, `still`, `studio`, `compositions`, `benchmark` |
| `@remotion/captions` | `createTikTokStyleCaptions`, `Caption`, `TikTokPage` |
| `@remotion/google-fonts` | `loadFont()` de Inter (y cualquier otra Google Font) |
| `@remotion/install-whisper-cpp` | `installWhisperCpp`, `downloadWhisperModel`, `transcribe`, `toCaptions` |
| `@remotion/transitions` | `TransitionSeries`, `springTiming`, `linearTiming`, `slide`, `fade`, `wipe`, `flip`, `clockWipe`, `customPresentation` |
| `@remotion/media-utils` | `getVideoMetadata`, `getAudioDurationInSeconds`, `getAudioData` (para análisis de audio en render) |
| `@remotion/motion-blur` | `<Trail>` wrapper: motion blur cinemático por N copias |
| `@remotion/paths` | `getLength`, `getPointAtLength`, `getSubpaths`, `scalePath`, `translatePath` — para animar SVG paths |
| `@remotion/shapes` | `<Rect>`, `<Circle>`, `<Triangle>`, `<Ellipse>`, `<Polygon>`, `<Star>` — formas SVG animables |

### Componentes core de Remotion que DEBÉS conocer

#### `Sequence`
El bloque básico de timeline. Cada `Sequence` resetea `useCurrentFrame()` a 0 dentro de sus hijos.
```tsx
<Sequence from={30} durationInFrames={90} name="Escena 2">
  <MiComponente />
</Sequence>
```

#### `Series`
Secuencias consecutivas SIN solapamiento (útil cuando no necesitás calcular `from` manualmente):
```tsx
import { Series } from "remotion";
<Series>
  <Series.Sequence durationInFrames={60}><EscenaA /></Series.Sequence>
  <Series.Sequence durationInFrames={90}><EscenaB /></Series.Sequence>
  <Series.Sequence durationInFrames={45}><EscenaC /></Series.Sequence>
</Series>
```

#### `TransitionSeries` (de `@remotion/transitions`)
Como `Series` pero CON transiciones entre escenas:
```tsx
import { TransitionSeries } from "@remotion/transitions";
import { TRANSITIONS } from "./transitions";

<TransitionSeries>
  <TransitionSeries.Sequence durationInFrames={75}><FotoA /></TransitionSeries.Sequence>
  <TransitionSeries.Transition
    presentation={TRANSITIONS.fade.presentation}
    timing={TRANSITIONS.fade.timing}
  />
  <TransitionSeries.Sequence durationInFrames={75}><FotoB /></TransitionSeries.Sequence>
</TransitionSeries>
```

#### `Loop`
Repite sus hijos N veces o infinitamente:
```tsx
import { Loop } from "remotion";
<Loop durationInFrames={30} times={3}>
  <AnimacionCortita />
</Loop>
```

#### `Freeze`
Congela el frame de sus hijos (útil para pausas):
```tsx
import { Freeze } from "remotion";
<Freeze frame={20}>
  <ComponenteQueSeQuedaEnElFrame20 />
</Freeze>
```

#### `Audio`
Reproduce audio. Soporta `volume` (función o número), `startFrom`, `endAt`, `loop`.
La skill usa `AudioLayer.tsx` como wrapper más cómodo, pero la API cruda es:
```tsx
import { Audio, staticFile, interpolate, useCurrentFrame } from "remotion";
const frame = useCurrentFrame();
<Audio
  src={staticFile("musica.mp3")}
  volume={(f) => interpolate(f, [0, 30], [0, 0.5], {extrapolateRight:"clamp"})}
  loop
/>
```

#### `OffthreadVideo`
Video que se procesa fuera del thread de render (más estable que `<Video>`). Soporta
`playbackRate` para speed ramping, `startFrom`, `endAt`, `volume`, `muted`.
```tsx
<OffthreadVideo
  src={staticFile("video.mp4")}
  playbackRate={0.5}      // slow-mo 50%
  startFrom={30}          // empieza desde el frame 30 del video original
  endAt={120}
  volume={0.8}
  style={{ objectFit: "cover" }}
/>
```

### Patrones avanzados de Remotion

#### `delayRender` / `continueRender` (carga asíncrona)
Si necesitás cargar datos, fuentes o imágenes antes de renderizar un frame:
```tsx
import { delayRender, continueRender } from "remotion";
const [handle] = useState(() => delayRender("Cargando datos..."));
useEffect(() => {
  fetch("/api/datos").then((r) => r.json()).then((data) => {
    setData(data);
    continueRender(handle);
  });
}, [handle]);
```
Si no llamás `continueRender()` en 30s, Remotion aborta con timeout.

#### `measureSpring` (calcular duración de un spring)
Para saber exactamente cuántos frames dura un spring y usarlo en `calculateMetadata`:
```tsx
import { measureSpring } from "remotion";
const durFrames = measureSpring({ fps: 30, config: { damping: 200 }, threshold: 0.005 });
```
La skill lo expone como `getSpringDuration(fps, config)` en `utils.ts`.

#### `random` (determinístico)
Remotion tiene su propio `random(seed)` para valores aleatorios que son consistentes entre frames:
```tsx
import { random } from "remotion";
const x = random("mi-seed") * 100; // siempre el mismo valor para el mismo seed
```

#### `calculateMetadata` (duración dinámica)
Función que recibe los props y devuelve `{ durationInFrames, fps, width?, height? }`:
```tsx
export const calcMetadata: CalculateMetadataFunction<MisProps> = ({ props }) => ({
  durationInFrames: Math.round(props.items.length * 2.5 * 30),
  fps: 30,
});
```
El motor ya lo usa en `PropertyReel` y `EditedReel`. La `Thumbnail` devuelve 1 frame.

#### `@remotion/motion-blur` con `<Trail>`
Envolvé cualquier componente para agregarle motion blur cinemático:
```tsx
import { Trail } from "@remotion/motion-blur";
<Trail layers={8} lagInFrames={0.03}>
  <ComponenteConMovimiento />
</Trail>
```
Más `layers` = más suave pero más lento. 4-8 es buen balance. No usar en composiciones
completas, solo en elementos que se mueven rápido.

#### `@remotion/paths` (animar SVGs)
```tsx
import { getLength, getPointAtLength, evolvePath } from "@remotion/paths";
const path = "M 0 0 L 100 100 L 200 0";
const len = getLength(path);
const point = getPointAtLength(path, len * progress);
```

#### `@remotion/shapes` (formas animables)
```tsx
import { Rect, Circle, Star } from "@remotion/shapes";
<Circle radius={50} fill={BRAND.accent} />
<Star points={5} innerRadius={20} outerRadius={50} fill="#fff" />
```

#### `@remotion/media-utils` (metadatos de video/audio)
```tsx
import { getVideoMetadata, getAudioDurationInSeconds } from "@remotion/media-utils";
// En calculateMetadata o useEffect con delayRender:
const meta = await getVideoMetadata(src); // { width, height, durationInSeconds, fps }
const audioDur = await getAudioDurationInSeconds(src);
```

### CLI de Remotion — Comandos completos

```bash
# Render video
npx remotion render <CompId> <output.mp4> --props=props.json --concurrency=50%

# Render imagen (still)
npx remotion render <CompId> <output.jpg> --frame=0 --image-format=jpeg --jpeg-quality=92

# Still (alternativa al render de 1 frame)
npx remotion still <CompId> <output.png> --props=props.json --image-format=png

# Studio (preview interactivo)
npx remotion studio

# Listar composiciones
npx remotion compositions

# Benchmark
npx remotion benchmark <CompId>
```

**Flags útiles del render:**
- `--concurrency=50%` — porcentaje de CPUs a usar (default 50%, subir a 75% en máquinas buenas)
- `--crf=18` — calidad (menor = mejor; 15-18 para producción, 23-28 para drafts rápidos)
- `--codec=h264` — H.264 (IG/TikTok), `h265` (mejor compresión), `vp8`/`vp9` (web)
- `--pixel-format=yuv420p` — compatible con todos los players
- `--image-format=jpeg` — más rápido que png; para render final usar jpeg
- `--scale=0.5` — renderiza a mitad de resolución (draft rápido)
- `--frames=0-60` — renderiza solo un rango de frames (para testing)
- `--muted` — no procesa audio (más rápido si no hay audio)
- `--log=verbose` — logs detallados para debugging
- `--gl=angle` — fuerza ANGLE (util en Windows si swiftshader falla)
- `--timeout=120000` — timeout por frame en ms (default 30000)

---

## 🎧 Audio avanzado

### Componentes de audio (`AudioLayer.tsx`)

#### `<AudioLayer>` — Música o SFX con fades
```tsx
import { AudioLayer } from "./AudioLayer";
<AudioLayer
  src="musica-ambiente.mp3"  // en public/ o URL http
  volume={0.35}
  fadeInSec={1.5}
  fadeOutSec={2}
  loop
/>
```

#### `<AudioDucked>` — Música que baja cuando hay voz
"Ducking" = cuando alguien habla, la música baja automáticamente.
Los `duckRanges` son los segundos del video editado donde hay voz.
```tsx
import { AudioDucked } from "./AudioLayer";
<AudioDucked
  music="bg-music.mp3"
  musicVolume={0.35}
  duckTo={0.08}
  duckRanges={[
    { from: 2, to: 15 },    // voz del segundo 2 al 15
    { from: 22, to: 40 },   // voz del segundo 22 al 40
  ]}
  duckTransitionSec={0.3}
  fadeInSec={1}
  fadeOutSec={2}
/>
```
Tip: los `duckRanges` se pueden calcular automáticamente desde los `segments` del Modo B.

#### `<Sfx>` — Efecto de sonido puntual
```tsx
import { Sfx } from "./AudioLayer";
<Sfx src="whoosh.mp3" fromFrame={0} durationInFrames={30} volume={0.7} />
```

### Dónde poner los audios

Los archivos `.mp3`/`.wav` van en `public/` del motor (o URLs http). El agente debe:
1. Copiar el audio del usuario a `Prisma - MK/_motor-video/public/` (o `public/current/`).
2. Referenciar con `staticFile("nombre.mp3")` o ruta relativa en props.

---

## 🎬 Transiciones entre escenas (`transitions.ts`)

### Presets disponibles

| Preset | Efecto |
|---|---|
| `slide` / `slideLeft` / `slideUp` / `slideDown` | La escena nueva empuja a la anterior |
| `fade` / `fadeSlow` / `fadeCinematic` | Crossfade suave |
| `wipe` / `wipeLeft` / `wipeUp` | Barrido horizontal/vertical |
| `flip` | La escena gira 3D |
| `clockWipe` / `clockWipeFast` | Barrido circular tipo reloj |

### Uso con TransitionSeries

```tsx
import { TransitionSeries } from "@remotion/transitions";
import { TRANSITIONS, getTransition } from "./transitions";

<TransitionSeries>
  <TransitionSeries.Sequence durationInFrames={75}>
    <FotoUno />
  </TransitionSeries.Sequence>
  <TransitionSeries.Transition
    presentation={TRANSITIONS.fade.presentation}
    timing={TRANSITIONS.fade.timing}
  />
  <TransitionSeries.Sequence durationInFrames={75}>
    <FotoDos />
  </TransitionSeries.Sequence>
  <TransitionSeries.Transition {...getTransition("slide")} />
  <TransitionSeries.Sequence durationInFrames={75}>
    <FotoTres />
  </TransitionSeries.Sequence>
</TransitionSeries>
```

### Crear transiciones custom

```tsx
import { customPresentation, springTiming } from "@remotion/transitions";
const miTransicion = {
  presentation: customPresentation({
    component: ({ progress, presentationDirection }) => (
      <AbsoluteFill style={{ opacity: progress, transform: `rotate(${progress * 360}deg)` }}>
        {presentationDirection === "entering" ? "Nueva" : "Vieja"}
      </AbsoluteFill>
    ),
  }),
  timing: springTiming({ config: { damping: 200 }, durationInFrames: 20 }),
};
```

---

## ⏩ Speed ramping (`SpeedSegment.tsx`)

### Velocidad constante
```tsx
import { SpeedSegment, speedSegmentFrames } from "./SpeedSegment";
// Slow-mo al 50%
<Sequence durationInFrames={speedSegmentFrames(5, 10, 0.5, 30)}>
  <SpeedSegment src="current/raw.mp4" fromSec={5} toSec={10} speed={0.5} />
</Sequence>
```

### Velocidad variable (speed ramp)
```tsx
import { SpeedRamp } from "./SpeedSegment";
<SpeedRamp
  src="current/raw.mp4"
  fromSec={0}
  toSec={8}
  speedCurve={[
    { at: 0, speed: 1 },      // normal al inicio
    { at: 0.3, speed: 0.3 },  // slow-mo dramático
    { at: 0.5, speed: 0.3 },  // mantiene slow-mo
    { at: 0.7, speed: 1.5 },  // acelera
    { at: 1, speed: 1 },      // vuelve a normal
  ]}
/>
```

---

## 🎨 Color grading (`ColorGrade.tsx`)

### Presets
```tsx
import { ColorGrade } from "./ColorGrade";
<ColorGrade preset="cinematic">
  <OffthreadVideo src={...} style={{...}} />
</ColorGrade>
```

| Preset | Efecto |
|---|---|
| `cinematic` | Oscuro, contrastado, ligeramente desaturado, vignette |
| `warm` | Tonos cálidos, sepia suave |
| `cool` | Tonos fríos, azulado |
| `vintage` | Sepia, baja saturación, vignette |
| `bw` | Blanco y negro |
| `highContrast` | Alto contraste, colores vivos |
| `moody` | Oscuro, dramático |
| `golden` | Hora dorada, tono ámbar |
| `teal-orange` | Estilo cine moderno (teal & orange) |

### Custom
```tsx
<ColorGrade brightness={1.1} contrast={1.2} saturate={0.8} hueRotate={-5} sepia={0.05} vignette>
  <Img src={...} />
</ColorGrade>
```

---

## 🖼️ Picture-in-Picture (`PictureInPicture.tsx`)

Superpone un video o imagen circular/redondeado sobre el contenido principal.
Caso típico: cara del broker hablando sobre las fotos de la propiedad.

```tsx
import { PictureInPicture } from "./PictureInPicture";
<PictureInPicture
  src="current/broker.mp4"
  position="bottom-left"   // top-left | top-right | bottom-left | bottom-right | center-left | center-right
  size={240}
  borderWidth={4}
  borderColor="#C07C41"    // cobre Vakdor
  borderRadius="50%"       // circulo; usar "16px" para redondeado
  isVideo={true}
  animate={true}
/>
```

Para imagen estática (ej: foto del asesor):
```tsx
<PictureInPicture src="current/asesor.jpg" isVideo={false} position="bottom-right" size={180} />
```

---

## ✨ Animaciones de texto (`TextFx.tsx`)

### PerLetterReveal — letra por letra con stagger
```tsx
import { PerLetterReveal } from "./TextFx";
<PerLetterReveal text="Vakdor PRISMA" effect="slideUp" stagger={2} fontSize={80} />
```
Efectos: `"fade"`, `"slideUp"`, `"scale"`.

### Typewriter — máquina de escribir
```tsx
import { Typewriter } from "./TextFx";
<Typewriter text="Departamento premium en Belgrano" speed={3} />
```

### WordByWord — palabra por palabra con highlight
```tsx
import { WordByWord } from "./TextFx";
<WordByWord text="Tu próximo hogar te espera" stagger={8} activeColor="#C07C41" />
```

### CountUp — contador animado
```tsx
import { CountUp } from "./TextFx";
<CountUp to={185000} prefix="USD " durationFrames={45} />
```

### GradientText — texto con gradiente
```tsx
import { GradientText } from "./TextFx";
<GradientText text="PREMIUM" colors={["#C07C41", "#FFFFFF"]} animated />
```

---

## 🖼️ Thumbnail / Portada (`Thumbnail.tsx` + `thumbnail.mjs`)

Genera una imagen de portada/preview para el reel.

### Desde la skill
```bash
# Parado en Prisma - MK/_motor-video
node thumbnail.mjs --props="<ruta>/thumb-props.json" --out="<ruta del activo>/portada.jpg"
```

Props del thumbnail:
```json
{
  "photo": "fotos/1.jpg",
  "title": "Departamento 3 amb",
  "price": "USD 185.000",
  "tag": "En Venta",
  "format": "vertical"
}
```

---

## 📦 Batch rendering (`batch.mjs`)

Renderiza múltiples videos/thumbnails en serie desde un manifiesto JSON.

```bash
node batch.mjs --manifest="<ruta>/manifest.json"
```

Formato del manifest:
```json
[
  { "composition": "PropertyReel", "props": "activo1/props.json", "out": "activo1/reel.mp4" },
  { "composition": "PropertyReel", "props": "activo2/props.json", "out": "activo2/reel.mp4" },
  { "composition": "Thumbnail", "props": "activo1/thumb.json", "out": "activo1/portada.jpg" }
]
```

Reporta al final: `3 OK, 0 errores de 3 total`.

---

## 📐 Soporte multi-formato (`utils.ts`)

El engine exporta un catálogo de formatos en `FORMATS`:

| Key | Resolución | Uso |
|---|---|---|
| `reelHD` | 1080×1920 | Reels IG, TikTok, Stories (default) |
| `reel4K` | 2160×3840 | Reel 4K |
| `landscape720` | 1280×720 | YouTube 720p |
| `landscape1080` | 1920×1080 | YouTube/web 1080p |
| `landscape4K` | 3840×2160 | YouTube 4K |
| `square` | 1080×1080 | Feed IG, LinkedIn |
| `portrait4x5` | 1080×1350 | Feed IG vertical |

Para hacer un video en formato horizontal, registrar una variante de la composición en
`Root.tsx` con `width/height` invertidos. Las composiciones que tienen `calculateMetadata`
pueden devolver `width`/`height` dinámicos basados en un prop `format`.

Ejemplo para agregar variante horizontal de PropertyReel:
```tsx
<Composition
  id="PropertyReelLandscape"
  component={PropertyReel}
  durationInFrames={300}
  fps={FPS}
  width={1920}
  height={1080}
  defaultProps={{ ...propertyReelDefaults }}
  calculateMetadata={calcReelMetadata}
/>
```

---

## 🔧 Troubleshooting

### Errores comunes y soluciones

| Error | Causa | Solución |
|---|---|---|
| `Could not find composition` | El ID no coincide con lo registrado en `Root.tsx` | Verificar que el `--composition` matchea exactamente (`PropertyReel`, `EditedReel`, `Thumbnail`) |
| `Timed out evaluating page` | `delayRender` no se resolvió | Verificar que todo `delayRender` tiene su `continueRender`. Subir `--timeout=120000` |
| `ENAMETOOLONG` o path con espacios | Paths con espacios en el shell | Usar el patrón del motor: `spawnSync(process.execPath, [cliPath, ...])` en vez de shell directo |
| `Could not read video metadata` | El video crudo está corrupto o formato no soportado | Verificar con `ffprobe -v error video.mp4`. Convertir a H.264 si es necesario: `ffmpeg -i input -c:v libx264 output.mp4` |
| `Puppeteer/Chromium launch failed` | Primera vez sin Chromium descargado | Correr `npx remotion ensure-browser` o dejar que `npm install` lo baje |
| `Out of memory` | Video muy largo o muchas composiciones abiertas | Usar `--concurrency=25%`, cerrar otras apps, o splitear el video |
| `ffmpeg not found` | ffmpeg no está en PATH | Instalar ffmpeg: `winget install ffmpeg` o bajar de ffmpeg.org |
| `Whisper compilation failed` | Problemas con el compilador C++ | Necesita Visual Studio Build Tools con C++ workload. O usar `--captions="archivo.srt"` para saltar Whisper |
| Render lento | CRF muy bajo, resolución alta, o muchos frames | Bajar CRF a 23 para drafts (`--crf=23`), usar `--scale=0.5` para preview, limitar `--frames=0-90` |
| Video sin audio | Falta `<Audio>` o el codec no soporta audio | Verificar que haya `<Audio>` o `<AudioLayer>` en la composición. Usar codec `h264` |
| Colores apagados en IG/TikTok | Perfil de color incorrecto | Agregar `--pixel-format=yuv420p` al render |
| Subtítulos desfasados | Los tiempos del SRT no matchean el video editado | Verificar que se están re-mapeando con `remapCaptions()` después de cortar silencios |

### Cuando algo sale mal en Whisper

1. **Verificar que Visual Studio Build Tools está instalado** con C++ workload.
2. Si no compila, usar la alternativa SRT: transcribir con otra herramienta (OpenAI Whisper Python,
   Google Speech-to-Text) y pasarle el `.srt` con `--captions="archivo.srt"`.
3. Modelo `base` es el más rápido; `medium` es mejor calidad pero tarda mucho más.

### Cuando el render es muy lento

1. **Draft rápido**: `--scale=0.5 --crf=28 --concurrency=75%`
2. **Solo un rango**: `--frames=0-90` (primeros 3 segundos a 30fps)
3. **Sin audio**: `--muted` (si solo estás probando visual)
4. **Paralelizar**: subir `--concurrency=75%` (ojo con RAM)

---

## ⚡ Tips de performance

1. **Usar `OffthreadVideo` siempre** (nunca `<Video>`): es más estable y usa menos memoria.
2. **`staticFile()` para assets locales**: evita problemas de CORS y paths.
3. **`JPEG` para render intermedio**: `Config.setVideoImageFormat("jpeg")` (ya configurado).
4. **CRF 18** para producción, **CRF 23-28** para drafts rápidos.
5. **`--concurrency=50%`** es el default; subir a 75% si el PC tiene 16GB+ RAM.
6. **No usar `<Trail>` (motion blur) en toda la composición**: solo en elementos puntuales.
7. **Medir springs con `measureSpring()`** para calcular duraciones exactas.
8. **Audio loop**: si la música es más corta que el video, usar `loop={true}` en `<AudioLayer>`.
9. **Limpiar `public/current/`** después de cada render para no acumular archivos.
10. **Thumbnail**: usar `remotion still` (1 frame) en vez de `render` (mucho más rápido).

---

## 🔌 Extender el motor con nuevas composiciones

Para agregar una nueva plantilla de video (ej: "Testimonios", "Mercado en video"):

1. Crear `engine/src/MiNuevaComp.tsx` con el componente, props, defaults y `calculateMetadata`.
2. Registrar en `engine/src/Root.tsx` con `<Composition id="MiNuevaComp" ... />`.
3. (Opcional) Crear un script wrapper `mi-comp.mjs` si necesita pre-procesamiento.
4. Documentar los props en `SKILL.md` (esta sección).
5. El motor se recopia al hacer cambios: copiar `src/`, scripts, `brand.json` a
   `Prisma - MK/_motor-video/` (no reinstalar `node_modules` si no hay deps nuevas).

### Checklist para nuevas composiciones

- [ ] Componente exporta: `MiComp`, `miCompDefaults`, `calcMiCompMetadata`, `MI_FPS`
- [ ] `Root.tsx` tiene el `<Composition id="MiComp" ... />`
- [ ] `calculateMetadata` devuelve `durationInFrames` correcto
- [ ] Usa `BRAND` de `brand.ts` para colores
- [ ] Usa `fontFamily` de `@remotion/google-fonts/Inter`
- [ ] Fotos/videos se resuelven con `staticFile()` o URL http
- [ ] La salida va a `Prisma - MK/` (regla de oro)

---

## 🚀 Adaptación Universal & Aceleración Externa (VSLs, Podcasts, Demos, Reels)

### 1. Adaptabilidad Total de Formato
Este motor y la skill están diseñados para adaptarse a **CUALQUIER tipo de video**:
- **Reels / Shorts / TikTok (9:16 - 1080x1920)**: Formato vertical dinámico, subtítulos centrados al medio/inferior, ritmo rápido.
- **VSL / Demos / YouTube / Cursos (16:9 - 1920x1080)**: Formato horizontal profesional. Subtítulos inferiores con margen de seguridad para no tapar overlays/cámara.
- **Feed / LinkedIn (1:1 o 4:5 - 1080x1080 o 1080x1350)**: Formato cuadrado/portrait con marca superior/inferior.

### 2. Edición de Videos Largos con 100+ Cortes (`cut-exact.mjs`)
- En videos de larga duración (>5 minutos) con muchos silencios (>100 tramos), la expresión `select` de FFmpeg falla por límite de memoria del evaluador de expresiones.
- **Solución comprobada**: Usar `cut-exact.mjs`. Extrae cada tramo de forma milimétrica (`-ss` y `-to` con re-encode ultrafast) para evitar duplicados por I-frames, concatenándolos mediante `concat demuxer` y aplicando normalización `loudnorm` (-14 LUFS) en el passe final.

### 3. Opciones de Aceleración Externa & Nube (Gratis / Ultra Rápidas)
1. **Transcripción Ultrarrápida en la Nube (`transcribe-groq.mjs`)**:
   - Usa la API de Groq Cloud (`whisper-large-v3`) para transcribir 20 minutos en ~3-5 segundos.
   - Lee automáticamente `GROQ_API_KEY` del archivo `.env` o el parámetro `--key=gsk_...`.
   - Formatea la respuesta `verbose_json` a líneas de SRT calibradas a un máximo de 46 caracteres por línea para legibilidad profesional.
   - **Comando**: `node transcribe-groq.mjs --in="stage1.mp4" --out="subs.srt"`

2. **Aceleración por Hardware GPU AMD Radeon (`burn-amf.mjs`)**:
   - Utiliza el codec de aceleración por hardware `-c:v h264_amf` (AMD Advanced Media Framework) para placas AMD Radeon.
   - Renderiza el video con subtítulos quemados a velocidades de 3.5x+ (106+ fps), reduciendo el tiempo a 2 minutos.
   - Incluye fallback automático a CPU (`libx264`) si la GPU AMD no está disponible en la sesión.
   - **Comando**: `node burn-amf.mjs --in="stage1.mp4" --srt="subs.srt" --out="final.mp4"`

3. **Pipeline Completo de Edición para Videos Largos (16:9 / VSL / Demos)**:
   - **Paso 1 (Corte + Normalización Audio)**: `node cut-exact.mjs --in="crudo.mp4" --out="stage1.mp4"`
   - **Paso 2 (Transcripción Groq 3s)**: `node transcribe-groq.mjs --in="stage1.mp4" --out="subs.srt"`
   - **Paso 3 (Diccionario de Marca)**: `node fix-srt.mjs --in="subs.srt" --out="subs-fixed.srt"`
   - **Paso 4 (Quemado ASS + GPU AMD)**: `node burn-amf.mjs --in="stage1.mp4" --srt="subs-fixed.srt" --out="VSL-FINAL.mp4"`



