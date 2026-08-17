"""Preparación del material — mirar el archivo ANTES de editarlo.

Cinco chequeos que evitan trabajo tirado:

1. FICHA. Resolución, fps, duración, cuántas pistas de audio.
2. PISTAS DUPLICADAS DE OBS. OBS suele escribir varias pistas idénticas. Se
   COMPRUEBA (comparando el volumen medio), no se asume: si son iguales,
   alcanza con `0:a:0`.
3. MICRÓFONO LIMPIO AL LADO. Si hay un MP3/WAV junto al video con la misma
   duración, ese es el micro y le gana al audio de la cámara.
4. ¿HACE FALTA CORTAR? Si el take no tiene huecos >0.4 s, o el transcript da más
   de ~230 palabras por minuto sin pausas, ese material YA lo editó alguien.
   Pasarle un cortador de silencios no saca nada y suma una generación de
   compresión. Ese caso se llama OVERLAY-ONLY: no cortás, solo ponés cosas
   encima.
5. MÁSTER PAREJO. Reencode a fps fijo con keyframes densos y color etiquetado,
   para que el seek por frame caiga donde tiene que caer.

Lo que NO hace, a propósito: acelerar el clip. Se nota y se rechaza. Si te lo
piden explícitamente, va `setpts=PTS/1.2` + `atempo=1.2` (el tono queda intacto)
en el MISMO pase que los cortes — y después hay que RE-TRANSCRIBIR, porque los
tiempos viejos no valen para nada.
"""
from __future__ import annotations
import argparse, json, os, re, subprocess, sys

sys.path.insert(0, os.path.dirname(__file__))
from silences import detect_silences  # noqa: E402
from export import COLOR_TAGS  # noqa: E402

MIN_GAP = 0.4
NOISE_DB = -30.0
FAST_WPM = 230.0
MIN_GAPS_TO_CUT = 3

# HDR -> SDR. Un celular moderno graba en HLG (arib-std-b67) o PQ (smpte2084) con
# primarios bt2020. Si esa señal se etiqueta como bt709 SIN convertirla —que es lo
# que hacía `make_master` antes de esto— el video sale oscuro y amarillento: los
# píxeles siguen siendo HLG pero el archivo jura que son bt709, así que todo lo que
# venga después (y el reproductor) lee la curva equivocada.
# Medido sobre "Video reel 2.mov" (frame 00:08, frente): sin convertir R175 G162 B146
# (el rojo y el verde se juntan = piel gris amarillenta); convertido R179 G138 B118.
# Es la misma cadena que usa el motor JS en engine/lib/hdr.mjs — si cambia una, cambia la otra.
HDR_TRANSFERS = {"arib-std-b67", "smpte2084"}
HDR_PRIMARIES = {"bt2020"}
TONEMAP_VF = ("zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,"
              "tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p")


def is_hdr(color_transfer: str | None, color_primaries: str | None) -> bool:
    """¿El material es HDR? Se decide por los metadatos del archivo, no por la resolución."""
    return color_transfer in HDR_TRANSFERS or color_primaries in HDR_PRIMARIES

_MEAN = re.compile(r"mean_volume:\s+(-?\d+\.?\d*) dB")


# ── funciones puras ──────────────────────────────────────────────────────────

def words_per_minute(n_words: int, duration_s: float) -> float:
    """Palabras por minuto. Por encima de ~230 sin pausas, alguien ya cortó esto."""
    if duration_s <= 0:
        return 0.0
    return round(n_words * 60.0 / duration_s, 1)


def cut_recommendation(n_gaps: int, wpm: float | None = None) -> dict:
    """¿Hay que cortar silencios o el take ya viene editado? Función pura."""
    if n_gaps < MIN_GAPS_TO_CUT:
        return {"verdict": "overlay-only",
                "reason": f"solo {n_gaps} huecos >{MIN_GAP}s: el take ya viene editado"}
    if wpm and wpm > FAST_WPM and n_gaps < MIN_GAPS_TO_CUT * 2:
        return {"verdict": "overlay-only",
                "reason": f"{wpm} palabras/min con {n_gaps} huecos: ritmo de material ya cortado"}
    return {"verdict": "cortar",
            "reason": f"{n_gaps} huecos >{MIN_GAP}s: hay silencio real para sacar"}


def tracks_are_duplicates(mean_volumes: list[float], tol_db: float = 0.5) -> bool:
    """¿Las pistas de audio son la misma cosa? Función pura."""
    if len(mean_volumes) < 2:
        return False
    return (max(mean_volumes) - min(mean_volumes)) <= tol_db


