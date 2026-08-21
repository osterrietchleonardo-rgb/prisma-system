# Animaciones del Modo C — las 4 vías (todas disponibles)

El Modo C puede sumar overlays de animación. **Vos decidís por video** si agregás una o no,
pero las 4 vías están instaladas y listas (ver `install.md`). Se elige el motor por slot.
Cada animación = un slot en `edit/animations/slot_<id>/`, un archivo de salida único.

| Vía | Para qué | Cómo se corre | Estado |
|---|---|---|---|
| **PIL + PNG + ffmpeg** | tarjetas simples: contadores, typewriter, barras, reveals | script Python con Pillow → PNGs → `ffmpeg` los arma | listo (pillow) |
| **Remotion** | overlays con estado React / sistema de marca existente | motor en `Prisma - MK\_motor-video\node_modules` | listo |
| **HyperFrames** ⭐ | overlays en HTML/CSS/GSAP con **WebM alpha**, UI de producto, kinetic typography, y **un catálogo de 154 bloques + 219 componentes** ya hechos (incluido el **chat de WhatsApp de marca**, ya armado en `piezas/chat-whatsapp/`) | `hyperframes ...` (instalado global) — receta y gotchas en **`hyperframes.md`** | listo (v0.8.6, probado 21-ago-2026) |
| **Manim** | diagramas formales, máquinas de estado, ecuaciones, morphs de grafo | `py -3.12 -m manim -qh scene.py <Clase>` (ver `manim.md`) | listo (v0.20.1) |

El overlay del EDL apunta al mp4/webm renderizado del slot:
`{"file": "edit/animations/slot_1/render.mp4", "start_in_output": <s>, "duration": <s>}`.

> ⚠️ **Si el overlay es un WebM con alpha, el ffmpeg que lo compone necesita `-c:v libvpx-vp9`
> ANTES del `-i` del webm.** Sin ese flag ffmpeg descarta la transparencia, **no imprime ni un
> warning**, y el overlay sale como un cuadrado negro.
> **Se comprueba en la línea de entrada de ffmpeg: `yuva420p` = tiene alpha; `yuv420p` = ya se
> perdió.** Una letra. Detalle en `hyperframes.md` §1.

## Reglas universales (aplican a las 4 vías)

- **Duración (sync a narración):** el espectador tiene que parsear a 1×. Piso ~3s, típico 5–7s
  tarjeta simple, 8–14s diagrama complejo. Sobre voz: `duración ≥ narración + 1s`.
- **Beat-synced** (montaje rápido/música): 0.5–2s ok (acentos, no información).
- **Hold del frame final ≥ 1s** antes del corte (universal).
- **Nunca revelar 2 cosas nuevas a la vez** — el ojo no sigue dos cosas nuevas juntas. Una, pausa, la siguiente.
- **Sync del payoff:** conseguí el timestamp de la palabra-remate; arrancá el overlay
  `reveal_duration` segundos antes para que el frame de aterrizaje coincida con esa palabra.
- **Easing cubic, nunca linear** (linear se ve robótico):
  ```python
  def ease_out_cubic(t):    return 1 - (1 - t) ** 3
  def ease_in_out_cubic(t):
      return 4*t**3 if t < 0.5 else 1 - (-2*t + 2)**3 / 2
  ```
  `ease_out_cubic` para reveals simples; `ease_in_out_cubic` para trazos continuos.
- **Typing text:** centrar sobre el ancho del string COMPLETO, no del parcial (si no, el texto se corre a la izquierda).

## Paleta de marca por defecto (Vakdor)

Si el usuario no da otra, proponé esta y confirmá antes de construir:
- Fondo `#0A0F1A` (casi negro) · Título `#FFFFFF` · Texto `#B4BAC5` · Acento cobre `#C07C41`.
- Fuente Inter. ≤ 2 colores de acento, ~40% de espacio vacío, mínimo chrome. Look premium/moderno.

Fuente única de la marca: `assets/brand.json`. Para contenido de cliente (no Vakdor), usar la marca que corresponda.

## Brief del sub-agente de animación (10 puntos)

Cada animación es UN sub-agente despachado con el tool `Agent`, **en paralelo** (Regla Dura 10),
nunca secuencial. Cada prompt es self-contained (el sub-agente no tiene contexto del padre):

1. Objetivo en una frase: *"Construí UNA animación: [spec]. Nada más."*
2. Ruta de salida absoluta (`<edit>/animations/slot_<id>/render.mp4`).
3. Spec técnica exacta: resolución, fps, codec, pix_fmt, CRF, duración.
4. Paleta como valores concretos (RGB/hex) o referencia al sistema de marca.
5. Ruta de la fuente con índice si aplica.
6. Timeline frame-por-frame (qué pasa cuándo, con easing).
7. Anti-lista ("sin chrome, sin extras, sin títulos salvo que se pidan").
8. Patrón de código de referencia (copiar helpers inline, no importar entre slots).
9. Checklist de entrega (script, render, verificar duración con ffprobe, reportar).
10. **"No hagas preguntas. Si algo es ambiguo, elegí la interpretación más obvia y seguí."**

Un sub-agente = un archivo (nombres únicos; los agentes paralelos no se pisan).

## Setup por vía (comandos reales)

- **HyperFrames:** `init` en el slot → escribir el HTML → **`check`** (gratis, valida hasta el
  contraste del texto) → `render --format webm` para alpha. **Los 5 pasos exactos, los tiempos
  medidos, el catálogo de bloques y todos los gotchas están en `hyperframes.md`.** Leerlo antes de
  abrir el primer slot: uno hace fallar el trabajo en silencio y otro cuesta **45 segundos en
  cada render** (`data-no-timeline` en la raíz).
- **Remotion:** proyecto Remotion aislado en el slot (`npx create-video@latest` o dep local);
  `remotion render <Comp> render.mp4`; verificar con `ffprobe`.
- **Manim:** ver `manim.md`.
- **PIL:** script Python que genera PNGs numerados + `ffmpeg -framerate <fps> -i frame_%04d.png -c:v libx264 -pix_fmt yuv420p render.mp4`.
