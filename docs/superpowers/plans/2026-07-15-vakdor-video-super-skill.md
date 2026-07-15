# vakdor-video Super Skill — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir la skill `vakdor-video` en una super skill de video: sumar el **Modo C** (editor conversacional pro estilo *video-use*) con transcripción por **whisper.cpp** en vez de ElevenLabs, y hacer **multi-formato** (vertical/horizontal/cuadrado) los modos A y B — con todo el motor, referencias, assets y las 4 vías de animación incluidas.

**Architecture:** El Modo C corre con **Python + ffmpeg + whisper.cpp** (helpers en `helpers/`, salida en `edit/` junto al fuente). Los Modos A/B siguen en **Remotion** (motor copiado a `Prisma - MK\_motor-video\`), ahora parametrizados por `format` vía `calculateMetadata`. La transcripción reusa el binario ya instalado en `C:\whisper-cpp` (word-level con `-ml 1 -oj`). Documentación en `references/`, setup idempotente en `install.md`.

**Tech Stack:** Python 3.14, ffmpeg/ffprobe 8.1.1, whisper.cpp 1.5.5 (`C:\whisper-cpp\main.exe` + `ggml-medium.bin`), Pillow, numpy, Node 24 + Remotion, yt-dlp, manim, HyperFrames (npx).

## Global Constraints

- **Directorio de trabajo:** TODO se implementa en el worktree `C:\Users\LENOVO\Desktop\CODE\prisma-wt-vakdor-video`, rama `feat/vakdor-video-super-skill` (desde main). Nunca commitear en otra rama. Merge a main **solo con OK explícito de Leonardo**.
- **Skill dir:** `.claude/skills/vakdor-video/` (existente). Se AGREGA a la skill, no se reescribe lo que ya anda.
- **Regla de oro de salida (Modos A/B):** la skill LEE de PRISMA-SYSTEM y ESCRIBE solo en `Prisma - MK`. El motor Remotion se copia a `Prisma - MK\_motor-video\`.
- **Salida Modo C:** carpeta `edit/` **junto al video fuente** (no forzar a Prisma - MK).
- **Whisper, no ElevenLabs:** ninguna mención a `ELEVENLABS_API_KEY`. Binario en `C:\whisper-cpp` (ruta SIN espacios, ya instalado). Modelo default `ggml-medium.bin`, idioma default `es`.
- **12 Reglas Duras de producción** (video-use) son inquebrantables en el Modo C: subtítulos al FINAL de la cadena de filtros · extract por-segmento → concat lossless `-c copy` · fades de 30 ms en cada borde (`afade`) · overlays con `setpts=PTS-STARTPTS+T/TB` · SRT master con offsets de output-timeline · nunca cortar dentro de una palabra · padding 30–200 ms · ASR word-level verbatim (nunca SRT/frase) · cache de transcript por fuente · sub-agentes paralelos para múltiples animaciones · confirmar estrategia antes de ejecutar · todos los outputs de sesión en `edit/`.
- **Multi-formato:** `vertical`=1080×1920, `horizontal`=1920×1080, `cuadrado`=1080×1080. En Modos A/B, si no se pasa `--format`, la skill PREGUNTA antes de renderizar (no asume default).
- **Marca (colores):** fondo `#0A0F1A`, título `#FFFFFF`, texto `#B4BAC5`, acento cobre `#C07C41`, fuente Inter. Fuente única: `assets/brand.json`.
- **Windows/PowerShell:** paths con espacios entre comillas; scripts Python se corren con `python`. El motor Remotion se invoca por el JS del CLI con `node` (patrón existente) para no romper con "Prisma - MK".
- **TDD:** cada helper con lógica pura (parseo, cálculo de timeline, EDL) lleva su test `pytest` antes de la implementación. Lo visual (Remotion, render final) se verifica con `ffprobe` + inspección de frames.

---

## File Structure

```
.claude/skills/vakdor-video/
├── SKILL.md                         MODIFY  ← + sección MODO C, + nota multi-formato A/B
├── install.md                       CREATE  ← setup idempotente de TODO
├── requirements.txt                 CREATE  ← pillow, numpy (deps python de la skill)
├── references/
│   ├── video-use.md                 CREATE  ← playbook Modo C (12 Reglas Duras, proceso, EDL)
│   ├── animations.md                CREATE  ← 4 vías de animación + setup + brief sub-agente
│   ├── formats.md                   CREATE  ← formatos/plataformas/dimensiones
│   └── manim.md                     CREATE  ← guía de slot Manim (reemplaza el vendored)
├── helpers/
│   ├── whisper_parse.py             CREATE  ← función pura: JSON whisper → words (testeable)
│   ├── transcribe.py                CREATE  ← whisper.cpp word-level, cacheado
│   ├── transcribe_batch.py          CREATE  ← 4 workers en paralelo
│   ├── pack_transcripts.py          CREATE  ← transcripts/*.json → takes_packed.md
│   ├── timeline_view.py             CREATE  ← filmstrip + waveform PNG
│   ├── grade.py                     CREATE  ← color grade ffmpeg (presets + --filter)
│   ├── edl.py                       CREATE  ← modelo/validación EDL (testeable)
│   └── render.py                    CREATE  ← extract→concat→overlays→subs (Reglas Duras)
├── tests/
│   ├── test_whisper_parse.py        CREATE
│   ├── test_edl.py                  CREATE
│   └── test_render_helpers.py       CREATE
├── assets/brand.json                (existe)
└── engine/                          MODIFY  ← multi-formato en A y B
    ├── src/format.ts                CREATE  ← FORMATS + helper responsivo (scale unit)
    ├── src/PropertyReel.tsx         MODIFY  ← prop `format`, dimensiones y layout responsivos
    ├── src/EditedReel.tsx           MODIFY  ← prop `format`, dimensiones responsivas
    ├── src/Root.tsx                 MODIFY  ← width/height desde calculateMetadata
    ├── render.mjs                   MODIFY  ← acepta --format, lo pasa como prop
    └── edit.mjs                     MODIFY  ← acepta --format, lo pasa como prop
```

---

## Task 0: Setup e instalación idempotente

**Files:**
- Create: `.claude/skills/vakdor-video/install.md`
- Create: `.claude/skills/vakdor-video/requirements.txt`

**Interfaces:**
- Produces: entorno con `pillow`, `numpy` (para helpers), `yt-dlp`, `manim` instalados; whisper verificado; comandos de verificación documentados.

- [ ] **Step 1: Crear `requirements.txt`**

```
pillow>=10.4
numpy>=2.1
```

- [ ] **Step 2: Instalar deps python core y verificar que las wheels entran sin compilar (Python 3.14)**

Run:
```bash
python -m pip install -r ".claude/skills/vakdor-video/requirements.txt"
```
Expected: `Successfully installed pillow-... numpy-...` (wheels, sin build). Si numpy/pillow intentan compilar por 3.14, reintentar con `--only-binary=:all:` y si falla, fijar la última versión con wheel disponible.

- [ ] **Step 3: Instalar herramientas "disponibles" (animaciones + descargas)**

Run:
```bash
python -m pip install yt-dlp manim
```
Expected: ambas instalan. `manim` puede tirar warnings de LaTeX (solo hace falta LaTeX para ecuaciones; los diagramas básicos andan sin él).

- [ ] **Step 4: Pre-warm de HyperFrames (npx, sin instalar permanente)**

Run:
```bash
npx --yes hyperframes --help
```
Expected: imprime la ayuda del CLI (baja el paquete a la cache de npx). Si falla por versión de Node, anotar en install.md que HyperFrames pide Node 22+ (tenemos 24, OK).

- [ ] **Step 5: Verificar whisper.cpp ya instalado (no reinstalar)**

Run:
```bash
ls "C:/whisper-cpp/main.exe" "C:/whisper-cpp/ggml-medium.bin"
```
Expected: ambos existen. (Los instaló vakdor-video vía `@remotion/install-whisper-cpp`. NO reinstalar.)

- [ ] **Step 6: Escribir `install.md`** con el paso a paso idempotente

Contenido (documenta EXACTAMENTE lo anterior + verificaciones):
```markdown
# Setup de vakdor-video (super skill) — idempotente

Corre esto una vez (o cuando falte algo). Todo es verificable.

## 1. Whisper.cpp (ASR del Modo C) — YA instalado por los Modos A/B
- Binario: `C:\whisper-cpp\main.exe`  ·  Modelo: `C:\whisper-cpp\ggml-medium.bin`
- Verificar: `ls C:\whisper-cpp\main.exe C:\whisper-cpp\ggml-medium.bin`
- Si falta: `node "Prisma - MK\_motor-video\transcribe-srt.mjs" --prewarm --model=medium`

## 2. Python deps del Modo C
- `python -m pip install -r requirements.txt`   (pillow, numpy)
- Verificar: `python -c "import PIL, numpy; print('ok')"`

## 3. Animaciones disponibles (Modo C, opcionales por video)
- PIL: ya cubierto por pillow.
- Remotion: motor ya instalado en `Prisma - MK\_motor-video\node_modules`.
- Manim: `python -m pip install manim` · verificar `manim --version`.
- HyperFrames: `npx --yes hyperframes --help` (Node 22+, tenemos 24).
- yt-dlp (descargas YouTube): `python -m pip install yt-dlp` · verificar `yt-dlp --version`.

## 4. ffmpeg / node — ya presentes
- `ffmpeg -version` (8.1.1)  ·  `node --version` (v24)
```

- [ ] **Step 7: Verificar todo el setup**

Run:
```bash
python -c "import PIL, numpy; print('py ok')" && yt-dlp --version && manim --version && node --version
```
Expected: `py ok`, versión de yt-dlp, versión de manim, `v24.x`.

- [ ] **Step 8: Commit**

```bash
git add .claude/skills/vakdor-video/install.md .claude/skills/vakdor-video/requirements.txt
git commit -m "feat(vakdor-video): install.md idempotente + deps del Modo C (pillow/numpy/yt-dlp/manim)"
```

---

## Task 1: Parseo de whisper → words (función pura, testeable)

**Files:**
- Create: `.claude/skills/vakdor-video/helpers/whisper_parse.py`
- Test: `.claude/skills/vakdor-video/tests/test_whisper_parse.py`

**Interfaces:**
- Produces:
  - `parse_whisper_json(data: dict) -> list[dict]` → lista de `{"word": str, "start": float, "end": float}` en segundos, ordenada, sin entradas vacías.
  - `group_into_phrases(words: list[dict], gap: float = 0.5) -> list[dict]` → `{"start","end","text"}` cortando frase cuando el silencio entre palabras ≥ `gap`.

- [ ] **Step 1: Escribir el test que falla**

```python
# tests/test_whisper_parse.py
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "helpers"))
from whisper_parse import parse_whisper_json, group_into_phrases

WHISPER_SAMPLE = {
    "transcription": [
        {"offsets": {"from": 0, "to": 420}, "text": " Hola"},
        {"offsets": {"from": 420, "to": 900}, "text": " mundo"},
        {"offsets": {"from": 2000, "to": 2500}, "text": " nuevo."},
        {"offsets": {"from": 2500, "to": 2600}, "text": "   "},  # vacío -> se descarta
    ]
}

def test_parse_words_seconds_and_strip():
    words = parse_whisper_json(WHISPER_SAMPLE)
    assert words == [
        {"word": "Hola", "start": 0.0, "end": 0.42},
        {"word": "mundo", "start": 0.42, "end": 0.9},
        {"word": "nuevo.", "start": 2.0, "end": 2.5},
    ]

def test_group_phrases_breaks_on_gap():
    words = parse_whisper_json(WHISPER_SAMPLE)
    phrases = group_into_phrases(words, gap=0.5)
    # gap entre "mundo"(end 0.9) y "nuevo"(start 2.0) = 1.1s >= 0.5 -> 2 frases
    assert len(phrases) == 2
    assert phrases[0]["text"] == "Hola mundo"
    assert phrases[0]["start"] == 0.0 and phrases[0]["end"] == 0.9
    assert phrases[1]["text"] == "nuevo."
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `python -m pytest ".claude/skills/vakdor-video/tests/test_whisper_parse.py" -v`
Expected: FAIL (`ModuleNotFoundError: whisper_parse`).

- [ ] **Step 3: Implementar `whisper_parse.py`**

```python
# helpers/whisper_parse.py
"""Parseo puro de la salida JSON de whisper.cpp (main.exe -oj / -ml 1) a words."""
from __future__ import annotations


def parse_whisper_json(data: dict) -> list[dict]:
    """whisper.cpp -oj: {"transcription":[{"offsets":{"from":ms,"to":ms},"text":" w"}]}.
    Devuelve [{"word","start","end"}] en segundos, sin vacíos, ordenado por start."""
    out: list[dict] = []
    for seg in data.get("transcription", []):
        text = (seg.get("text") or "").strip()
        if not text:
            continue
        off = seg.get("offsets") or {}
        start = round((off.get("from", 0) or 0) / 1000.0, 3)
        end = round((off.get("to", 0) or 0) / 1000.0, 3)
        out.append({"word": text, "start": start, "end": end})
    out.sort(key=lambda w: w["start"])
    return out


def group_into_phrases(words: list[dict], gap: float = 0.5) -> list[dict]:
    """Agrupa words en frases; corta cuando el silencio entre palabras >= gap."""
    phrases: list[dict] = []
    cur: list[dict] = []
    for w in words:
        if cur and (w["start"] - cur[-1]["end"]) >= gap:
            phrases.append(_flush(cur))
            cur = []
        cur.append(w)
    if cur:
        phrases.append(_flush(cur))
    return phrases


def _flush(group: list[dict]) -> dict:
    return {
        "start": group[0]["start"],
        "end": group[-1]["end"],
        "text": " ".join(g["word"] for g in group),
    }
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `python -m pytest ".claude/skills/vakdor-video/tests/test_whisper_parse.py" -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/vakdor-video/helpers/whisper_parse.py .claude/skills/vakdor-video/tests/test_whisper_parse.py
git commit -m "feat(vakdor-video): parseo puro whisper.cpp -> words + frases (Modo C)"
```

---

## Task 2: `transcribe.py` — whisper.cpp word-level con cache

**Files:**
- Create: `.claude/skills/vakdor-video/helpers/transcribe.py`

**Interfaces:**
- Consumes: `whisper_parse.parse_whisper_json`, `group_into_phrases`.
- Produces:
  - CLI: `python transcribe.py <video> --edit-dir <dir> [--lang es] [--model medium] [--whisperdir C:\whisper-cpp]`.
  - Escribe `<edit-dir>/transcripts/<stem>.json` con `{"source","language","source_mtime","source_size","words":[...],"phrases":[...]}`.
  - Función `transcribe_file(video, edit_dir, lang="es", model="medium", whisperdir=r"C:\whisper-cpp") -> str` (ruta del json de cache). Cache-hit si `source_mtime`+`source_size` no cambiaron.

- [ ] **Step 1: Implementar `transcribe.py`**

```python
# helpers/transcribe.py
"""Transcribe un video a word-level JSON con whisper.cpp local (gratis, offline, es).
Reemplaza al transcribe.py de ElevenLabs Scribe. Cacheado por fuente (Regla Dura 9)."""
from __future__ import annotations
import argparse, json, os, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(__file__))
from whisper_parse import parse_whisper_json, group_into_phrases

DEFAULT_WHISPER = r"C:\whisper-cpp"


def _cache_valid(cache_path: str, video: str) -> bool:
    if not os.path.exists(cache_path):
        return False
    try:
        meta = json.load(open(cache_path, encoding="utf-8"))
    except Exception:
        return False
    st = os.stat(video)
    return meta.get("source_mtime") == int(st.st_mtime) and meta.get("source_size") == st.st_size


def transcribe_file(video: str, edit_dir: str, lang: str = "es",
                    model: str = "medium", whisperdir: str = DEFAULT_WHISPER) -> str:
    stem = os.path.splitext(os.path.basename(video))[0]
    tdir = os.path.join(edit_dir, "transcripts")
    os.makedirs(tdir, exist_ok=True)
    cache_path = os.path.join(tdir, f"{stem}.json")
    if _cache_valid(cache_path, video):
        print(f"[whisper] cache HIT: {cache_path}")
        return cache_path

    main_exe = os.path.join(whisperdir, "main.exe")
    model_bin = os.path.join(whisperdir, f"ggml-{model}.bin")
    for p in (main_exe, model_bin):
        if not os.path.exists(p):
            raise FileNotFoundError(f"whisper.cpp falta: {p} (ver install.md)")

    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, "in16k.wav")
        subprocess.run(["ffmpeg", "-i", video, "-ar", "16000", "-ac", "1", "-y", wav],
                       check=True, capture_output=True)
        out_base = os.path.join(tmp, "out")
        # -ml 1 => ~una palabra por segmento (word-level verbatim, Regla Dura 8)
        subprocess.run([main_exe, "-m", model_bin, "-l", lang, "-ml", "1",
                        "-oj", "-of", out_base, wav], check=True, capture_output=True)
        data = json.load(open(out_base + ".json", encoding="utf-8"))

    words = parse_whisper_json(data)
    phrases = group_into_phrases(words, gap=0.5)
    st = os.stat(video)
    payload = {
        "source": stem, "source_path": os.path.abspath(video),
        "language": lang, "source_mtime": int(st.st_mtime), "source_size": st.st_size,
        "words": words, "phrases": phrases,
    }
    json.dump(payload, open(cache_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"[whisper] {stem}: {len(words)} words, {len(phrases)} frases -> {cache_path}")
    return cache_path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--edit-dir", required=True)
    ap.add_argument("--lang", default="es")
    ap.add_argument("--model", default="medium")
    ap.add_argument("--whisperdir", default=DEFAULT_WHISPER)
    a = ap.parse_args()
    transcribe_file(a.video, a.edit_dir, a.lang, a.model, a.whisperdir)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Prueba real con un video corto**

Genera un clip de prueba con voz (o usa uno que tengas). Si no hay, crear 3s de tono no sirve (sin habla); usar un video real de Leonardo. Con un video real `muestra.mp4`:
Run:
```bash
python ".claude/skills/vakdor-video/helpers/transcribe.py" "C:/ruta/muestra.mp4" --edit-dir "C:/ruta/edit"
```
Expected: imprime `[whisper] muestra: N words, M frases -> .../transcripts/muestra.json`. Abrir el JSON: `words` con `start<end` crecientes y texto en español.

- [ ] **Step 3: Verificar el cache (segunda corrida no re-transcribe)**

Run: el mismo comando otra vez.
Expected: `[whisper] cache HIT: ...` (no vuelve a llamar a whisper).

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/vakdor-video/helpers/transcribe.py
git commit -m "feat(vakdor-video): transcribe.py word-level con whisper.cpp + cache (reemplaza ElevenLabs)"
```

---

## Task 3: `transcribe_batch.py` — transcripción en paralelo

**Files:**
- Create: `.claude/skills/vakdor-video/helpers/transcribe_batch.py`

**Interfaces:**
- Consumes: `transcribe.transcribe_file`.
- Produces: CLI `python transcribe_batch.py <videos_dir> --edit-dir <dir> [--lang es] [--model medium] [--workers 4]`. Transcribe todos los videos (`.mp4 .mov .mkv .webm .m4v`) del dir. **Nota:** whisper.cpp ya usa varios hilos; se limita a 4 workers para no saturar. En Windows los .wav temporales son por-proceso (TemporaryDirectory), sin colisión.

- [ ] **Step 1: Implementar**

```python
# helpers/transcribe_batch.py
"""Transcribe en paralelo todos los videos de un directorio (multi-take)."""
from __future__ import annotations
import argparse, os, sys
from concurrent.futures import ThreadPoolExecutor, as_completed
sys.path.insert(0, os.path.dirname(__file__))
from transcribe import transcribe_file

EXTS = {".mp4", ".mov", ".mkv", ".webm", ".m4v", ".avi"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("videos_dir")
    ap.add_argument("--edit-dir", required=True)
    ap.add_argument("--lang", default="es")
    ap.add_argument("--model", default="medium")
    ap.add_argument("--workers", type=int, default=4)
    a = ap.parse_args()

    vids = [os.path.join(a.videos_dir, f) for f in sorted(os.listdir(a.videos_dir))
            if os.path.splitext(f)[1].lower() in EXTS]
    if not vids:
        print("No hay videos en", a.videos_dir); return
    print(f"Transcribiendo {len(vids)} videos con {a.workers} workers...")
    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        futs = {ex.submit(transcribe_file, v, a.edit_dir, a.lang, a.model): v for v in vids}
        for fut in as_completed(futs):
            v = futs[fut]
            try:
                fut.result()
            except Exception as e:
                print(f"[ERROR] {os.path.basename(v)}: {e}")
    print("Batch completo.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Prueba real (si hay carpeta multi-take) o smoke test con 1 archivo**

Run:
```bash
python ".claude/skills/vakdor-video/helpers/transcribe_batch.py" "C:/ruta/tomas" --edit-dir "C:/ruta/edit"
```
Expected: transcribe cada archivo (o "cache HIT" si ya estaban). Sin excepciones.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/vakdor-video/helpers/transcribe_batch.py
git commit -m "feat(vakdor-video): transcribe_batch.py (transcripción paralela multi-take)"
```

---

## Task 4: `pack_transcripts.py` — vista `takes_packed.md`

**Files:**
- Create: `.claude/skills/vakdor-video/helpers/pack_transcripts.py`

**Interfaces:**
- Consumes: los JSON de `<edit-dir>/transcripts/*.json` (con `phrases`).
- Produces: CLI `python pack_transcripts.py --edit-dir <dir>` → escribe `<edit-dir>/takes_packed.md`. Una sección por take, cada frase con su rango `[start-end]`.

- [ ] **Step 1: Implementar**

```python
# helpers/pack_transcripts.py
"""transcripts/*.json -> takes_packed.md (vista de lectura del editor, phrase-level)."""
from __future__ import annotations
import argparse, glob, json, os


def _fmt(t: float) -> str:
    return f"{t:06.2f}"


def build(edit_dir: str) -> str:
    tdir = os.path.join(edit_dir, "transcripts")
    files = sorted(glob.glob(os.path.join(tdir, "*.json")))
    lines = ["# takes_packed — transcripciones phrase-level (whisper.cpp)\n"]
    for f in files:
        d = json.load(open(f, encoding="utf-8"))
        phrases = d.get("phrases", [])
        dur = phrases[-1]["end"] if phrases else 0.0
        lines.append(f"\n## {d.get('source','?')}  (duración: {dur:.1f}s, {len(phrases)} frases)")
        for p in phrases:
            lines.append(f"  [{_fmt(p['start'])}-{_fmt(p['end'])}] {p['text']}")
    out = os.path.join(edit_dir, "takes_packed.md")
    open(out, "w", encoding="utf-8").write("\n".join(lines) + "\n")
    print(f"Escrito {out} ({len(files)} takes)")
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--edit-dir", required=True)
    build(ap.parse_args().edit_dir)
```

- [ ] **Step 2: Prueba real (usa los transcripts de Task 2/3)**

Run: `python ".claude/skills/vakdor-video/helpers/pack_transcripts.py" --edit-dir "C:/ruta/edit"`
Expected: crea `takes_packed.md`; abrirlo y ver una sección por take con líneas `[00.00-00.90] Hola mundo`.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/vakdor-video/helpers/pack_transcripts.py
git commit -m "feat(vakdor-video): pack_transcripts.py -> takes_packed.md (vista de edición)"
```

---

## Task 5: `edl.py` — modelo y validación del EDL (testeable)

**Files:**
- Create: `.claude/skills/vakdor-video/helpers/edl.py`
- Test: `.claude/skills/vakdor-video/tests/test_edl.py`

**Interfaces:**
- Produces:
  - `load_edl(path: str) -> dict` (lee y valida).
  - `validate_edl(edl: dict) -> list[str]` → lista de errores (vacía = OK). Chequea: `sources` existe, cada range tiene `source` (∈ sources), `start<end`, overlays con `start_in_output>=0` y `duration>0`.
  - `total_duration(edl: dict) -> float` → suma de `(end-start)` de los ranges.
  - `master_srt_offsets(edl, transcripts) -> list[dict]` → subtítulos re-mapeados a la timeline de salida: `output_time = word.start - range.start + range_offset` (Regla Dura 5). Devuelve `[{"start","end","text"}]` a nivel palabra.

- [ ] **Step 1: Escribir el test que falla**

```python
# tests/test_edl.py
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "helpers"))
from edl import validate_edl, total_duration, master_srt_offsets