# ── sondas ───────────────────────────────────────────────────────────────────

def probe(video: str) -> dict:
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json",
         "-show_format", "-show_streams", video],
        capture_output=True, text=True, check=True)
    d = json.loads(r.stdout)
    v = next((s for s in d["streams"] if s["codec_type"] == "video"), {})
    audios = [s for s in d["streams"] if s["codec_type"] == "audio"]
    fps = 0.0
    if v.get("r_frame_rate", "0/1") != "0/1":
        num, den = v["r_frame_rate"].split("/")
        fps = round(float(num) / float(den), 3)
    return {
        "duration": float(d["format"].get("duration", 0)),
        "size_mb": round(int(d["format"].get("size", 0)) / 1e6, 1),
        "bitrate_mbps": round(int(d["format"].get("bit_rate", 0)) / 1e6, 2),
        "width": int(v.get("width", 0)), "height": int(v.get("height", 0)),
        "fps": fps, "vcodec": v.get("codec_name", "?"),
        "pix_fmt": v.get("pix_fmt", "?"),
        "color_space": v.get("color_space", "sin etiquetar"),
        "color_range": v.get("color_range", "sin etiquetar"),
        "color_transfer": v.get("color_transfer", "sin etiquetar"),
        "color_primaries": v.get("color_primaries", "sin etiquetar"),
        "is_hdr": is_hdr(v.get("color_transfer"), v.get("color_primaries")),
        "n_audio": len(audios),
        "acodec": audios[0].get("codec_name", "?") if audios else None,
    }


def track_mean_volume(video: str, index: int) -> float:
    out = subprocess.run(["ffmpeg", "-hide_banner", "-i", video, "-map", f"0:a:{index}",
                          "-af", "volumedetect", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    m = _MEAN.search(out)
    return float(m.group(1)) if m else float("nan")


def sibling_audio(video: str, tol_s: float = 0.15) -> str | None:
    """Busca un MP3/WAV al lado con la misma duración: es el micro limpio."""
    base, _ = os.path.splitext(video)
    dur = probe(video)["duration"]
    for ext in (".mp3", ".MP3", ".wav", ".WAV", ".m4a", ".M4A"):
        cand = base + ext
        if not os.path.exists(cand):
            continue
        try:
            r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                "-of", "default=nw=1:nk=1", cand],
                               capture_output=True, text=True, check=True)
            if abs(float(r.stdout.strip()) - dur) < tol_s:
                return cand
        except (subprocess.CalledProcessError, ValueError):
            continue
    return None


def make_master(video: str, out: str, fps: int = 30, audio_from: str | None = None) -> str:
    """Máster con fps fijo, keyframes densos y color etiquetado.

    Keyframe por segundo: el compositor busca por frame y sin keyframes densos el
    seek se va de lugar. El color se etiqueta explícito para que el reproductor no
    tenga que adivinar (y no te aplaste los negros).

    Si el material viene en HDR, acá se lo CONVIERTE a SDR antes de etiquetarlo. El
    máster es la puerta de entrada de todo el modo helpers: si el HDR pasa de largo,
    `COLOR_TAGS` le estampa "esto es bt709" a píxeles que no lo son y el amarillo se
    arrastra hasta el archivo final (ver el comentario de TONEMAP_VF arriba).
    """
    os.makedirs(os.path.dirname(os.path.abspath(out)) or ".", exist_ok=True)
    info = probe(video)
    # El tonemap va PRIMERO: `fps` solo tira/duplica frames, pero cualquier cosa que
    # toque color después tiene que trabajar sobre imagen ya en bt709.
    vf = f"{TONEMAP_VF},fps={fps}" if info["is_hdr"] else f"fps={fps}"
    cmd = ["ffmpeg", "-hide_banner", "-v", "error", "-i", video]
    if audio_from:
        cmd += ["-i", audio_from, "-map", "0:v:0", "-map", "1:a:0", "-shortest"]
    else:
        cmd += ["-map", "0:v:0", "-map", "0:a:0"]
    cmd += ["-vf", vf, "-c:v", "libx264", "-crf", "18", "-preset", "slow",
            "-g", str(fps), "-keyint_min", str(fps), "-pix_fmt", "yuv420p", *COLOR_TAGS,
            "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2",
            "-movflags", "+faststart", "-y", out]
    subprocess.run(cmd, check=True)
    return out


