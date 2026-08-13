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
        print("No hay videos en", a.videos_dir)
        return
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