EDL = {
    "version": 1,
    "sources": {"A": "/x/A.mp4"},
    "ranges": [
        {"source": "A", "start": 2.0, "end": 4.0},
        {"source": "A", "start": 10.0, "end": 11.0},
    ],
    "overlays": [{"file": "o.mp4", "start_in_output": 0.0, "duration": 1.5}],
}

def test_validate_ok():
    assert validate_edl(EDL) == []

def test_validate_catches_bad_range_and_missing_source():
    bad = {"sources": {"A": "/x"}, "ranges": [
        {"source": "A", "start": 5, "end": 4},        # start>=end
        {"source": "B", "start": 0, "end": 1},        # source inexistente
    ]}
    errs = validate_edl(bad)
    assert any("start" in e for e in errs)
    assert any("B" in e for e in errs)

def test_total_duration():
    assert total_duration(EDL) == 3.0  # (4-2)+(11-10)

def test_master_srt_uses_output_timeline():
    transcripts = {"A": {"words": [
        {"word": "hola", "start": 2.2, "end": 2.6},   # dentro range0 (offset salida 0)
        {"word": "chau", "start": 10.5, "end": 10.9},  # dentro range1 (offset salida 2.0)
    ]}}
    subs = master_srt_offsets(EDL, transcripts)
    # "hola": 2.2 - 2.0 + 0.0 = 0.2 ; "chau": 10.5 - 10.0 + 2.0 = 2.5
    assert subs[0]["text"] == "hola" and abs(subs[0]["start"] - 0.2) < 1e-6
    assert subs[1]["text"] == "chau" and abs(subs[1]["start"] - 2.5) < 1e-6
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `python -m pytest ".claude/skills/vakdor-video/tests/test_edl.py" -v`
Expected: FAIL (`ModuleNotFoundError: edl`).

