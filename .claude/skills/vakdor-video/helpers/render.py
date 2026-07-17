"""Compositor del Modo C. Reglas Duras: extract por-segmento (grade+fades 30ms) ->
concat lossless -> overlays (PTS-shift) -> subtítulos AL FINAL."""
from __future__ import annotations
import argparse, json, os, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(__file__))
from edl import load_edl, validate_edl, total_duration, master_srt_offsets
from grade import grade_filter
from subtitles import build_ass, DEFAULT_CORRECTIONS

FADE = 0.03  # 30 ms (Regla Dura 3)


def srt_timestamp(t: float) -> str:
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def build_srt(subs: list[dict]) -> str:
    out = []
    for i, s in enumerate(subs, 1):
        out.append(f"{i}\n{srt_timestamp(s['start'])} --> {srt_timestamp(s['end'])}\n{s['text']}\n")
    return "\n".join(out)


def group_word_subs(subs: list[dict], max_words: int = 4, max_dur: float = 2.6,
                    max_gap: float = 0.7) -> list[dict]:
    """Agrupa subtítulos word-level en cues de frase corta (más premium que palabra-por-palabra).
    Corta el cue al llegar a max_words, si el hueco al siguiente supera max_gap, o si la duración
    del cue superaría max_dur."""
    cues: list[dict] = []
    cur: list[dict] = []
    for w in subs:
        if cur:
            gap = w["start"] - cur[-1]["end"]
            dur = w["end"] - cur[0]["start"]
            if len(cur) >= max_words or gap > max_gap or dur > max_dur:
                cues.append(_flush_cue(cur))
                cur = []
        cur.append(w)
    if cur:
        cues.append(_flush_cue(cur))
    return cues


def _flush_cue(words: list[dict]) -> dict:
    return {
        "start": words[0]["start"],
        "end": words[-1]["end"],
        "text": " ".join(w["text"] for w in words),
    }


def _probe_duration(path: str) -> float:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "default=nw=1:nk=1", path], capture_output=True, text=True, check=True)
    return float(r.stdout.strip())


def _probe_wh(path: str) -> tuple[int, int]:
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0",
                        "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", path],
                       capture_output=True, text=True, check=True)
    w, h = r.stdout.strip().split("x")
    return int(w), int(h)


