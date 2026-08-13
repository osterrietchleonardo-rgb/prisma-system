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