- [ ] **Step 3: Implementar `edl.py`**

```python
# helpers/edl.py
"""Modelo, validación y utilidades del EDL del Modo C."""
from __future__ import annotations
import json


def load_edl(path: str) -> dict:
    return json.load(open(path, encoding="utf-8"))


def validate_edl(edl: dict) -> list[str]:
    errs: list[str] = []
    sources = edl.get("sources") or {}
    if not sources:
        errs.append("EDL sin 'sources'.")
    for i, r in enumerate(edl.get("ranges", [])):
        src = r.get("source")
        if src not in sources:
            errs.append(f"range[{i}]: source '{src}' no está en sources.")
        if not (r.get("start", 0) < r.get("end", 0)):
            errs.append(f"range[{i}]: start debe ser < end (start={r.get('start')}, end={r.get('end')}).")
    for j, o in enumerate(edl.get("overlays", [])):
        if o.get("start_in_output", -1) < 0:
            errs.append(f"overlay[{j}]: start_in_output < 0.")
        if not (o.get("duration", 0) > 0):
            errs.append(f"overlay[{j}]: duration debe ser > 0.")
    return errs


def total_duration(edl: dict) -> float:
    return round(sum(r["end"] - r["start"] for r in edl.get("ranges", [])), 3)


def _range_offsets(edl: dict) -> list[float]:
    """offset en la timeline de salida donde arranca cada range."""
    offs, acc = [], 0.0
    for r in edl.get("ranges", []):
        offs.append(acc)
        acc += r["end"] - r["start"]
    return offs


def master_srt_offsets(edl: dict, transcripts: dict) -> list[dict]:
    """Words re-mapeadas a la timeline de salida (Regla Dura 5).
    transcripts: {source: {"words":[{word,start,end}]}}."""
    offs = _range_offsets(edl)
    subs: list[dict] = []
    for r, off in zip(edl.get("ranges", []), offs):
        words = (transcripts.get(r["source"], {}) or {}).get("words", [])
        for w in words:
            if w["start"] >= r["start"] and w["end"] <= r["end"]:
                subs.append({
                    "start": round(w["start"] - r["start"] + off, 3),
                    "end": round(w["end"] - r["start"] + off, 3),
                    "text": w["word"],
                })
    subs.sort(key=lambda s: s["start"])
    return subs
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `python -m pytest ".claude/skills/vakdor-video/tests/test_edl.py" -v`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/vakdor-video/helpers/edl.py .claude/skills/vakdor-video/tests/test_edl.py
git commit -m "feat(vakdor-video): edl.py (validación + master SRT con offsets de timeline)"
```

