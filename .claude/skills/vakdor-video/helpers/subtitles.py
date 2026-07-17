"""Subtítulos premium: corrige términos mal transcritos (diccionario) y resalta palabras
clave en cobre (marca). Genera un archivo .ass (permite color por palabra, que el SRT no)."""
from __future__ import annotations
import re

# Color de marca en formato ASS (&HAABBGGRR). Cobre #C07C41 -> BGR 417CC0.
ACCENT_ASS = "&H00417CC0"
WHITE_ASS = "&H00FFFFFF"

# Términos de alto valor que se resaltan en cobre si aparecen en un cue.
DEFAULT_KEYWORDS = [
    "vakdor", "prisma", "director", "directores", "inmobiliaria", "inmobiliarias",
    "inteligencia artificial", "inteligencia", "rentabilidad", "control", "dependencia",
    "operativa", "sistema", "sistematiza", "ecosistema", "trazabilidad", "escala", "escales",
    "automatiza", "resultados", "tiempo", "equipo", "proceso", "procesos",
]

# Correcciones por defecto de errores típicos de whisper con la jerga de Vakdor.
# Clave en minúscula; se reemplaza respetando límites de palabra, sin distinguir may/min.
DEFAULT_CORRECTIONS = {
    "valdor": "Vakdor", "baldor": "Vakdor", "valdork": "Vakdor", "vardor": "Vakdor",
    "vigencia artificial": "inteligencia artificial",
    "prisma ea": "PRISMA", "prisma ia": "PRISMA", "prisma e a": "PRISMA",
    "monitores": "inmobiliarias",
    "carrera horaria": "carga operativa", "cargadoría": "carga operativa",
}


def apply_corrections(text: str, corrections: dict[str, str]) -> str:
    """Reemplaza términos mal transcritos. Frases (multi-palabra) primero, luego palabras."""
    items = sorted(corrections.items(), key=lambda kv: -len(kv[0]))  # más largas primero
    for wrong, right in items:
        text = re.sub(rf"(?<!\w){re.escape(wrong)}(?!\w)", right, text, flags=re.IGNORECASE)
    return text


def _norm(w: str) -> str:
    return re.sub(r"[^\wáéíóúñü]", "", w.lower())


def _emphasize_cue(text: str, keywords: list[str], max_hl: int = 2) -> str:
    """Envuelve en cobre las palabras del cue que coinciden con keywords (máx max_hl)."""
    kw = set(keywords)
    kw_multi = [k for k in keywords if " " in k]
    hl = 0
    for k in kw_multi:
        if hl >= max_hl:
            break
        pat = re.compile(rf"(?<!\w)({re.escape(k)})(?!\w)", re.IGNORECASE)
        if pat.search(text):
            text = pat.sub(rf"{{\\c{ACCENT_ASS}}}\1{{\\c{WHITE_ASS}}}", text, count=1)
            hl += 1
    out = []
    for tok in text.split(" "):
        n = _norm(tok)
        if hl < max_hl and n and (n in kw or any(n.startswith(k) for k in kw if " " not in k and len(k) > 4)):
            out.append(f"{{\\c{ACCENT_ASS}}}{tok}{{\\c{WHITE_ASS}}}")
            hl += 1
        else:
            out.append(tok)
    return " ".join(out)


def _ass_time(t: float) -> str:
    cs = int(round(t * 100))
    h, cs = divmod(cs, 360000)
    m, cs = divmod(cs, 6000)
    s, cs = divmod(cs, 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def build_ass(cues: list[dict], width: int = 1920, height: int = 1080,
              fontsize: int = 54, margin_v: int = 210, corrections: dict | None = None,
              keywords: list[str] | None = None, emphasis: bool = True) -> str:
    corrections = DEFAULT_CORRECTIONS if corrections is None else corrections
    keywords = DEFAULT_KEYWORDS if keywords is None else keywords
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Inter,{fontsize},{WHITE_ASS},&H000000FF,&H00101010,&H80000000,-1,0,0,0,100,100,0,0,1,3.5,0,2,120,120,{margin_v},1

[Events]
Format: Layer, Start, End, Style, MarginL, MarginR, Effect, Text
"""
    lines = [header]
    for c in cues:
        text = apply_corrections(c["text"], corrections)
        if emphasis:
            text = _emphasize_cue(text, keywords)
        lines.append(
            f"Dialogue: 0,{_ass_time(c['start'])},{_ass_time(c['end'])},Default,0,0,,{text}")
    return "\n".join(lines) + "\n"
