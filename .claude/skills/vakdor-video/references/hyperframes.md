# HyperFrames — la vía de overlays en HTML (Modo C)

Motor de video open source de HeyGen (**Apache 2.0**, sin techo de personas ni costo por render).
Escribís el video como un `index.html` con atributos de tiempo; él lo abre en un Chrome invisible,
va frame por frame y encodea con ffmpeg. Mismo concepto que Remotion, **pero en HTML plano en vez
de React** — no hay `npm install` ni build.

**Para qué se usa acá:** para fabricar **overlays con fondo transparente** que entran directo al
`edl.json` del Modo C. No toca video grabado a cámara — de eso se ocupa `studio.mjs`.

> Todo lo de abajo está **medido el 21-ago-2026 en esta máquina** (Windows 11, Ryzen 5 5500U,
> ffmpeg 8.1.1, Node 24, HyperFrames 0.8.6), no leído del README. Lo que no se probó está
> marcado como tal.

---

## 1. El gotcha que arruina el trabajo en silencio

**Al superponer el WebM con alpha hay que declarar el decodificador `-c:v libvpx-vp9` ANTES
del `-i` del webm.** Si no, ffmpeg tira el canal alpha, **no da error, y sale un mp4 perfecto
con un cuadrado negro** donde tenía que haber transparencia.

Medido sobre el mismo archivo, muestreando el píxel del fondo con el overlay puesto encima:

| | Fondo fuera del panel | Dentro del panel |
|---|---|---|
| **Con** `-c:v libvpx-vp9` | `#2e6e4d` ✅ (se ve el fondo) | `#131517` |
| **Sin** el flag | `#000000` ❌ (negro) | `#0d0e12` |

Las dos corridas terminaron con `exit=0` y las dos generaron un mp4 de 120 frames. Se verificó
**a verbosidad normal, sin `-v error`**: ffmpeg **no imprime ni un warning**. No hay nada en el
log que avise.

### Pero sí se ve antes de renderizar, en una sola letra

El delator está en la línea con la que ffmpeg describe el webm de entrada. **Es el `pix_fmt`:**

| | Lo que reporta ffmpeg |
|---|---|
| **Con** `-c:v libvpx-vp9` | `Video: vp9 (libvpx-vp9) (Profile 0), `**`yuva420p`**` …` ✅ |
| **Sin** el flag | `Video: vp9 (Profile 0), `**`yuv420p`**` …` ❌ |

**`yuva420p` con "a" = trae alpha. `yuv420p` sin "a" = la transparencia ya se perdió.** La
diferencia es una letra y decide el trabajo.

El motivo: el decodificador **nativo** `vp9` de ffmpeg no sabe leer el canal alpha de un WebM;
el de la librería, `libvpx-vp9`, sí. Como ffmpeg elige el nativo por defecto, hay que pedirle
el otro a mano.

Chequeo de 2 segundos antes de componer nada:

```bash
ffmpeg -hide_banner -c:v libvpx-vp9 -i render.webm -frames:v 1 -f null - 2>&1 | grep "Stream #0:0"
```

Si no dice `yuva420p`, parar: no tiene sentido seguir.

Y la comprobación final sobre el compuesto, midiendo el píxel del fondo:

```bash
ffmpeg -v error -ss 3 -i compuesto.mp4 -vf "crop=4:4:500:600,scale=1:1" -frames:v 1 -f rawvideo -pix_fmt rgb24 - | xxd -p
```

Si donde tenía que verse el fondo sale `000000`, es esto.

---

## 2. La receta completa (verificada de punta a punta)

> **Instalado global el 21-ago-2026** (`npm install -g hyperframes`, v0.8.6). Se invoca
> `hyperframes ...` a secas — ya no hace falta `npx --yes` en cada comando.

**Paso 1 — armar el slot.** Deja 6 archivos, nada más:

```bash
hyperframes init . --example blank --non-interactive --skip-skills
```

Si la pieza es un chat de WhatsApp, no se arranca de cero: se copia `piezas/chat-whatsapp/`
(ver §4) y se cambia la conversación.

**Paso 2 — escribir el `index.html`.** El contrato es corto: un `div` raíz con
`data-composition-id`, `data-start`, `data-duration`, `data-width`, `data-height`; adentro los
elementos con `class="clip"` y sus propios `data-start` / `data-duration` / `data-track-index`;
y una timeline de GSAP **pausada** colgada de `window.__timelines[<id>]`.

```html
<div id="root" data-composition-id="main" data-start="0" data-duration="4"
     data-width="1080" data-height="1920">
  <div id="panel" class="clip" data-start="0.2" data-duration="3.8" data-track-index="1">…</div>
</div>
<script>
  window.__timelines = window.__timelines || {};
  const tl = gsap.timeline({ paused: true });
  tl.from("#panel", { opacity: 0, y: 40, duration: 0.6, ease: "power3.out" }, 0.2);
  window.__timelines["main"] = tl;
</script>
```

Para que el fondo salga transparente: `background: transparent` en `html, body`.

**Paso 3 — `check` antes de renderizar, siempre.** Es el `--check` de `studio.mjs`: gratis y
en segundos. Valida cinco cosas de una:

