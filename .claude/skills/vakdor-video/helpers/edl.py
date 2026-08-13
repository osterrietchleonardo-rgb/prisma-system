"""Modelo, validación y utilidades del EDL del Modo C."""
from __future__ import annotations
import json, os, sys

sys.path.insert(0, os.path.dirname(__file__))
from privacy import validate_masks  # noqa: E402


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
    errs += validate_masks(edl.get("masks", []))
    for k, m in enumerate(edl.get("masks", [])):
        src = m.get("source")
        if src is not None and src not in sources:
            errs.append(f"mask[{k}]: source '{src}' no está en sources.")
        if src is None and m.get("timeline") != "output" and len(sources) > 1:
            errs.append(f"mask[{k}]: con más de una fuente hay que decir 'source' "
                        f"(o poner \"timeline\": \"output\").")
    errs += validate_audio(edl.get("audio"))
    return errs


def validate_audio(audio: dict | None) -> list[str]:
    """Valida el bloque de mezcla del EDL. Función pura."""
    if not audio:
        return []
    errs: list[str] = []
    bgm = audio.get("bgm") or []
    if not isinstance(bgm, list):
        errs.append("audio.bgm tiene que ser una lista de rutas.")
        bgm = []
    if len(bgm) > 2:
        errs.append("audio.bgm: como máximo 2 camas (la segunda marca el giro del video).")
    if len(bgm) == 2 and audio.get("swap") is None:
        errs.append("audio: con 2 camas hace falta 'swap' (segundo del cambio).")
    duck = audio.get("duck_lu", 12)
    if not (0 < float(duck) <= 30):
        errs.append(f"audio.duck_lu fuera de rango razonable: {duck} (8 presente, 12 normal, 16 discreta).")
    for i, s in enumerate(audio.get("sfx") or []):
        if not s.get("file"):
            errs.append(f"audio.sfx[{i}]: falta 'file'.")
        if s.get("at") is None:
            errs.append(f"audio.sfx[{i}]: falta 'at' (segundo en la timeline de salida).")
        rel = s.get("rel_db", -13)
        if not (-40 <= float(rel) <= 0):
            errs.append(f"audio.sfx[{i}].rel_db fuera de rango: {rel} (se espera entre -40 y 0).")
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


def map_masks_to_output(edl: dict) -> list[dict]:
    """Máscaras de privacidad re-mapeadas a la timeline de SALIDA.

    Las medís sobre el video crudo (que es donde podés leer el dato que hay que
    tapar) y las escribís en tiempo de FUENTE. Acá se recortan contra cada tramo
    del corte y se llevan al tiempo de salida, igual que los subtítulos: una
    máscara que cruza un corte sale partida en dos, y una que cae entera en un
    tramo descartado desaparece sola.

    Si ya la tenés medida sobre el archivo cortado, poné `"timeline": "output"`
    y pasa tal cual.
    """
    offs = _range_offsets(edl)
    sources = edl.get("sources") or {}
    only_source = next(iter(sources)) if len(sources) == 1 else None
    out: list[dict] = []
    for m in edl.get("masks", []):
        if m.get("timeline") == "output":
            out.append(dict(m))
            continue
        src = m.get("source") or only_source
        if src is None:
            continue
        for r, off in zip(edl.get("ranges", []), offs):
            if r.get("source") != src:
                continue
            a = max(float(m["from"]), r["start"])
            b = min(float(m["to"]), r["end"])
            if b <= a:
                continue
            out.append({**m,
                        "from": round(a - r["start"] + off, 3),
                        "to": round(b - r["start"] + off, 3),
                        "timeline": "output"})
    out.sort(key=lambda x: x["from"])
    return out