def inspect(video: str, transcript: str | None = None) -> dict:
    """Todos los chequeos, sin escribir nada. Devuelve el informe."""
    info = probe(video)
    report = {"file": video, **info}

    if info["n_audio"] > 1:
        vols = [track_mean_volume(video, i) for i in range(info["n_audio"])]
        report["track_volumes"] = vols
        report["tracks_duplicated"] = tracks_are_duplicates(
            [v for v in vols if v == v])  # descarta NaN

    report["sibling_audio"] = sibling_audio(video)

    gaps = detect_silences(video, NOISE_DB, MIN_GAP)
    report["n_gaps"] = len(gaps)
    wpm = None
    if transcript and os.path.exists(transcript):
        t = json.load(open(transcript, encoding="utf-8"))
        n_words = len(t.get("words", []))
        wpm = words_per_minute(n_words, info["duration"])
        report["words"] = n_words
        report["wpm"] = wpm
    report["cut"] = cut_recommendation(len(gaps), wpm)
    return report


def main():
    ap = argparse.ArgumentParser(description="Ficha del material y decisión de corte.")
    ap.add_argument("video")
    ap.add_argument("--transcript", help="json de transcribe.py, para calcular palabras/min")
    ap.add_argument("--master", metavar="OUT",
                    help="escribir un máster parejo (fps fijo, keyframes densos, bt709)")
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--use-sibling", action="store_true",
                    help="con --master, muxear el audio del MP3/WAV hermano si existe")
    ap.add_argument("--json", metavar="OUT", help="escribir el informe en un json")
    a = ap.parse_args()

    r = inspect(a.video, a.transcript)

    print(f"== {os.path.basename(a.video)} ==")
    print(f"   {r['width']}x{r['height']} · {r['fps']} fps · {r['duration']:.1f}s · "
          f"{r['size_mb']} MB · {r['bitrate_mbps']} Mbps · {r['vcodec']}/{r['pix_fmt']}")
    if r["is_hdr"]:
        print(f"   [!] material HDR ({r['color_transfer']}/{r['color_primaries']}): "
              f"HAY que pasarlo a máster (--master) antes de editar.")
        print(f"       Editar el HDR directo lo deja oscuro y amarillento — el máster "
              f"lo convierte a SDR bt709 de verdad.")
    elif r["color_space"] == "sin etiquetar" or r["color_range"] == "sin etiquetar":
        print(f"   [!] color {r['color_space']}/{r['color_range']}: conviene un máster "
              f"con bt709 explícito (--master)")

    print(f"\n== audio: {r['n_audio']} pista(s) ==")
    if r.get("track_volumes"):
        for i, v in enumerate(r["track_volumes"]):
            print(f"   pista {i}: volumen medio {v} dB")
        if r.get("tracks_duplicated"):
            print("   -> son la misma pista (típico de OBS): usá 0:a:0 y listo")
        else:
            print("   -> son distintas: escuchá cuál es el micro antes de elegir")
    if r["sibling_audio"]:
        print(f"   [!] hay un audio hermano con la misma duración: "
              f"{os.path.basename(r['sibling_audio'])}")
        print(f"       ese es el micro limpio y le gana al audio de la cámara "
              f"(--master --use-sibling)")

    print(f"\n== ¿hace falta cortar silencios? ==")
    print(f"   huecos >{MIN_GAP}s a {NOISE_DB}dB: {r['n_gaps']}")
    if r.get("wpm"):
        print(f"   ritmo: {r['wpm']} palabras/min ({r['words']} palabras)")
    v = r["cut"]
    if v["verdict"] == "overlay-only":
        print(f"   -> OVERLAY-ONLY · {v['reason']}")
        print("      no le pases un cortador de silencios: no sacaría nada y suma")
        print("      una generación de compresión. Solo overlays y subtítulos encima.")
    else:
        print(f"   -> CORTAR · {v['reason']}")
        print("      el corte va por EDL (límites de palabra + padding), no a ciegas.")

    if a.master:
        sib = r["sibling_audio"] if a.use_sibling else None
        out = make_master(a.video, a.master, a.fps, sib)
        print(f"\n== máster -> {out} ==")
        print(f"   {a.fps} fps · keyframe por segundo · bt709 explícito"
              + (" · HDR convertido a SDR" if r["is_hdr"] else "")
              + (f" · audio del hermano" if sib else ""))

    if a.json:
        json.dump(r, open(a.json, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print(f"\n   informe -> {a.json}")


if __name__ == "__main__":
    main()
