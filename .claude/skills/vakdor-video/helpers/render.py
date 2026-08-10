"""Compositor del Modo C.

Orden de la cadena (cada paso es una Regla Dura, no una preferencia):

    extract por-segmento (grade + fades 30 ms)
      -> concat lossless
      -> máscaras de privacidad        (tapan la FUENTE, no los gráficos)
      -> overlays (PTS-shift)
      -> subtítulos                    (AL FINAL: si no, los overlays los tapan)
      -> mezcla de audio               (no toca la imagen: -c:v copy)

El cap de bitrate para redes se aplica UNA sola vez, en el paso que escribe el
archivo final. Todos los pasos intermedios van en calidad alta: capear en cada
paso suma una generación de compresión por paso.
"""
from __future__ import annotations
import argparse, json, os, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(__file__))
from edl import (load_edl, validate_edl, total_duration, master_srt_offsets,
                 map_masks_to_output)
from grade import grade_filter
from subtitles import build_ass, DEFAULT_CORRECTIONS
from frame_map import caption_margin_v
from export import encode_args, describe
from privacy import apply_masks
import mix_audio

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
    w, h = r.stdout.strip().split("x")[:2]
    return int(w), int(h)


def _ass_path_for_ffmpeg(path: str) -> str:
    return path.replace("\\", "/").replace(":", "\\:")


def _extract_segment(src, start, end, grade, out, work_profile):
    dur = end - start
    fade = f"afade=t=in:st=0:d={FADE},afade=t=out:st={max(dur - FADE, 0):.3f}:d={FADE}"
    vf = grade_filter(grade)
    if work_profile == "preview":
        vf = (vf + "," if vf else "") + "scale=-2:720"
    cmd = ["ffmpeg", "-ss", f"{start:.3f}", "-to", f"{end:.3f}", "-i", src]
    if vf:
        cmd += ["-vf", vf]
    cmd += ["-af", fade, *encode_args(work_profile), "-y", out]
    subprocess.run(cmd, check=True, capture_output=True)