def _extract_segment(src, start, end, grade, out, preview):
    dur = end - start
    fade = f"afade=t=in:st=0:d={FADE},afade=t=out:st={max(dur - FADE, 0):.3f}:d={FADE}"
    vf = grade_filter(grade)
    if preview:
        vf = (vf + "," if vf else "") + "scale=-2:720"
    cmd = ["ffmpeg", "-ss", f"{start:.3f}", "-to", f"{end:.3f}", "-i", src]
    if vf:
        cmd += ["-vf", vf]
    cmd += ["-af", fade, "-c:v", "libx264", "-preset", "veryfast" if preview else "medium",
            "-crf", "23" if preview else "18", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k", "-y", out]
    subprocess.run(cmd, check=True, capture_output=True)


def render(edl_path: str, out: str, preview=False, build_subtitles=False, edit_dir=None,
           sub_chunk=0, emphasis=False, corrections=None):
    edl = load_edl(edl_path)
    errs = validate_edl(edl)
    if errs:
        raise ValueError("EDL inválido:\n  - " + "\n  - ".join(errs))
    base = os.path.dirname(os.path.abspath(edl_path))
    edit_dir = edit_dir or base
    sources = edl["sources"]
    grade = edl.get("grade", "none")

    with tempfile.TemporaryDirectory() as tmp:
        # 1) extract por-segmento (grade + fades)
        seg_files = []
        for i, r in enumerate(edl["ranges"]):
            seg = os.path.join(tmp, f"seg_{i:03d}.mp4")
            _extract_segment(sources[r["source"]], r["start"], r["end"], grade, seg, preview)
            seg_files.append(seg)
        # 2) concat lossless (Regla Dura 2)
        listf = os.path.join(tmp, "segs.txt")
        open(listf, "w", encoding="utf-8").write(
            "".join(f"file '{s.replace(chr(92), '/')}'\n" for s in seg_files))
        concat = os.path.join(tmp, "concat.mp4")
        subprocess.run(["ffmpeg", "-f", "concat", "-safe", "0", "-i", listf,
                        "-c", "copy", "-y", concat], check=True, capture_output=True)

        current = concat
        # 3) overlays (PTS-shift, Regla Dura 4) — un solo re-encode
        overlays = edl.get("overlays", [])
        if overlays:
            inputs, filters, last = ["-i", concat], [], "[0:v]"
            for k, ov in enumerate(overlays, start=1):
                inputs += ["-i", ov["file"]]
                st = ov["start_in_output"]; dur = ov["duration"]
                filters.append(
                    f"[{k}:v]setpts=PTS-STARTPTS+{st}/TB[ov{k}];"
                    f"{last}[ov{k}]overlay=enable='between(t,{st},{st + dur})':eof_action=pass[v{k}]")
                last = f"[v{k}]"
            ov_out = os.path.join(tmp, "ov.mp4")
            subprocess.run(["ffmpeg", *inputs, "-filter_complex", ";".join(filters),
                            "-map", last, "-map", "0:a", "-c:v", "libx264",
                            "-crf", "23" if preview else "18", "-pix_fmt", "yuv420p",
                            "-c:a", "copy", "-y", ov_out], check=True, capture_output=True)
            current = ov_out

        # 4) subtítulos AL FINAL (Regla Dura 1)
        srt_path = edl.get("subtitles")
        ass_path = None
        if build_subtitles and not srt_path:
            transcripts = {}
            tdir = os.path.join(edit_dir, "transcripts")
            for src in sources:
                p = os.path.join(tdir, f"{src}.json")
                if os.path.exists(p):
                    transcripts[src] = json.load(open(p, encoding="utf-8"))
            subs = master_srt_offsets(edl, transcripts)
            if sub_chunk and sub_chunk > 1:
                subs = group_word_subs(subs, max_words=sub_chunk)
            if emphasis:
                # Vía ASS: color cobre en palabras clave + correcciones de jerga.
                corr = DEFAULT_CORRECTIONS.copy()
                if corrections and os.path.exists(corrections):
                    corr.update({k.lower(): v for k, v in
                                 json.load(open(corrections, encoding="utf-8")).items()})
                w, h = _probe_wh(current)
                mv = int(h * 0.195)  # margen inferior relativo al alto (queda sobre el video)
                ass_path = os.path.join(edit_dir, "master.ass")
                open(ass_path, "w", encoding="utf-8").write(
                    build_ass(subs, width=w, height=h, margin_v=mv, corrections=corr))
                print(f"[subs] master.ass: {len(subs)} cues (cobre+correcciones)")
            else:
                srt_path = os.path.join(edit_dir, "master.srt")
                open(srt_path, "w", encoding="utf-8").write(build_srt(subs))
                print(f"[subs] master.srt: {len(subs)} líneas (chunk={sub_chunk or 'palabra'})")
        os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
        if ass_path and os.path.exists(ass_path):
            ass_ff = ass_path.replace("\\", "/").replace(":", "\\:")
            subprocess.run(["ffmpeg", "-i", current, "-vf", f"ass='{ass_ff}'",
                            "-c:v", "libx264", "-crf", "23" if preview else "18",
                            "-pix_fmt", "yuv420p", "-c:a", "copy", "-y", out],
                           check=True, capture_output=True)
        elif srt_path and os.path.exists(srt_path):
            style = ("FontName=Inter,FontSize=16,Bold=1,PrimaryColour=&H00FFFFFF,"
                     "OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,"
                     "Alignment=2,MarginV=48")
            srt_ff = srt_path.replace("\\", "/").replace(":", "\\:")
            subprocess.run(["ffmpeg", "-i", current,
                            "-vf", f"subtitles='{srt_ff}':force_style='{style}'",
                            "-c:v", "libx264", "-crf", "23" if preview else "18",
                            "-pix_fmt", "yuv420p", "-c:a", "copy", "-y", out],
                           check=True, capture_output=True)
        else:
            subprocess.run(["ffmpeg", "-i", current, "-c", "copy", "-y", out],
                           check=True, capture_output=True)

    got = _probe_duration(out)
    exp = total_duration(edl)
    print(f"[render] {out}  dur={got:.2f}s (EDL esperaba {exp:.2f}s, delta={abs(got - exp):.2f}s)")
    if abs(got - exp) > 0.5:
        print("  [!] diferencia de duracion > 0.5s: revisar cortes/overlays.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("edl")
    ap.add_argument("-o", "--out", required=True)
    ap.add_argument("--preview", action="store_true")
    ap.add_argument("--build-subtitles", action="store_true")
    ap.add_argument("--edit-dir")
    ap.add_argument("--sub-chunk", type=int, default=0,
                    help="palabras por cue de subtítulo (0=palabra-por-palabra; 3-4=frase corta)")
    ap.add_argument("--emphasis", action="store_true",
                    help="subtítulos .ass con palabras clave en cobre + correcciones de jerga")
    ap.add_argument("--corrections", help="json {mal: bien} extra para corregir términos")
    a = ap.parse_args()
    render(a.edl, a.out, a.preview, a.build_subtitles, a.edit_dir, a.sub_chunk,
           a.emphasis, a.corrections)


if __name__ == "__main__":
    main()
