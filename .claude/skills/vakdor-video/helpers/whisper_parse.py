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
