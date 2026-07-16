"""Transcribe un video a word-level JSON con whisper.cpp local (gratis, offline, es).
Reemplaza al transcribe.py de ElevenLabs Scribe. Cacheado por fuente (Regla Dura 9)."""
from __future__ import annotations
import argparse, json, os, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(__file__))
from whisper_parse import parse_whisper_tokens, merge_punctuation, group_into_phrases
from silences import detect_silences

DEFAULT_WHISPER = r"C:\whisper-cpp"
PARSER_VERSION = 4  # subir cuando cambie el parseo -> invalida caches viejos


def _cache_valid(cache_path: str, video: str) -> bool:
    if not os.path.exists(cache_path):
        return False
    try:
        meta = json.load(open(cache_path, encoding="utf-8"))
    except Exception:
        return False
    st = os.stat(video)
    return (meta.get("parser_version") == PARSER_VERSION
            and meta.get("source_mtime") == int(st.st_mtime)
            and meta.get("source_size") == st.st_size)


def transcribe_file(video: str, edit_dir: str, lang: str = "es",
                    model: str = "medium", whisperdir: str = DEFAULT_WHISPER) -> str:
    stem = os.path.splitext(os.path.basename(video))[0]
    tdir = os.path.join(edit_dir, "transcripts")
    os.makedirs(tdir, exist_ok=True)
    cache_path = os.path.join(tdir, f"{stem}.json")
    if _cache_valid(cache_path, video):
        print(f"[whisper] cache HIT: {cache_path}")
        return cache_path

    main_exe = os.path.join(whisperdir, "main.exe")
    model_bin = os.path.join(whisperdir, f"ggml-{model}.bin")
    for p in (main_exe, model_bin):
        if not os.path.exists(p):
            raise FileNotFoundError(f"whisper.cpp falta: {p} (ver install.md)")

    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, "in16k.wav")
        subprocess.run(["ffmpeg", "-i", video, "-ar", "16000", "-ac", "1", "-y", wav],
                       check=True, capture_output=True)
        out_base = os.path.join(tmp, "out")
        # -ojf => JSON completo con tokens; reconstruimos palabras (word-level, Regla Dura 8).
        # (NO -ml 1: fragmentaba palabras. La segmentación natural transcribe mejor.)
        subprocess.run([main_exe, "-m", model_bin, "-l", lang,
                        "-ojf", "-of", out_base, wav], check=True, capture_output=True)
        data = json.load(open(out_base + ".json", encoding="utf-8"))

    words = merge_punctuation(parse_whisper_tokens(data))
    silences = detect_silences(video, noise_db=-30.0, min_dur=0.4)
    phrases = group_into_phrases(words, silences=silences)
    st = os.stat(video)
    payload = {
        "source": stem, "source_path": os.path.abspath(video),
        "language": lang, "parser_version": PARSER_VERSION,
        "source_mtime": int(st.st_mtime), "source_size": st.st_size,
        "words": words, "phrases": phrases, "silences": silences,
    }
    json.dump(payload, open(cache_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"[whisper] {stem}: {len(words)} words, {len(phrases)} frases -> {cache_path}")
    return cache_path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--edit-dir", required=True)
    ap.add_argument("--lang", default="es")
    ap.add_argument("--model", default="medium")
    ap.add_argument("--whisperdir", default=DEFAULT_WHISPER)
    a = ap.parse_args()
    transcribe_file(a.video, a.edit_dir, a.lang, a.model, a.whisperdir)


if __name__ == "__main__":
    main()
