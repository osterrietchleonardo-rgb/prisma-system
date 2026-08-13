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
        os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
        canvas.save(out)
    print("timeline ->", out)


if __name__ == "__main__":
    main()
