"""Parseo puro de la salida JSON de whisper.cpp a words word-level.
Método bueno: -ojf (JSON completo con tokens) + reconstrucción por espacio inicial.
(El viejo -oj + -ml 1 fragmentaba palabras: "V ald or" en vez de "Vakdor".)"""
from __future__ import annotations
import re
import unicodedata

# Tokens especiales de whisper: [_BEG_], [_EOT_], y marcas de tiempo [_TT_1234].
# (Terminan en '_]' o en dígito+']' — por eso el patrón NO exige '_' antes del ']'.)
_SPECIAL = re.compile(r"^\[_.*\]$")

# Puntuación que abre y se adhiere a la palabra SIGUIENTE.
_OPEN = set("¿¡(«\"'“‘[")
# Puntuación que cierra y se adhiere a la palabra ANTERIOR.
_CLOSE = set(",.?!;:)»”’]…")


def _is_punct_only(tok: str) -> bool:
    return bool(tok) and all(unicodedata.category(c).startswith("P") or c in _OPEN for c in tok)


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


def parse_whisper_tokens(data: dict) -> list[dict]:
    """whisper.cpp -ojf: {"transcription":[{"tokens":[{"text","offsets":{from,to}}]}]}.
    Reconstruye palabras: un token cuyo texto empieza con espacio ABRE palabra nueva;
    los demás se pegan a la palabra en curso. Se saltan tokens especiales ([_BEG_], etc.).
    Devuelve [{"word","start","end"}] en segundos."""
    words: list[dict] = []
    cur: dict | None = None
    for seg in data.get("transcription", []):
        for t in seg.get("tokens", []):
            txt = t.get("text", "")
            if _SPECIAL.match(txt.strip()):
                continue
            off = t.get("offsets") or {}
            fr = round((off.get("from", 0) or 0) / 1000.0, 3)
            to = round((off.get("to", 0) or 0) / 1000.0, 3)
            if txt.startswith(" ") or cur is None:
                if cur and cur["word"].strip():
                    words.append(cur)
                cur = {"word": txt.strip(), "start": fr, "end": max(to, fr)}
            else:
                cur["word"] += txt
                cur["end"] = max(cur["end"], to)
    if cur and cur["word"].strip():
        words.append(cur)
    return [w for w in words if w["word"].strip()]


def merge_punctuation(words: list[dict]) -> list[dict]:
    """Fusiona tokens de sólo-puntuación a la palabra vecina (whisper -ml 1 los separa).
    Apertura (¿¡«"...) -> se pega a la palabra siguiente; cierre (,.?!...) -> a la anterior.
    El tiempo de la palabra resultante se extiende para cubrir el signo."""
    out: list[dict] = []
    pending_open = ""  # apertura esperando la próxima palabra real
    for w in words:
        tok = w["word"]
        if _is_punct_only(tok):
            if all(c in _OPEN for c in tok):
                pending_open += tok  # se pega a la próxima palabra
            elif out:
                out[-1]["word"] += tok
                out[-1]["end"] = max(out[-1]["end"], w["end"])
            # si no hay palabra anterior ni es apertura, se descarta el signo suelto
            continue
        word = pending_open + tok
        pending_open = ""
        out.append({"word": word, "start": w["start"], "end": w["end"]})
    return out


def group_into_phrases(words: list[dict], silences: list[dict] | None = None,
                       gap: float = 0.5) -> list[dict]:
    """Agrupa words en frases. Si se pasan `silences` (de silencedetect), corta la frase
    en la palabra cuyo final está más cerca del inicio de cada silencio (whisper -ml 1 da
    timestamps contiguos, así que el gap entre palabras NO sirve; el silencio real sí).
    Sin `silences`, corta por gap entre palabras >= `gap`."""
    breaks: set[int] = set()
    if silences:
        for s in silences:
            best_i, best_d = None, 1e9
            for i, w in enumerate(words):
                d = abs(w["end"] - s["start"])
                if d < best_d:
                    best_d, best_i = d, i
            if best_i is not None and best_d <= 0.6:
                breaks.add(best_i)
    phrases: list[dict] = []
    cur: list[dict] = []
    for i, w in enumerate(words):
        cur.append(w)
        gap_break = (not silences and i + 1 < len(words)
                     and (words[i + 1]["start"] - w["end"]) >= gap)
        if i in breaks or gap_break:
            phrases.append(_flush(cur))
            cur = []
    if cur:
        phrases.append(_flush(cur))
    return phrases


def _flush(group: list[dict]) -> dict:
    return {
        "start": group[0]["start"],
        "end": group[-1]["end"],
        "text": " ".join(g["word"] for g in group),
    }
