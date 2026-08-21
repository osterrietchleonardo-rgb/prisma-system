# Demo de PRISMA — cómo se regenera

Video de 1:50, horizontal 1920×1080, con voz y música. Recorre tres momentos del
sistema: Dashboard, Tracking Performance y el ACM completo hasta la ficha del cliente.

**Hecho y verificado el 21-ago-2026.** Todo local: cero costo de API.

> **Para qué existe esto:** la razón de capturar con Playwright en vez de grabar a mano
> es que cuando cambie una pantalla se re-captura ESA sola y el video se rearma. Si hay
> que volver a filmar todo con el mouse, el demo se pone viejo y no se actualiza nunca.

---

## Lo que hace falta

| | |
|---|---|
| PRISMA corriendo | `PORT=3010 npm run dev` desde `PRISMA-SYSTEM` |
| Credenciales | `EMAIL` y `PASSWORD` en `.env.local` (director de PRISMAIA - VAKDOR) |
| Playwright | viene con `@playwright/cli` global; el navegador con `playwright install chromium` |
| Voz | `py -3.12 -m pip install --user kokoro-onnx soundfile` |
| HyperFrames | global (`npm i -g hyperframes`), para las placas de marca |

**El TTS necesita que le digan qué Python usar:**

```bash
export HYPERFRAMES_PYTHON="C:\Python312\python.exe"
```

Sin eso dice *"kokoro-onnx no está instalado"* aunque lo esté.

---

## Los cuatro pasos

**1. Las pantallas sueltas** (Dashboard y Tracking):

```bash
node capturar.mjs              # las 5 pantallas
node capturar.mjs 1-dashboard  # solo una
```

**2. El ACM completo** — crea un ACM REAL y gasta créditos de IA:

```bash
MSYS_NO_PATHCONV=1 node acm-limpio.mjs
```

Al final imprime el enlace de la ficha pública. **Anotalo: hace falta en el paso 3.**

**3. La ficha del cliente**, de la carátula al final:

```bash
MSYS_NO_PATHCONV=1 node ficha-scroll.mjs "<enlace de la ficha>" 34
```

**4. Las placas de marca** (parado en `placa/`):

```bash
hyperframes render --gpu -o out/c1.mp4 --variables '{"kicker":"01 · Dashboard","titulo":"...","bajada":"..."}'
```

La duración se cambia en `data-duration` del `index.html` — **no se puede pasar por
variable**, se lee al compilar.

---

## El armado

La regla: **la imagen se corta a la medida de la voz, no al revés.** Primero se genera
la narración, se miden los bloques, y recién ahí se decide la velocidad de cada tramo.

```
placa intro  8,4 s   ← voz v1 (7,6 s)
placa 01     2,5 s
dashboard   11,9 s   ← voz v2 (12,2 s)   velocidad 1,0×
placa 02     2,5 s
tracking     8,4 s   ← voz v3 (8,2 s)    velocidad 1,6×
placa 03     2,5 s
ACM         26,9 s   ← voz v4 (20,9 s)   velocidad 8,5× (desde el segundo 33)
revisión    16,6 s   ← voz v5 (15,5 s)   velocidad 7,0×
ficha       27,9 s   ← voz v6 (12,3 s)   velocidad 1,5×
placa final  3,6 s   ← voz v7 (2,4 s)
```

Los textos de la narración están en `voz/v1.txt` … `v7.txt`. Se generan con:

```bash
hyperframes tts --text-file voz/v4.txt --voice ef_dora --out voz/v4.wav
```

`ef_dora` es la **única** voz en español del motor, y es neutra, no rioplatense.
Sirve de maqueta; para un cliente va la voz de Leonardo sobre este mismo guion.

Mezcla: la música baja sola cuando entra la voz (`sidechaincompress`), y el conjunto
se normaliza a **−14 LUFS**. Medido en la entrega: −15,2 LUFS, voz a −18 dB y música
sola a −29,5 dB. Once decibeles de separación.

---

## Los gotchas, que es lo que costó encontrar

| Gotcha | El detalle |
|---|---|
| **La ficha no baja con `window.scrollTo`** | Scrollea un contenedor interno, y encima tiene `scroll-behavior: smooth` de CSS, que pelea con la animación cuadro a cuadro: recorría 2.040 de 5.907 px y parecía que la ficha no tenía contenido. Hay que **apagar `scrollBehavior` antes de mover nada**. Está resuelto en `ficha-scroll.mjs`. |
| **El barrio cambia de placeholder** | Arranca en `"Cargando barrios…"` y pasa a `"Escribí para buscar. Ej: Recoleta"`. Hay que esperar al segundo. Y las opciones son `<button>`, no `<li>`. |
| **Los inputs de texto no tienen `type`** | `input[type="text"]` **no los encuentra**. Se los toma por placeholder. |
| **La casilla del comparable no es un checkbox** | Es `button[aria-label="Agregar a la ficha"]`. |
| **La ruta del sub-componente** | Es relativa al `index.html`: `compositions/components/x.html`, no `components/x.html`. |
| **`data-no-timeline` en la raíz** | Sin eso, cada render de placa espera **45 segundos** de más. Medido: 2m11s → 49s. |
| **Los datos cargan después** | `networkidle` no alcanza: hay que esperar a que desaparezcan los esqueletos (`animate-pulse`) o se filma la pantalla vacía. El dashboard además necesita entrar 8 s más tarde. |
| **Git Bash rompe las rutas** | `node script.mjs /director/acm` se convierte en `C:/Program Files/Git/director/acm`. Va con `MSYS_NO_PATHCONV=1`. |
| **`/auth/login` se cae con 404** | Pasó dos veces editando la app. Se arregla reiniciando el server de desarrollo. |
| **Las fichas se borran con su ACM** | Si se limpian los ACM de prueba, el enlace público queda en 404. El video ya grabado no se ve afectado. |

---

## Criterio, para que el demo siga vendiendo

- **Nada de formularios vacíos.** Un ACM sin comparables o un Tutor sin respuesta no
  muestra lo que el sistema *hace*: muestra lo que hay que llenar. Si una pantalla no
  tiene datos, no entra.
- **El login no se muestra dos veces.** El espectador ya "entró" en el capítulo 1.
- **La lista de "Mis ACM" no entra**: si hay pruebas repetidas, se ven ocho renglones
  iguales y el demo se delata.
- **La ficha del cliente va sin acelerar de más.** Es el remate y tiene que respirar.
- **Se elige comparable con foto cargada.** Una imagen rota en la ficha se ve pésimo.