def render(edl_path: str, out: str, preview=False, build_subtitles=False, edit_dir=None,
           sub_chunk=0, emphasis=False, corrections=None, sub_size=40,
           profile="social", no_masks=False, no_audio=False):
    edl = load_edl(edl_path)
    errs = validate_edl(edl)
    if errs:
        raise ValueError("EDL inválido:\n  - " + "\n  - ".join(errs))
    base = os.path.dirname(os.path.abspath(edl_path))
    edit_dir = edit_dir or base
    sources = edl["sources"]
    grade = edl.get("grade", "none")
    work_profile = "preview" if preview else "intermediate"
    final_profile = "preview" if preview else profile

    def rel(p: str) -> str:
        """Las rutas del EDL se resuelven contra la carpeta del EDL, no contra el cwd."""
        return p if os.path.isabs(p) else os.path.normpath(os.path.join(base, p))

    sources = {k: rel(v) for k, v in sources.items()}
    missing = [f"{k} -> {v}" for k, v in sources.items() if not os.path.exists(v)]
    if missing:
        raise FileNotFoundError("fuentes que no existen:\n  - " + "\n  - ".join(missing))

    with tempfile.TemporaryDirectory() as tmp:
        # 1) extract por-segmento (grade + fades)
        seg_files = []
        for i, r in enumerate(edl["ranges"]):
            seg = os.path.join(tmp, f"seg_{i:03d}.mp4")
            _extract_segment(sources[r["source"]], r["start"], r["end"], grade, seg, work_profile)
            seg_files.append(seg)
        # 2) concat lossless (Regla Dura 2)
        listf = os.path.join(tmp, "segs.txt")
        open(listf, "w", encoding="utf-8").write(
            "".join(f"file '{s.replace(chr(92), '/')}'\n" for s in seg_files))
        concat = os.path.join(tmp, "concat.mp4")
        subprocess.run(["ffmpeg", "-f", "concat", "-safe", "0", "-i", listf,
                        "-c", "copy", "-y", concat], check=True, capture_output=True)
        current = concat

        # 3) máscaras de privacidad (Regla Dura 13) — antes de los overlays:
        #    se tapa la fuente, nunca los gráficos que ponemos nosotros.
        masks = [] if no_masks else map_masks_to_output(edl)
        if masks:
            masked = os.path.join(tmp, "masked.mp4")
            apply_masks(current, masks, masked, work_profile)
            current = masked
            n_full = sum(1 for m in masks if m.get("rects") == "full")
            print(f"[privacidad] {len(masks)} máscaras aplicadas ({n_full} a cuadro completo)")

        # 4) overlays (PTS-shift, Regla Dura 4) — un solo re-encode
        overlays = edl.get("overlays", [])
        if overlays:
            inputs, filters, last = ["-i", current], [], "[0:v]"
            for k, ov in enumerate(overlays, start=1):
                inputs += ["-i", rel(ov["file"])]
                st = ov["start_in_output"]; dur = ov["duration"]
                filters.append(
                    f"[{k}:v]setpts=PTS-STARTPTS+{st}/TB[ov{k}];"
                    f"{last}[ov{k}]overlay=enable='between(t,{st},{st + dur})':eof_action=pass[v{k}]")
                last = f"[v{k}]"
            ov_out = os.path.join(tmp, "ov.mp4")
            subprocess.run(["ffmpeg", *inputs, "-filter_complex", ";".join(filters),
                            "-map", last, "-map", "0:a", *encode_args(work_profile, audio=False),
                            "-c:a", "copy", "-y", ov_out], check=True, capture_output=True)
            current = ov_out

        # 5) subtítulos AL FINAL (Regla Dura 1)
        w, h = _probe_wh(current)
        srt_path = edl.get("subtitles")
        srt_path = rel(srt_path) if srt_path else None
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
            corr = DEFAULT_CORRECTIONS.copy()
            if corrections and os.path.exists(corrections):
                corr.update({k.lower(): v for k, v in
                             json.load(open(corrections, encoding="utf-8")).items()})
            # El .srt se escribe siempre (sirve para subir aparte o revisar a mano);
            # lo que se quema es el .ass, que es el único formato en el que
            # controlamos el margen en píxeles reales y el color por palabra.
            srt_out = os.path.join(edit_dir, "master.srt")
            open(srt_out, "w", encoding="utf-8").write(build_srt(subs))
            mv = caption_margin_v(w, h, sub_size)
            ass_path = os.path.join(edit_dir, "master.ass")
            open(ass_path, "w", encoding="utf-8").write(
                build_ass(subs, width=w, height=h, fontsize=sub_size, margin_v=mv,
                          corrections=corr, emphasis=emphasis))
            print(f"[subs] {len(subs)} cues (chunk={sub_chunk or 'palabra'}"
                  f"{', cobre' if emphasis else ''}) · margen {mv}px sobre el borde inferior")
        elif srt_path and os.path.exists(srt_path):
            # SRT provisto a mano: se convierte al mismo .ass para respetar la
            # danger zone en vez de confiar en el escalado por defecto de libass.
            ass_path = os.path.join(edit_dir, "master.ass")
            open(ass_path, "w", encoding="utf-8").write(
                build_ass(_parse_srt(srt_path), width=w, height=h, fontsize=sub_size,
                          margin_v=caption_margin_v(w, h, sub_size), emphasis=emphasis))

        os.makedirs(os.path.dirname(os.path.abspath(out)) or ".", exist_ok=True)
        video_out = out if no_audio or not edl.get("audio") else os.path.join(tmp, "novoice.mp4")

        # 6) escritura final: acá y solo acá se aplica el perfil de salida
        if ass_path and os.path.exists(ass_path):
            subprocess.run(["ffmpeg", "-i", current,
                            "-vf", f"ass='{_ass_path_for_ffmpeg(ass_path)}'",
                            *encode_args(final_profile, w, h, audio=False),
                            "-c:a", "copy", "-y", video_out], check=True, capture_output=True)
        else:
            subprocess.run(["ffmpeg", "-i", current,
                            *encode_args(final_profile, w, h, audio=False),
                            "-c:a", "copy", "-y", video_out], check=True, capture_output=True)

        # 7) mezcla de audio (no toca la imagen)
        audio = None if no_audio else edl.get("audio")
        if audio:
            mix_audio.mix(
                video_out, out,
                voice=rel(audio["voice"]) if audio.get("voice") else None,
                bgm=[rel(p) for p in (audio.get("bgm") or [])],
                sfx_spec=[{**s, "file": rel(s["file"])} for s in (audio.get("sfx") or [])],
                duck=float(audio.get("duck_lu", mix_audio.DUCK_LU)),
                swap=audio.get("swap"), xfade=float(audio.get("xfade", 2.0)),
                loudnorm=audio.get("loudnorm", True),
                sidechain=audio.get("sidechain", True))

    got = _probe_duration(out)
    exp = total_duration(edl)
    print(f"[render] {out}  dur={got:.2f}s (EDL esperaba {exp:.2f}s, delta={abs(got - exp):.2f}s)")
    print(f"[export] {describe(final_profile, w, h)}")
    if abs(got - exp) > 0.5:
        print("  [!] diferencia de duracion > 0.5s: revisar cortes/overlays.")


def _parse_srt(path: str) -> list[dict]:
    """Lee un .srt a la lista de cues que usa build_ass."""
    def secs(ts: str) -> float:
        hh, mm, rest = ts.split(":")
        ss, ms = rest.replace(".", ",").split(",")
        return int(hh) * 3600 + int(mm) * 60 + int(ss) + int(ms) / 1000

    cues, block = [], []
    for line in open(path, encoding="utf-8").read().splitlines() + [""]:
        if line.strip():
            block.append(line)
            continue
        if len(block) >= 2:
            timing = next((b for b in block if "-->" in b), None)
            if timing:
                a, b = [t.strip() for t in timing.split("-->")]
                text = " ".join(block[block.index(timing) + 1:]).strip()
                if text:
                    cues.append({"start": secs(a), "end": secs(b), "text": text})
        block = []
    return cues


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
                    help="palabras clave en cobre (marca) dentro del subtítulo")
    ap.add_argument("--corrections", help="json {mal: bien} extra para corregir términos")
    ap.add_argument("--sub-size", type=int, default=40, help="tamaño de fuente del subtítulo (.ass)")
    ap.add_argument("--profile", default="social", choices=("social", "master", "intermediate"),
                    help="perfil del archivo final (social = cap de bitrate para redes)")
    ap.add_argument("--no-masks", action="store_true", help="ignorar las máscaras de privacidad")
    ap.add_argument("--no-audio", action="store_true", help="ignorar el bloque de mezcla del EDL")
    a = ap.parse_args()
    render(a.edl, a.out, a.preview, a.build_subtitles, a.edit_dir, a.sub_chunk,
           a.emphasis, a.corrections, a.sub_size, a.profile, a.no_masks, a.no_audio)


if __name__ == "__main__":
    main()
