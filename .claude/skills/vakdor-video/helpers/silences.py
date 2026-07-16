"""Detección de silencios/pausas con ffmpeg silencedetect (señal de corte del Modo C).
whisper.cpp -ml 1 da timestamps contiguos (0 gaps), así que las pausas reales salen de acá,
no del ASR. Mismo motor que usa el Modo B para los jump cuts."""
from __future__ import annotations
import argparse, re, subprocess

_START = re.compile(r"silence_start:\s*(-?[\d.]+)")
_END = re.compile(r"silence_end:\s*(-?[\d.]+)")


def detect_silences(video: str, noise_db: float = -30.0, min_dur: float = 0.4) -> list[dict]:
    """Devuelve [{'start','end','dur'}] de cada silencio >= min_dur bajo noise_db."""
    r = subprocess.run(
        ["ffmpeg", "-i", video, "-af", f"silencedetect=noise={noise_db}dB:d={min_dur}",
         "-f", "null", "-"],
        capture_output=True, text=True)
    log = r.stderr
    starts = [float(m.group(1)) for m in _START.finditer(log)]
    ends = [float(m.group(1)) for m in _END.finditer(log)]
    out = []
    for i, s in enumerate(starts):
        e = ends[i] if i < len(ends) else None
        if e is None:
            continue
        out.append({"start": round(s, 3), "end": round(e, 3), "dur": round(e - s, 3)})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--noise-db", type=float, default=-30.0)
    ap.add_argument("--min-dur", type=float, default=0.4)
    a = ap.parse_args()
    sils = detect_silences(a.video, a.noise_db, a.min_dur)
    print(f"{len(sils)} silencios >= {a.min_dur}s (noise {a.noise_db}dB):")
    for s in sils:
        print(f"  {s['start']:8.2f} -> {s['end']:8.2f}  ({s['dur']:.2f}s)")


if __name__ == "__main__":
    main()