---

## Task 6: `grade.py` — color grade por ffmpeg

**Files:**
- Create: `.claude/skills/vakdor-video/helpers/grade.py`

**Interfaces:**
- Produces:
  - `GRADE_PRESETS: dict[str,str]` con `none`, `neutral_punch`, `warm_cinematic`.
  - `grade_filter(name_or_raw: str) -> str` → devuelve el string de filtro ffmpeg (preset por nombre, o el raw si no es preset). `none`/`""` → `""`.
  - CLI: `python grade.py <in> -o <out> [--preset warm_cinematic | --filter "<raw>"] [--list-presets]`.

- [ ] **Step 1: Implementar**

```python
# helpers/grade.py
"""Color grade por ffmpeg. Presets + filtro crudo. Se aplica por-segmento (Regla Dura 2)."""
from __future__ import annotations
import argparse, subprocess

GRADE_PRESETS: dict[str, str] = {
    "none": "",
    # Corrección mínima: contraste + curva S suave, sin virar tono.
    "neutral_punch": "eq=contrast=1.08:saturation=1.05,curves=all='0/0 0.25/0.22 0.75/0.8 1/1'",
    # Teal/orange sutil, desaturado, look técnico/retro. Seguro para talking heads.
    "warm_cinematic": "curves=all='0/0.02 0.5/0.5 1/0.98',eq=saturation=0.92:contrast=1.06:gamma_r=1.03:gamma_b=0.98",
}


def grade_filter(name_or_raw: str | None) -> str:
    if not name_or_raw:
        return ""
    if name_or_raw in GRADE_PRESETS:
        return GRADE_PRESETS[name_or_raw]
    return name_or_raw  # raw ffmpeg filter


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input", nargs="?")
    ap.add_argument("-o", "--out")
    ap.add_argument("--preset")
    ap.add_argument("--filter", dest="raw")
    ap.add_argument("--list-presets", action="store_true")
    a = ap.parse_args()
    if a.list_presets:
        for k, v in GRADE_PRESETS.items():
            print(f"{k}: {v or '(sin cambios)'}")
        return
    filt = grade_filter(a.raw or a.preset or "none")
    vf = ["-vf", filt] if filt else []
    subprocess.run(["ffmpeg", "-i", a.input, *vf, "-y", a.out], check=True)
    print("Grade OK ->", a.out)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Verificar presets**

Run: `python ".claude/skills/vakdor-video/helpers/grade.py" --list-presets`
Expected: lista `none`, `neutral_punch`, `warm_cinematic` con sus filtros.

- [ ] **Step 3: Prueba real sobre un frame/clip corto**

Run (con un clip real): `python ".claude/skills/vakdor-video/helpers/grade.py" "C:/ruta/clip.mp4" -o "C:/ruta/edit/graded.mp4" --preset warm_cinematic`
Expected: genera `graded.mp4`; `ffprobe` OK; imagen con look cálido sutil.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/vakdor-video/helpers/grade.py
git commit -m "feat(vakdor-video): grade.py (presets warm_cinematic/neutral_punch + filtro crudo)"
```

---

## Task 7: `render.py` — extract → concat → overlays → subtítulos (Reglas Duras)

**Files:**
- Create: `.claude/skills/vakdor-video/helpers/render.py`
- Test: `.claude/skills/vakdor-video/tests/test_render_helpers.py`

