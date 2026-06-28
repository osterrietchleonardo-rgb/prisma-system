---
name: vakdor-video
description: Experto en crear VIDEOS/reels con la identidad visual de Vakdor usando Remotion (video por código con React). Usar SIEMPRE que el usuario pida un reel, video de propiedad, video para redes (IG/TikTok), ficha en video, o cualquier pieza audiovisual de marca. Triggerea con "reel", "video", "video de la propiedad", "para Instagram/TikTok", "ficha en video". Es la hermana en video de vakdor-carousel: misma marca (brand.json), mismo destino (Prisma - MK), copy delegado a vakdor-copywriter.
---

# Vakdor Video — Skill de Reels de Propiedades (Remotion)

Esta skill genera **videos verticales (1080x1920) listos para Instagram/TikTok** a partir de
las fotos y datos de una propiedad, con la marca Vakdor/PRISMA. El motor es **Remotion**
(video programático con React). La skill arma los datos y la marca; el render lo hace el motor.

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

## Paso 2 — Definir el contenido (mínimo de preguntas)

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

## Composiciones disponibles

- **`PropertyReel`** — reel vertical de una propiedad (intro de marca → fotos con Ken Burns y
  specs → outro con CTA y precio). Es la base; se puede extender con más plantillas
  (ej. "carrusel de mercado en video", "testimonios") agregando componentes en `engine\src\`
  y registrándolos en `engine\src\Root.tsx`.

## Detalle técnico del motor (`engine\`)

- `src\PropertyReel.tsx` — la composición (animaciones, Ken Burns, lower-thirds, logos).
- `src\brand.ts` + `brand.json` — colores de marca que consume la composición.
- `src\Root.tsx` / `src\index.ts` — registro de composiciones Remotion.
- `render.mjs` — wrapper que resuelve fotos y dispara el render (llama al CLI de Remotion por su
  JS directo con `node`, para no romper con los espacios de "Prisma - MK").
- `remotion.config.ts` — calidad de salida (H.264, CRF 18).
