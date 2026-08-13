"""Arma un EDL que 'tensa las pausas' de una fuente: saca los silencios largos dejando un
respiro corto, y conserva el habla. Usa los silencios ya detectados en el transcript
(o los detecta con silences.py). Salida = edl.json listo para render.py."""
from __future__ import annotations
import argparse, json, os, subprocess, sys
sys.path.insert(0, os.path.dirname(__file__))
from silences import detect_silences


def _duration(path: str) -> float:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "default=nw=1:nk=1", path], capture_output=True, text=True, check=True)
    return float(r.stdout.strip())


def build_tighten_edl(source: str, silences: list[dict], duration: float,
                      max_pause: float = 0.5, keep_pause: float = 0.15,
                      min_keep: float = 0.4, grade: str = "none",
                      source_name: str = "src") -> dict:
    """Conserva el habla; en cada silencio >= max_pause deja solo `keep_pause` de respiro."""
    long_sil = sorted((s for s in silences if s["dur"] >= max_pause), key=lambda s: s["start"])
    ranges, cursor = [], 0.0
    for sil in long_sil:
        end = min(sil["start"] + keep_pause, duration)
        if end - cursor >= min_keep:
            ranges.append({"source": source_name, "start": round(cursor, 3), "end": round(end, 3)})
        cursor = sil["end"]
    if duration - cursor >= min_keep:
        ranges.append({"source": source_name, "start": round(cursor, 3), "end": round(duration, 3)})
    return {"version": 1, "sources": {source_name: os.path.abspath(source)},
            "ranges": ranges, "grade": grade}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source")
    ap.add_argument("--out-edl", required=True)
    ap.add_argument("--transcript", help="json con 'silences' (si no, se detectan)")
    ap.add_argument("--grade", default="none")
    ap.add_argument("--max-pause", type=float, default=0.5)
    ap.add_argument("--keep-pause", type=float, default=0.15)
    ap.add_argument("--min-keep", type=float, default=0.4)
    ap.add_argument("--source-name", default="src")
    a = ap.parse_args()

    if a.transcript and os.path.exists(a.transcript):
        sil = json.load(open(a.transcript, encoding="utf-8")).get("silences") or []
        if not sil:
            sil = detect_silences(a.source)
    else:
        sil = detect_silences(a.source)

    dur = _duration(a.source)
    edl = build_tighten_edl(a.source, sil, dur, a.max_pause, a.keep_pause,
                            a.min_keep, a.grade, a.source_name)
    json.dump(edl, open(a.out_edl, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    kept = sum(r["end"] - r["start"] for r in edl["ranges"])
    print(f"EDL: {len(edl['ranges'])} tramos, {kept:.1f}s de {dur:.1f}s "
          f"(se sacaron {dur - kept:.1f}s de pausa) -> {a.out_edl}")


if __name__ == "__main__":
    main()
