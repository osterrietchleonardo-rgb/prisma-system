# Setup de vakdor-video (super skill) — idempotente

Corré esto una vez (o cuando falte algo). Todo es verificable con comandos reales.
Nada de esto toca el código de PRISMA-SYSTEM: son binarios/paquetes globales + el motor de
render que vive en `Prisma - MK\_motor-video\`.

## 1. Whisper.cpp (ASR del Modo C) — normalmente YA instalado por los Modos A/B
- Binario: `C:\whisper-cpp\main.exe`  ·  Modelo: `C:\whisper-cpp\ggml-medium.bin`
- Verificar: `ls C:\whisper-cpp\main.exe C:\whisper-cpp\ggml-medium.bin`
- Si falta: `node "…\Prisma - MK\_motor-video\transcribe-srt.mjs" --prewarm --model=medium`
- Se instala en `C:\whisper-cpp` (ruta SIN espacios) a propósito: el instalador de
  whisper.cpp usa `Expand-Archive` sin comillas y se rompe con paths con espacios.

## 2. Python deps del Modo C (helpers)
- `python -m pip install -r requirements.txt`   (pillow, numpy)
- Verificar: `python -c "import PIL, numpy; print('py ok')"`
- Python 3.14: si pillow/numpy intentan compilar, forzar wheels:
  `python -m pip install --only-binary=:all: pillow numpy`

## 3. Animaciones disponibles (Modo C, opcionales por video)
Las 4 vías están listas; se elige por slot. Ninguna es obligatoria.
- **PIL** (tarjetas simples): ya cubierto por pillow (import PIL).
- **Remotion** (overlays con estado React): motor ya instalado en `Prisma - MK\_motor-video\node_modules`.
- **Manim** (diagramas/ecuaciones): se instala bajo **Python 3.12** (en 3.14 fallan las wheels
  de moderngl/glcontext). Instalar: `py -3.12 -m pip install --user manim`.
  Invocar los slots Manim con: `py -3.12 -m manim -qh scene.py <Clase>`.
  (Ecuaciones con LaTeX es opcional; los diagramas básicos andan sin LaTeX.)
- **HyperFrames** (motion HTML/CSS/GSAP, WebM alpha): `npx --yes hyperframes --help` (Node 22+, tenemos 24).

## 4. Descargas de YouTube (opcional, Modo C)
- `python -m pip install yt-dlp`
- Invocar con `python -m yt_dlp ...` (el .exe no queda en PATH; el módulo sí anda).

## 5. ffmpeg / node — ya presentes
- `ffmpeg -version`  (8.1.1)  ·  `ffprobe -version`  ·  `node --version` (v24)
- Los helpers de producción (`prep`, `frame_map`, `privacy`, `mix_audio`, `export`) **no
  necesitan nada extra**: solo ffmpeg/ffprobe y la librería estándar de Python.
- Filtros de ffmpeg que se usan y conviene tener (los trae el build full de gyan.dev):
  `gblur`, `ebur128`, `loudnorm`, `sidechaincompress`, `volumedetect`, `silencedetect`, `ass`.
  Verificar: `ffmpeg -hide_banner -filters | grep -E "gblur|ebur128|sidechaincompress"`

## 6. Tests de los helpers
```
python -m pytest tests/ -q
```
Son todos de funciones puras (no tocan ffmpeg ni disco): corren en menos de un segundo.

## Verificación completa (una línea)
```
python -c "import PIL, numpy; print('py ok')" && python -m yt_dlp --version && py -3.12 -m manim --version && node --version && ls C:\whisper-cpp\main.exe
```
Debe imprimir: `py ok`, versión de yt-dlp, `Manim Community v0.20.x`, `v24.x`, y el path del binario whisper.

## Nota sobre `auto-editor`
La skill **no lo usa** y no hace falta instalarlo. El corte de silencios a ciegas se reemplazó
por el corte por EDL (límites de palabra + padding), que no parte palabras. `prep.py` te dice
cuándo el material ya viene editado y no hay nada que cortar.
