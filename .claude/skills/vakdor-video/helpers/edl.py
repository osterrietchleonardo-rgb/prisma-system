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
            # incluir toda palabra que SOLAPE el tramo (no solo las 100% contenidas):
            # así no se pierden palabras cuyo borde cae en un corte (whisper pega el
            # silencio al final de la palabra). Se recorta su tiempo al tramo.
            ov_start = max(w["start"], r["start"])
            ov_end = min(w["end"], r["end"])
            if ov_end <= ov_start:
                continue
            # exigir un solapamiento mínimo para no duplicar una palabra partida en dos tramos
            if (ov_end - ov_start) < 0.4 * (w["end"] - w["start"]) and (w["end"] - w["start"]) > 0:
                continue
            subs.append({
                "start": round(ov_start - r["start"] + off, 3),
                "end": round(ov_end - r["start"] + off, 3),
                "text": w["word"],
            })
    subs.sort(key=lambda s: s["start"])
    return subs