**Interfaces:**
- Consumes: `edl.load_edl`, `validate_edl`, `total_duration`, `master_srt_offsets`; `grade.grade_filter`.
- Produces:
  - `srt_timestamp(t: float) -> str` (formato `HH:MM:SS,mmm`) — testeable.
  - `build_srt(subs: list[dict]) -> str` — testeable.
  - CLI: `python render.py <edl.json> -o <out.mp4> [--preview] [--build-subtitles] [--edit-dir <dir>]`.
  - Comportamiento: 1) valida EDL; 2) extrae cada range con grade + `afade` 30 ms in/out a un segmento re-encodeado; 3) concat **lossless** (`-c copy`) de segmentos; 4) si hay overlays, un único pase que los superpone con `setpts=PTS-STARTPTS+T/TB` (Regla Dura 4); 5) si hay subtítulos, se queman **AL FINAL** (Regla Dura 1); 6) `ffprobe` de duración contra `total_duration`.

- [ ] **Step 1: Escribir el test de las funciones puras**

```python
# tests/test_render_helpers.py
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "helpers"))
from render import srt_timestamp, build_srt

def test_srt_timestamp():
    assert srt_timestamp(0) == "00:00:00,000"
    assert srt_timestamp(3661.5) == "01:01:01,500"

def test_build_srt():
    subs = [{"start": 0.2, "end": 0.6, "text": "hola"},
            {"start": 2.5, "end": 2.9, "text": "chau"}]
    srt = build_srt(subs)
    assert "1\n00:00:00,200 --> 00:00:00,600\nhola" in srt
    assert "2\n00:00:02,500 --> 00:00:02,900\nchau" in srt
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `python -m pytest ".claude/skills/vakdor-video/tests/test_render_helpers.py" -v`
Expected: FAIL (`ModuleNotFoundError: render`).

- [ ] **Step 3: Implementar `render.py`**

```python
# helpers/render.py
"""Compositor del Modo C. Reglas Duras: extract por-segmento (grade+fades 30ms) ->
concat lossless -> overlays (PTS-shift) -> subtítulos AL FINAL."""
from __future__ import annotations
import argparse, json, os, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(__file__))
from edl import load_edl, validate_edl, total_duration, master_srt_offsets
from grade import grade_filter

FADE = 0.03  # 30 ms (Regla Dura 3)


def srt_timestamp(t: float) -> str:
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def build_srt(subs: list[dict]) -> str:
    out = []
    for i, s in enumerate(subs, 1):
        out.append(f"{i}\n{srt_timestamp(s['start'])} --> {srt_timestamp(s['end'])}\n{s['text']}\n")
    return "\n".join(out)


def _probe_duration(path: str) -> float:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "default=nw=1:nk=1", path], capture_output=True, text=True, check=True)
    return float(r.stdout.strip())


