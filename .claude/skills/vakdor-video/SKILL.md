---
name: vakdor-video
description: Experto en crear y EDITAR VIDEOS/reels con la identidad visual de Vakdor usando Remotion (video por código con React). Usar SIEMPRE que el usuario pida un reel, video de propiedad, video para redes (IG/TikTok), ficha en video, EDITAR un video crudo (sacar silencios, subtítulos, marca, recortes, transiciones) o cualquier pieza audiovisual de marca. Triggerea con "reel", "video", "editá este video", "sacá los silencios", "ponele subtítulos", "video de la propiedad", "para Instagram/TikTok". Es la hermana en video de vakdor-carousel: misma marca (brand.json), mismo destino (Prisma - MK), copy delegado a vakdor-copywriter.
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
