# Slots Manim (Modo C)

Manim sirve para diagramas formales, máquinas de estado, derivaciones de ecuaciones, morphs de
grafo — cosas que se explican mejor con figuras animadas precisas. En Windows corre bajo
**Python 3.12** (en 3.14 fallan las wheels de moderngl). Instalado: Manim Community v0.20.1.

> Nota: video-use vendía una sub-skill `manim-video`; acá usamos Manim directo con esta guía
> (misma capacidad, sin dependencia de un paquete que no tenemos).

## Armar un slot

1. Crear `edit/animations/slot_<id>/scene.py` con una escena Manim. Ejemplo mínimo:

```python
from manim import *

class Reveal(Scene):
    def construct(self):
        self.camera.background_color = "#0A0F1A"   # fondo de marca
        cobre = "#C07C41"
        title = Text("Dependencia operativa", color=WHITE, font="Inter").scale(0.9)
        bar = Line(LEFT * 3, RIGHT * 3, color=cobre, stroke_width=8)
        self.play(Write(title), run_time=1.2, rate_func=rate_functions.ease_out_cubic)
        self.play(Create(bar.next_to(title, DOWN, buff=0.4)), run_time=0.8)
        self.wait(1.2)   # hold del frame final >= 1s
```

2. Renderizar a 1080p (o el tamaño del video base):

```bash
py -3.12 -m manim -qh --resolution 1920,1080 --fps 30 scene.py Reveal -o render.mp4
```
- `-qh` = alta calidad. El mp4 sale en `media/videos/scene/1080p30/render.mp4` (o donde diga la config).
- Para **fondo transparente** (overlay con alpha): agregá `-t` y exportá `.mov`/`.webm`:
  `py -3.12 -m manim -qh -t --format=webm scene.py Reveal`.

3. Verificar duración y dimensiones:
```bash
ffprobe -v error -show_entries format=duration:stream=width,height -of default=nw=1 render.mp4
```

4. Apuntar el overlay del EDL al mp4/webm resultante:
`{"file": "edit/animations/slot_<id>/render.mp4", "start_in_output": <s>, "duration": <s>}`.

## Gotchas

- **Ecuaciones (LaTeX):** `MathTex`/`Tex` necesitan una instalación de LaTeX (MiKTeX/TeX Live).
  Los diagramas con `Text`, formas y grafos andan **sin** LaTeX. Si hace falta LaTeX y no está,
  usar `Text` en vez de `Tex`, o instalar MiKTeX.
- **Fuente Inter:** si Manim no la encuentra, cae a la default; para marca, instalar Inter en el
  sistema o usar `Text(..., font="Arial")` como fallback.
- **Easing:** usar `rate_functions.ease_out_cubic` / `ease_in_out_cubic` (nunca linear).
- Respetar las reglas universales de `animations.md` (duración, hold final, sync del payoff).