def _extract_segment(src, start, end, grade, out, preview):
    dur = end - start
    fade = f"afade=t=in:st=0:d={FADE},afade=t=out:st={max(dur - FADE, 0):.3f}:d={FADE}"
    vf = grade_filter(grade)
    if preview:
        vf = (vf + "," if vf else "") + "scale=-2:720"
    cmd = ["ffmpeg", "-ss", f"{start:.3f}", "-to", f"{end:.3f}", "-i", src]
    if vf:
        cmd += ["-vf", vf]
    cmd += ["-af", fade, "-c:v", "libx264", "-preset", "veryfast" if preview else "medium",
            "-crf", "23" if preview else "18", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k", "-y", out]
    subprocess.run(cmd, check=True, capture_output=True)


def render(edl_path: str, out: str, preview=False, build_subtitles=False, edit_dir=None):
    edl = load_edl(edl_path)
    errs = validate_edl(edl)
    if errs:
        raise ValueError("EDL inválido:\n  - " + "\n  - ".join(errs))
    base = os.path.dirname(os.path.abspath(edl_path))
    edit_dir = edit_dir or base
    sources = edl["sources"]
    grade = edl.get("grade", "none")

    with tempfile.TemporaryDirectory() as tmp:
        # 1) extract por-segmento (grade + fades)
        seg_files = []
        for i, r in enumerate(edl["ranges"]):
            seg = os.path.join(tmp, f"seg_{i:03d}.mp4")
            _extract_segment(sources[r["source"]], r["start"], r["end"], grade, seg, preview)
            seg_files.append(seg)
        # 2) concat lossless (Regla Dura 2)
        listf = os.path.join(tmp, "segs.txt")
        open(listf, "w", encoding="utf-8").write(
            "".join(f"file '{s.replace(chr(92), '/')}'\n" for s in seg_files))
        concat = os.path.join(tmp, "concat.mp4")
        subprocess.run(["ffmpeg", "-f", "concat", "-safe", "0", "-i", listf,
                        "-c", "copy", "-y", concat], check=True, capture_output=True)

        current = concat
        # 3) overlays (PTS-shift, Regla Dura 4) — un solo re-encode
        overlays = edl.get("overlays", [])
        if overlays:
            inputs, filters, last = ["-i", concat], [], "[0:v]"
            for k, ov in enumerate(overlays, start=1):
                inputs += ["-i", ov["file"]]
                st = ov["start_in_output"]; dur = ov["duration"]
                filters.append(
                    f"[{k}:v]setpts=PTS-STARTPTS+{st}/TB[ov{k}];"
                    f"{last}[ov{k}]overlay=enable='between(t,{st},{st + dur})':eof_action=pass[v{k}]")
                last = f"[v{k}]"
            ov_out = os.path.join(tmp, "ov.mp4")
            subprocess.run(["ffmpeg", *inputs, "-filter_complex", ";".join(filters),
                            "-map", last, "-map", "0:a", "-c:v", "libx264",
                            "-crf", "23" if preview else "18", "-pix_fmt", "yuv420p",
                            "-c:a", "copy", "-y", ov_out], check=True, capture_output=True)
            current = ov_out

        # 4) subtítulos AL FINAL (Regla Dura 1)
        srt_path = edl.get("subtitles")
        if build_subtitles and not srt_path:
            transcripts = {}
            tdir = os.path.join(edit_dir, "transcripts")
            for src in sources:
                p = os.path.join(tdir, f"{src}.json")
                if os.path.exists(p):
                    transcripts[src] = json.load(open(p, encoding="utf-8"))
            subs = master_srt_offsets(edl, transcripts)
            srt_path = os.path.join(edit_dir, "master.srt")
            open(srt_path, "w", encoding="utf-8").write(build_srt(subs))
            print(f"[subs] master.srt: {len(subs)} líneas")
        os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
        if srt_path and os.path.exists(srt_path):
            style = ("FontName=Inter,FontSize=16,Bold=1,PrimaryColour=&H00FFFFFF,"
                     "OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,"
                     "Alignment=2,MarginV=48")
            srt_ff = srt_path.replace("\\", "/").replace(":", "\\:")
            subprocess.run(["ffmpeg", "-i", current,
                            "-vf", f"subtitles='{srt_ff}':force_style='{style}'",
                            "-c:v", "libx264", "-crf", "23" if preview else "18",
                            "-pix_fmt", "yuv420p", "-c:a", "copy", "-y", out],
                           check=True, capture_output=True)
        else:
            subprocess.run(["ffmpeg", "-i", current, "-c", "copy", "-y", out],
                           check=True, capture_output=True)

    got = _probe_duration(out)
    exp = total_duration(edl)
    print(f"[render] {out}  dur={got:.2f}s (EDL esperaba {exp:.2f}s, Δ={abs(got - exp):.2f}s)")
    if abs(got - exp) > 0.5:
        print("  ⚠️ diferencia de duración > 0.5s: revisar cortes/overlays.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("edl")
    ap.add_argument("-o", "--out", required=True)
    ap.add_argument("--preview", action="store_true")
    ap.add_argument("--build-subtitles", action="store_true")
    ap.add_argument("--edit-dir")
    a = ap.parse_args()
    render(a.edl, a.out, a.preview, a.build_subtitles, a.edit_dir)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Correr el test de funciones puras y verificar que pasa**

Run: `python -m pytest ".claude/skills/vakdor-video/tests/test_render_helpers.py" -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Prueba real end-to-end (EDL mínimo, sin overlays)**

Crear un `edl.json` de prueba apuntando a un video real con 2 rangos, `grade: "none"`. Run:
```bash
python ".claude/skills/vakdor-video/helpers/render.py" "C:/ruta/edit/edl.json" -o "C:/ruta/edit/preview.mp4" --preview --build-subtitles --edit-dir "C:/ruta/edit"
```
Expected: genera `preview.mp4` (720p), imprime dur≈esperada (Δ<0.5s), `master.srt` creado. Abrir el mp4: cortes limpios, sin pops en los bordes (fades 30 ms), subtítulos visibles.

- [ ] **Step 6: Prueba real con un overlay** (usar un clip corto como overlay)

Agregar `overlays:[{"file":"C:/ruta/ov.mp4","start_in_output":0.5,"duration":2.0}]` al EDL y re-render.
Expected: el overlay aparece a los 0.5s de la salida, arranca en su frame 0 (no en el medio), y **los subtítulos quedan por encima** del overlay.

- [ ] **Step 7: Commit**

```bash
git add .claude/skills/vakdor-video/helpers/render.py .claude/skills/vakdor-video/tests/test_render_helpers.py
git commit -m "feat(vakdor-video): render.py Modo C (extract->concat->overlays PTS->subs al final)"
```

---

## Task 8: `timeline_view.py` — filmstrip + waveform

**Files:**
- Create: `.claude/skills/vakdor-video/helpers/timeline_view.py`

**Interfaces:**
- Produces: CLI `python timeline_view.py <video> <start> <end> [-o out.png] [--frames 6]`. Genera un PNG con una tira de N frames del rango + una waveform del audio de ese rango (Pillow + numpy leyendo PCM de ffmpeg). Uso en puntos de decisión, no como scanner.

- [ ] **Step 1: Implementar**

```python
# helpers/timeline_view.py
"""Filmstrip + waveform de un rango de video, para decidir cortes (drill-down visual)."""
from __future__ import annotations
import argparse, os, subprocess, tempfile
import numpy as np
from PIL import Image


def _frames(video, start, end, n, tmp):
    paths = []
    for i in range(n):
        t = start + (end - start) * (i / max(n - 1, 1))
        p = os.path.join(tmp, f"f{i}.jpg")
        subprocess.run(["ffmpeg", "-ss", f"{t:.3f}", "-i", video, "-frames:v", "1",
                        "-vf", "scale=320:-1", "-y", p], check=True, capture_output=True)
        if os.path.exists(p):
            paths.append(p)
    return paths


def _waveform_img(video, start, end, width, height=140):
    r = subprocess.run(["ffmpeg", "-ss", f"{start:.3f}", "-to", f"{end:.3f}", "-i", video,
                        "-ac", "1", "-ar", "8000", "-f", "s16le", "-"],
                       capture_output=True, check=True)
    a = np.frombuffer(r.stdout, dtype=np.int16).astype(np.float32)
    if a.size == 0:
        return Image.new("RGB", (width, height), (10, 15, 26))
    a = a / 32768.0
    buckets = np.array_split(a, width)
    peaks = np.array([np.abs(b).max() if b.size else 0 for b in buckets])
    img = Image.new("RGB", (width, height), (10, 15, 26))
    px = img.load()
    mid = height // 2
    for x, pk in enumerate(peaks):
        h = int(pk * (height // 2 - 4))
        for y in range(mid - h, mid + h):
            px[x, y] = (192, 124, 65)  # cobre
    return img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video"); ap.add_argument("start", type=float); ap.add_argument("end", type=float)
    ap.add_argument("-o", "--out"); ap.add_argument("--frames", type=int, default=6)
    a = ap.parse_args()
    out = a.out or f"timeline_{a.start:.1f}_{a.end:.1f}.png"
    with tempfile.TemporaryDirectory() as tmp:
        fpaths = _frames(a.video, a.start, a.end, a.frames, tmp)
        imgs = [Image.open(p) for p in fpaths]
        fw = sum(im.width for im in imgs)
        fh = max((im.height for im in imgs), default=180)
        strip = Image.new("RGB", (fw, fh), (10, 15, 26))
        x = 0
        for im in imgs:
            strip.paste(im, (x, 0)); x += im.width
        wave = _waveform_img(a.video, a.start, a.end, max(fw, 320))
        canvas = Image.new("RGB", (max(fw, wave.width), fh + wave.height), (10, 15, 26))
        canvas.paste(strip, (0, 0)); canvas.paste(wave, (0, fh))
        canvas.save(out)
    print("timeline ->", out)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Prueba real**

Run: `python ".claude/skills/vakdor-video/helpers/timeline_view.py" "C:/ruta/muestra.mp4" 0 5 -o "C:/ruta/edit/verify/tl.png"`
Expected: crea `tl.png` con 6 frames en fila + waveform cobre debajo. Abrir con Read para inspección visual.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/vakdor-video/helpers/timeline_view.py
git commit -m "feat(vakdor-video): timeline_view.py (filmstrip + waveform para decidir cortes)"
```

---

## Task 9: Referencias del Modo C (`video-use.md`, `animations.md`, `formats.md`, `manim.md`)

**Files:**
- Create: `.claude/skills/vakdor-video/references/video-use.md`
- Create: `.claude/skills/vakdor-video/references/animations.md`
- Create: `.claude/skills/vakdor-video/references/formats.md`
- Create: `.claude/skills/vakdor-video/references/manim.md`

**Interfaces:**
- Produces: la documentación completa que consume el Modo C. Sin código nuevo; es el playbook.

- [ ] **Step 1: Escribir `video-use.md`** — el playbook completo (adaptado a whisper)

Debe incluir, textual y adaptado (ElevenLabs→whisper, rutas Windows, helpers de esta skill):
  - Principios (audio-first, ask→confirm→execute→iterate→persist, generalizar, libertad artística).
  - **Las 12 Reglas Duras** (copiar la sección de Global Constraints de este plan).
  - Directory layout de `edit/` (transcripts, animations/slot_*, clips_graded, master.srt, verify, preview.mp4, final.mp4, project.md).
  - Los helpers y su uso exacto: `transcribe.py`, `transcribe_batch.py`, `pack_transcripts.py`, `timeline_view.py`, `grade.py`, `render.py` (con los comandos reales de las Tasks 2–8).
  - El proceso de 8 pasos (inventory → pre-scan → converse → propose strategy → execute → preview → self-eval → iterate+persist).
  - Cut craft (audio-first, preservar picos, handoffs 400–600 ms, silencios ≥400 ms, padding 30–200 ms).
  - Brief del editor sub-agente (selección multi-take) y formato EDL (`edl.json` de este plan).
  - Grade (presets de `grade.py`), subtítulos (estilo bold-overlay Inter, cobre para marca opcional).
  - Memoria `project.md` (append por sesión).
  - Nota whisper: `-ml 1 -oj`, español, cache; NUNCA ElevenLabs; NUNCA whisper en modo SRT/frase (perdés gaps sub-segundo → Regla Dura 8).

- [ ] **Step 2: Escribir `animations.md`** — las 4 vías (copiar la tabla de la sección 4.4 del spec) con:
  - Cuándo usar cada motor (PIL/Remotion/HyperFrames/Manim).
  - Setup exacto de cada uno (de `install.md`).
  - Reglas universales: duraciones (sync-to-narration ≥ narración+1s; hold final ≥1s), easings cubic (nunca linear), typing anchor en string completo, sync del payoff a la palabra hablada, no revelar 2 cosas nuevas a la vez.
  - Paleta de marca por defecto (fondo `#0A0F1A`, acento `#C07C41`) — proponer y confirmar si no la dan.
  - El brief de sub-agente de 10 puntos (self-contained, output path absoluto, spec técnica, "no hagas preguntas").
  - **Regla Dura 10:** múltiples animaciones = sub-agentes en paralelo, nunca secuencial.

- [ ] **Step 3: Escribir `formats.md`** — tabla de formatos/plataformas:
  - vertical 1080×1920 (TikTok/Reels/Shorts) · horizontal 1920×1080 (LinkedIn/YouTube/blog) · cuadrado 1080×1080 (feed IG) · 4:5 1080×1350 (opcional).
  - Regla A/B: si no se especifica formato, PREGUNTAR (no asumir).
  - Regla C: default = conservar aspecto del fuente; reframe si se pide otro.

- [ ] **Step 4: Escribir `manim.md`** — guía de slot Manim (reemplaza el sub-skill vendored que no tenemos): cómo armar `edit/animations/slot_<id>/scene.py`, `manim -qh scene.py <Clase>` para render 1080p, fondo transparente con `-t` si hace falta alpha, verificar duración/dimensiones con `ffprobe`, apuntar el overlay del EDL al mp4 resultante. Nota: ecuaciones necesitan LaTeX (opcional).

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/vakdor-video/references/
git commit -m "docs(vakdor-video): referencias del Modo C (video-use, animations, formats, manim)"
```

---

## Task 10: Motor Remotion multi-formato (Modo A — PropertyReel)

**Files:**
- Create: `.claude/skills/vakdor-video/engine/src/format.ts`
- Modify: `.claude/skills/vakdor-video/engine/src/PropertyReel.tsx`
- Modify: `.claude/skills/vakdor-video/engine/src/Root.tsx:22-31`
- Modify: `.claude/skills/vakdor-video/engine/render.mjs:74-78`

**Interfaces:**
- Consumes: nada externo.
- Produces:
  - `format.ts`: `export type VideoFormat = "vertical"|"horizontal"|"cuadrado"`; `export const FORMATS: Record<VideoFormat,{width:number;height:number}>`; `export function unit(width:number):number` (factor de escala = `width/1080`) para tamaños responsivos.
  - `PropertyReel` acepta `format: VideoFormat` en props (default `"vertical"`); `calcReelMetadata` devuelve `width`/`height` según `FORMATS[format]`; los tamaños de fuente/padding/posición se escalan con `unit(width)` leyendo `useVideoConfig()`.
  - `render.mjs` acepta `--format=<vertical|horizontal|cuadrado>` y lo mete en los props resueltos.

- [ ] **Step 1: Crear `format.ts`**

```ts
// engine/src/format.ts
export type VideoFormat = "vertical" | "horizontal" | "cuadrado";

export const FORMATS: Record<VideoFormat, { width: number; height: number }> = {
  vertical: { width: 1080, height: 1920 },
  horizontal: { width: 1920, height: 1080 },
  cuadrado: { width: 1080, height: 1080 },
};

// Factor de escala relativo al diseño base (1080 de ancho).
export const unit = (width: number): number => width / 1080;

export const resolveFormat = (f?: string): VideoFormat =>
  f === "horizontal" || f === "cuadrado" ? f : "vertical";
```

- [ ] **Step 2: Modificar `PropertyReel.tsx` — agregar `format` a props y defaults**

En el `type PropertyReelProps` agregar `format: VideoFormat;` y en `propertyReelDefaults` agregar `format: "vertical",`. Importar arriba:
```ts
import { FORMATS, unit, resolveFormat, VideoFormat } from "./format";
```

- [ ] **Step 3: Modificar `calcReelMetadata` para devolver dimensiones**

```ts
export const calcReelMetadata: CalculateMetadataFunction<PropertyReelProps> = ({ props }) => {
  const perPhoto = Math.round((props.secondsPerPhoto || 2.5) * FPS);
  const nPhotos = Math.max(props.photos.length, 1);
  const { width, height } = FORMATS[resolveFormat(props.format)];
  return {
    durationInFrames: INTRO + perPhoto * nPhotos + OUTRO,
    fps: FPS,
    width,
    height,
  };
};
```

- [ ] **Step 4: Hacer responsivos los tamaños en Intro/PhotoClip/Outro/Logos**

Regla: dentro de cada sub-componente, leer `const { width } = useVideoConfig(); const u = unit(width);` y multiplicar cada `fontSize`, `padding`, `top/left/right/bottom`, `width/height` de líneas y chips por `u`. Ejemplos concretos:
  - `Logos`: `top: 80*u, left/right: 70*u, width/height: 96*u`.
  - `Intro`: `padding: 90*u`; título `fontSize: 96*u`; operación `fontSize: 38*u`; location `fontSize: 48*u`; línea `width: lineW*u, height: 8*u`.
  - `PhotoClip`: chip `top: 120*u, left: 70*u`, valor `84*u`, label `40*u`; lower third `bottom: 130*u, left/right: 70*u`, título `56*u`, precio `64*u`, línea `120*u×6*u`.
  - `Outro`: `padding: 90*u`, cta `80*u`, precio `52*u`, pill `44*u` con `padding: 30*u 64*u`.

  (El layout ya usa `objectFit:"cover"`, así que las fotos se reencuadran solas a cualquier aspecto. Lo único que cambia es escalar texto/espaciado con `u`.)

- [ ] **Step 5: Modificar `Root.tsx` — dimensiones desde metadata**

```tsx
// Root.tsx — width/height iniciales; calculateMetadata los sobreescribe por formato.
<Composition
  id="PropertyReel"
  component={PropertyReel}
  durationInFrames={300}
  fps={FPS}
  width={1080}
  height={1920}
  defaultProps={propertyReelDefaults}
  calculateMetadata={calcReelMetadata}
/>
```
(No cambia la firma; con `calcReelMetadata` devolviendo width/height, Remotion usa esos. Verificar que `defaultProps` incluye `format`.)

- [ ] **Step 6: Modificar `render.mjs` — aceptar `--format`**

Después de `const props = JSON.parse(...)` (línea ~36) agregar:
```js
// Formato de salida (vertical|horizontal|cuadrado). Si no viene, queda el de props/vertical.
if (args.format) props.format = args.format;
```
(El resto igual: renderiza la composición `PropertyReel` con los props resueltos; las dimensiones salen de `calculateMetadata`.)

- [ ] **Step 7: Copiar el motor a Prisma - MK y renderizar en los 3 formatos**

Run (parado en el motor de Prisma - MK, tras copiar `src/` + `render.mjs`):
```bash
node render.mjs --props="C:/ruta/props.json" --out="C:/ruta/reel-horizontal.mp4" --format=horizontal
node render.mjs --props="C:/ruta/props.json" --out="C:/ruta/reel-vertical.mp4" --format=vertical
node render.mjs --props="C:/ruta/props.json" --out="C:/ruta/reel-cuadrado.mp4" --format=cuadrado
```
Expected (verificar con ffprobe):
```bash
ffprobe -v error -show_entries stream=width,height -of csv=p=0 reel-horizontal.mp4   # 1920,1080
ffprobe -v error -show_entries stream=width,height -of csv=p=0 reel-vertical.mp4     # 1080,1920
ffprobe -v error -show_entries stream=width,height -of csv=p=0 reel-cuadrado.mp4     # 1080,1080
```
Y abrir cada uno: layout no roto (textos y logos proporcionados, sin desbordes).

- [ ] **Step 8: Commit**

```bash
git add .claude/skills/vakdor-video/engine/src/format.ts .claude/skills/vakdor-video/engine/src/PropertyReel.tsx .claude/skills/vakdor-video/engine/src/Root.tsx .claude/skills/vakdor-video/engine/render.mjs
git commit -m "feat(vakdor-video): Modo A multi-formato (vertical/horizontal/cuadrado) vía calculateMetadata"
```

---

## Task 11: Motor Remotion multi-formato (Modo B — EditedReel)

**Files:**
- Modify: `.claude/skills/vakdor-video/engine/src/EditedReel.tsx`
- Modify: `.claude/skills/vakdor-video/engine/edit.mjs`

**Interfaces:**
- Consumes: `format.ts` (Task 10).
- Produces: `EditedReel` acepta `format: VideoFormat` (default `"vertical"`); `calcEditedMetadata` devuelve `width`/`height` de `FORMATS[format]`; layout (marca de agua, subtítulos, intro/outro) escalado con `unit(width)`. `edit.mjs` acepta `--format` y lo pasa como prop.

- [ ] **Step 1: Leer `EditedReel.tsx` y `edit.mjs`** para ubicar `editedReelDefaults`, `calcEditedMetadata` y el spawn del CLI.

Run: `sed -n '1,60p'` no — usar Read sobre ambos archivos.

- [ ] **Step 2: Agregar `format` a props/defaults de `EditedReel`** (igual patrón que Task 10 Step 2): importar de `./format`, agregar `format: VideoFormat` al type y `format: "vertical"` a `editedReelDefaults`.

- [ ] **Step 3: `calcEditedMetadata` devuelve dimensiones**

```ts
// dentro de calcEditedMetadata, tras calcular durationInFrames:
const { width, height } = FORMATS[resolveFormat(props.format)];
return { durationInFrames, fps: EDIT_FPS, width, height };
```

- [ ] **Step 4: Escalar el layout con `unit(width)`** (marca de agua, tamaño/posición de subtítulos, intro/outro), leyendo `useVideoConfig().width`. Para subtítulos: además de escalar, si `format==="horizontal"` bajar el `MarginV` proporcional para que no tapen la cara.

- [ ] **Step 5: `edit.mjs` acepta `--format`** — tras parsear props/args, inyectar `props.format = args.format || props.format` antes del render (mismo patrón que render.mjs Step 6). Verificar cómo `edit.mjs` arma los props del `EditedReel` y agregar el campo ahí.

- [ ] **Step 6: Prueba real en los 3 formatos**

Run (motor en Prisma - MK, con un crudo real):
```bash
node edit.mjs --video="C:/ruta/crudo.mp4" --out="C:/ruta/edit-horizontal.mp4" --format=horizontal --subtitles
node edit.mjs --video="C:/ruta/crudo.mp4" --out="C:/ruta/edit-vertical.mp4" --format=vertical --subtitles
```
Expected: `ffprobe` da 1920×1080 y 1080×1920 respectivamente; subtítulos legibles y bien ubicados en ambos; jump cuts OK.

- [ ] **Step 7: Commit**

```bash
git add .claude/skills/vakdor-video/engine/src/EditedReel.tsx .claude/skills/vakdor-video/engine/edit.mjs
git commit -m "feat(vakdor-video): Modo B multi-formato (EditedReel + edit.mjs --format)"
```

---

## Task 12: Reescribir `SKILL.md` — 3 modos + ruteo a referencias

**Files:**
- Modify: `.claude/skills/vakdor-video/SKILL.md`

**Interfaces:**
- Produces: SKILL.md con la descripción actualizada (dispara también con "editar video linkedin/horizontal", "cualquier video", "subtítulos", "cortar silencios") y 3 modos claros que rutean a `references/` y `helpers/`.

- [ ] **Step 1: Actualizar el frontmatter `description`** para cubrir: reels de propiedad (A), edición rápida de crudo (B), y edición conversacional pro de cualquier video/formato (C). Mantener triggers existentes + agregar "video horizontal", "video para LinkedIn/YouTube", "editar cualquier video", "VSL", "transcribir", "color/grade".

- [ ] **Step 2: Agregar la tabla de los 3 modos** al inicio del cuerpo (copiar de la sección 4 del spec).

- [ ] **Step 3: Nota multi-formato en Modos A/B** — documentar `--format=vertical|horizontal|cuadrado` en los ejemplos de `render.mjs`/`edit.mjs`, y la regla "si no se especifica, preguntar".

- [ ] **Step 4: Agregar sección "MODO C — Editor conversacional pro"** (concisa, ~30 líneas) que:
  - Explique que es el motor video-use con whisper (gratis, offline, es), agnóstico de formato, marca opcional, salida en `edit/` junto al fuente.
  - **Rutee** al detalle: "Leé `references/video-use.md` antes de arrancar el Modo C. Animaciones en `references/animations.md`. Formatos en `references/formats.md`."
  - Liste el flujo mínimo: `transcribe_batch.py` → `pack_transcripts.py` → (conversar + confirmar estrategia) → `edl.json` → `render.py --preview` → self-eval → `render.py` final.
  - Recuerde las Reglas Duras críticas (subs al final, cache de transcript, confirmar estrategia).

- [ ] **Step 5: Verificar que la skill sigue coherente** (los Modos A/B no perdieron info; el Paso 0 del motor sigue válido; se menciona `install.md`).

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/vakdor-video/SKILL.md
git commit -m "docs(vakdor-video): SKILL.md super skill (3 modos, multi-formato, ruteo a referencias)"
```

---

## Task 13: Verificación integral + memoria del proyecto

**Files:**
- Modify (fuera del repo): `C:\Users\LENOVO\.claude\projects\...\memory\MEMORY.md` + nuevo archivo de memoria (al cerrar, con OK).

**Interfaces:**
- Produces: evidencia de que TODO anda; nota de memoria del proyecto.

- [ ] **Step 1: Correr toda la suite de tests**

Run: `python -m pytest ".claude/skills/vakdor-video/tests/" -v`
Expected: todos PASS (whisper_parse 2, edl 4, render_helpers 2).

- [ ] **Step 2: Verificación de "todo disponible" (install)**

Run:
```bash
python -c "import PIL, numpy; print('py ok')" && yt-dlp --version && manim --version && npx --yes hyperframes --help >/dev/null && echo "hyperframes ok" && ls C:/whisper-cpp/main.exe
```
Expected: `py ok`, versiones, `hyperframes ok`, y el binario de whisper.

- [ ] **Step 3: Prueba end-to-end del Modo C** (con un video real de Leonardo):
transcribe → pack → EDL a mano de 2–3 cortes → `render.py --preview --build-subtitles` → abrir preview.
Expected: cortes limpios, sin pops, subtítulos sobre el video, duración ≈ EDL.

- [ ] **Step 4: Prueba de animación PIL** (verifica que la vía más simple del Modo C anda): un script PIL que genere 30 PNGs de un contador y `ffmpeg` los arme en `slot_test/render.mp4`; `ffprobe` confirma duración/dimensiones.

- [ ] **Step 5: Reporte a Leonardo + decisión de merge**

Resumir: qué se probó, con qué evidencia (ffprobe, tests, frames). NO mergear a main sin OK explícito.

- [ ] **Step 6 (con OK de Leonardo): merge a main + actualizar memoria**

```bash
# desde el worktree, con OK:
git checkout main && git merge --no-ff feat/vakdor-video-super-skill
```
Luego actualizar `MEMORY.md` del proyecto: la skill `vakdor-video` ahora es super skill (3 modos, multi-formato, whisper compartido, referencias/animaciones incluidas). Limpiar el worktree con `git worktree remove` si corresponde.

---

## Self-Review (cobertura del spec)

- **Whisper reemplaza ElevenLabs** → Tasks 1, 2 (whisper.cpp `-ml 1 -oj`, cache). ✔
- **6 helpers Python del Modo C** → whisper_parse+transcribe (1,2), transcribe_batch (3), pack_transcripts (4), timeline_view (8), grade (6), render (7) + edl (5). ✔
- **12 Reglas Duras** → Global Constraints + render.py (Task 7) + video-use.md (Task 9). ✔
- **Multi-formato A y B** → Tasks 10, 11 (calculateMetadata + `unit()` responsivo). ✔
- **Preguntar formato si no se especifica** → formats.md (Task 9) + SKILL.md (Task 12). ✔
- **Salida Modo C junto al fuente / A-B a Prisma - MK** → render.py usa `edit_dir` del EDL; render.mjs/edit.mjs siguen escribiendo a la ruta `--out` (Prisma - MK). ✔
- **TODO incluido (4 vías de animación disponibles)** → install.md (Task 0) + animations.md + manim.md (Task 9) + prueba PIL (Task 13). ✔
- **install.md idempotente** → Task 0. ✔
- **Referencias/assets/configs** → Task 9 + engine existente. ✔
- **Modo operandi (rama propia/worktree, merge con OK, memoria)** → Task 13. ✔

Placeholder scan: sin TBD/TODO en código; cada step de código tiene código real. Type consistency: `VideoFormat`, `FORMATS`, `unit`, `resolveFormat` consistentes entre format.ts, PropertyReel, EditedReel, Root, render.mjs, edit.mjs; `parse_whisper_json`/`group_into_phrases`/`transcribe_file`/`master_srt_offsets`/`grade_filter`/`build_srt`/`srt_timestamp` consistentes entre helpers y tests.