```bash
hyperframes check
```

```
Lint      0 errors, 0 warnings
Runtime   0 errors, 0 warnings
Layout    0 issues across 9 sample(s)
Motion    0 errors, 0 warnings
Contrast  8/8 text checks pass WCAG AA
```

El de **Contraste** no lo tiene ningún otro motor de la skill: mide si el texto se lee sobre su
fondo. Sirve para el gris `#B4BAC5` de la marca, que en pantalla chica queda al límite.

**Paso 4 — renderizar el overlay con alpha:**

```bash
hyperframes render --format webm -o render.webm
```

**Paso 5 — al EDL**, como cualquier otro overlay del Modo C:

```json
{"file": "edit/animations/slot_1/render.webm", "start_in_output": 18.6, "duration": 4.0}
```

Y en el ffmpeg que compone, el flag del punto 1:

```bash
ffmpeg -i cuerpo.mp4 -c:v libvpx-vp9 -i render.webm -filter_complex "[0:v][1:v]overlay=0:0:format=auto[v]" -map "[v]" salida.mp4
```

---

## 3. Cuánto tarda, y por qué la GPU casi no ayuda

Un panel de marca de **4 segundos en 1080×1920**:

| Salida | Peso | Tiempo |
|---|---|---|
| MP4 (h264, yuv420p, 30 fps, 120 frames) | 143,9 KB | 26,6 s |
| **WebM con alpha** (VP9, `ALPHA_MODE=1`) | 66,6 KB | 30,5 s |

Del render de 26,6 s, la traza interna dice: **22,2 s capturando frames en Chrome y 4,1 s
encodeando**. O sea que `h264_amf` acelera 4 segundos de 27. **El cuello de botella es Chrome
seekeando, no la placa** — al revés de `studio.mjs`, donde la GPU sí es la diferencia.

Consecuencia práctica: **un overlay de 4-6 s cuesta medio minuto y está bien; una pieza de 30 s
cuesta minutos.** Para piezas largas, medir antes de comprometerse.

HyperFrames detecta la placa solo (soporta `h264_amf`, el de esta máquina) y se activa con `--gpu`.

---

## 4. El catálogo: 154 bloques + 219 componentes

Es lo que más suma y lo que hoy no existe en la skill. Se instalan con `hyperframes add <nombre>`
y quedan como HTML editable dentro del proyecto.

Los que sirven para lo que hacemos:

| Necesidad del guion | Bloque / componente |
|---|---|
| Conversación de chat | `chat-thread`, `chat-message`, `thread-message-stack` |
| Notificación que entra | `notification-stack`, `notification-pileup`, `native-notification-pop` |
| Número que sube (precio, cantidad) | `number-wheel`, `number-pop-in` |
| Panel / dato que aparece | `panel-reveal`, `data-chart`, `animated-bar-chart` |
| Placa inferior con nombre | `lower-third` (8 variantes: `lt-clean-bar`, `lt-dark-card`, …) |
| Subtítulo con carácter | ~19 estilos (`caption-highlight`, `caption-kinetic-slam`, …) |
| Cierre de marca | `logo-sting`, `logo-outro`, `logo-brand-close` |
| Transiciones | familias `transitions-*` (blur, push, radial, scale, 3D…) |

**`hyperframes add` está probado** (21-ago-2026): baja el HTML a
`compositions/components/<nombre>.html` y lo deja editable. Anda con la instalación global.

### El chat de WhatsApp de Vakdor ya está hecho

`chat-thread` viene con **estética iMessage** (colas de iPhone, "Delivered"). **Ya se
re-tematizó a WhatsApp con la marca** y quedó guardado como pieza lista:

```
piezas/chat-whatsapp/          ← copiarla entera a un slot y renderizar
  index.html                   ← el host: acá se cambia la conversación
  compositions/components/chat-thread.html   ← el componente tematizado
  ejemplo.png                  ← cómo queda
```

### Y el demo del sistema, en `piezas/demo-prisma/`

El video de 1:50 que recorre Dashboard, Tracking y el ACM completo hasta la ficha del
cliente, con voz y música. **Se regenera con cuatro comandos** — está pensado para que
cuando cambie una pantalla se re-capture esa sola y el video se rearme, en vez de volver
a filmar todo a mano. La receta, el guion de la narración y los diez gotchas de captura
están en `piezas/demo-prisma/LEEME.md`.

La conversación se escribe en `data-variable-values` del host, con prefijos:

```
"messages": "recv:¿Sigue disponible?|sent:¡Hola! Sí. Son 78 m² con cochera.|recv:¿Cuánto piden?"
```

`recv:` = el cliente · `sent:` = el bot · también `emoji:`, `img`, `card:Título~dominio`.
Otras variables: `contact` (nombre del header), `beat` (segundos entre mensajes), `dots`
(puntitos de escribiendo), `receipt` (tildes de leído), `unread`.

**Lo que se cambió del original**, todo en un bloque marcado `TEMA WHATSAPP + VAKDOR`:

| | iMessage (original) | WhatsApp + Vakdor |
|---|---|---|
| Burbuja recibida | `#242428` | `#202C33` |
| Burbuja enviada | `#0a80f8` azul | `#005C4B` verde |
| Fondo | `#000` | `#0A0F1A` (la marca) |
| Avatar | verde `#9ce474` | **cobre `#C07C41`** |
| Cabecera | avatar y nombre **centrados** | **a la izquierda**, con "en línea" |
| Recibo | texto "Delivered" | **✓✓ celeste `#53BDEB`** |
| Barra inferior | "Message" | "Escribí un mensaje" |
| Marca | — | chip de sistema "🔒 Atendido por PRISMA IA · VAKDOR" |

⚠️ **Las colas de burbuja son círculos tapados con el color del fondo.** Si se cambia el fondo
del `#root` hay que cambiar también los dos `::after` (`.cht-tail-recv::after` y
`.cht-tail-sent::after`) o queda un cuadradito del color viejo pegado a cada burbuja.

⚠️ **La firma de marca NO puede ir abajo.** Se probó y falla de las dos formas: al fondo del
cuadro cae en la danger zone (y ≥ 1690, lo tapan IG y TikTok), y subida un poco se monta encima
de la última burbuja, porque el hilo crece **desde abajo hacia arriba**. Por eso la marca va en
el **chip de sistema arriba**, que es un elemento que WhatsApp ya tiene y queda a y≈375.
La barra de escribir sí puede quedar en la danger zone: es decoración, no dato.

Lo que `chat-thread` trae y `ChatMockup` no: barra de estado, tarjetas de link, filas de emoji
grande, y las alturas **medidas al montar** — no estimadas por cantidad de caracteres, que es la
constante frágil de `ChatMockup`.

---

## 5. Los otros gotchas

### ⏱️ El peaje de 45 segundos en CADA render (el más caro)

**Todo elemento con `data-composition-id` tiene que registrar una timeline.** Si alguno no la
registra, el render **espera 45 segundos** antes de seguir, y avisa:

```
[sub_timeline_readiness_timeout] Sub-composition timelines did not become ready within 45000ms
```

**El mensaje engaña**: dice *sub-composition*, pero el chequeo recorre **todos** los elementos
con `data-composition-id`, incluida la raíz. Lo más común es que el que falta sea **la raíz del
host**, que no anima nada por sí misma.

**La solución es un atributo en la raíz:** `data-no-timeline`.

Medido sobre el mismo video de 2 segundos:

| | Tiempo | Salida |
|---|---|---|
| Sin `data-no-timeline` | **2 min 11 s** | 89,2 KB |
| Con `data-no-timeline` | **49 s** | 89,2 KB (idéntica) |

El render sale igual: son 45 segundos tirados a la basura. Y no depende del largo del video —
un video de 2 segundos y uno de 2 minutos pagan el mismo peaje.

### Los otros gotchas

| Gotcha | El detalle |
|---|---|
| **La ruta del sub-componente es relativa al `index.html`** | Va `compositions/components/chat-thread.html`, **no** `components/…`. Con la ruta mal, `check` lo agarra y lo dice claro. Otra razón para correr `check` siempre. |
| **Abre ventanas negras de cmd** | Levanta 4 workers de Chrome + ffmpeg y en Windows cada uno aparece como una consola negra. **No está colgado: está renderizando.** Se cierran solas al terminar. |
| **`--skip-skills` no cumple** | Instaló igual 9 skills en `C:\Users\LENOVO\.claude\skills\` (5,8 MB). Están puestas a propósito — dan `/hyperframes` y compañía. Pero el flag no hace lo que dice. |
| **Avisa por la memoria con 2+ workers** | `2 capture workers may exceed this process's V8 heap`. Con 14,8 GB en la máquina no rompió nada. Si alguna vez muere con *"JavaScript heap out of memory"*: `--workers 1`. |
| **Carga GSAP desde un CDN** | Necesita internet **al renderizar**, no solo al instalar. Con el wifi de la casa esto no molesta nunca; solo importa si el wifi se corta justo en medio de un render largo. Si pasa, se baja el `gsap.min.js` al slot y se apunta el `<script>` al archivo local. |
| **Telemetría prendida de fábrica** | Se apagó con `hyperframes telemetry disable`. Si alguna vez se reinstala en otra máquina, repetirlo. |
| **No encuentra el whisper de la casa** | Busca un binario `whisper-cli`; el de acá es `C:\whisper-cpp\main.exe` (build viejo). `doctor` lo marca en rojo. **No importa**: la transcripción la sigue haciendo el motor propio. |

---

## 6. Cuándo NO usarlo

Para todo lo que toca **video grabado a cámara**, gana `studio.mjs` y no se discute: movimiento de
cámara medido, tonemap HDR, `--limpiar` con VMAF, máscaras de privacidad, mezcla en LUFS con
sidechain, corte por silencios, danger zones. HyperFrames **no hace nada de eso**. Hace gráficos.

Y para las piezas de marca que **ya existen en Remotion** (`PropertyReel`, `EditedReel`,
`ChatMockup`), no se reescriben porque sí. HyperFrames es para **las que vienen**.
