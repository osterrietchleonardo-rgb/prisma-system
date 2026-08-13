"""Mezcla de audio — voz + cama musical + efectos, MEDIDA, no a ojo.

LA REGLA DEL DUCK
─────────────────
Ponerle `volume=0.14` a la música es una lotería sobre el mastering de esa pista.
Las camas de catálogo salen entre −10 y −20 LUFS: el mismo 0.14 suena 10 LU más
alto en una que en otra. Lo correcto es medir las dos y calcular:

    ganancia_cama_dB = (LUFS_voz − DUCK_LU) − LUFS_cama

DUCK_LU = 12 por defecto. 8 si querés la música más presente; 15-16 en piezas
largas o con camas densas.

Y `loudnorm` sobre la suma NO lo arregla: lo esconde. Sube la voz para compensar,
el archivo mide −14 LUFS y parece perfecto en el medidor, mientras la música se
le sigue comiendo la voz. Se normaliza AL FINAL, sobre una mezcla que ya está
bien.

POR QUÉ ADEMÁS HAY SIDECHAIN
────────────────────────────
Los −12 LU son un promedio. Una cama con rango dinámico alto se te sube encima
de la voz en los crescendos aunque la integrada cuadre. El `sidechaincompress`
usa la voz como llave: recorta solo esos picos y devuelve la cama entera en las
pausas. Emparejar LUFS sin sidechain alcanza para camas planas y falla en las
demás.

LOS EFECTOS SE CALIBRAN POR PICO
────────────────────────────────
No por integrada: en un golpe corto lo que se percibe es el pico.

    volumen = 10 ** ((pico_voz + objetivo_relativo − pico_sfx) / 20)

Referencia de `rel_db`:
    −9   cambio de capítulo o de montaje (el golpe fuerte)
    −13  hook, remate, tarjeta de cierre
    −18  entra un panel y el cuadro no cambia
    −21  apuntes, bandas chicas

AL REPORTAR, decilo en LU ("la música va 12 LU por debajo de la voz"), nunca como
multiplicador ni como nivel absoluto de la cama: el multiplicador no significa
nada sin saber el mastering de la pista.

EL VIDEO NO SE TOCA
───────────────────
Por defecto sale con `-c:v copy`: podés remezclar mil veces sin recomprimir la
imagen. Solo si le pasás `--reencode <perfil>` se vuelve a codificar.
"""
from __future__ import annotations
import argparse, json, os, re, subprocess, sys

sys.path.insert(0, os.path.dirname(__file__))
from export import encode_args, audio_args  # noqa: E402

DUCK_LU = 12.0
LOUDNORM = "loudnorm=I=-14:TP=-1.5:LRA=11"   # objetivo de IG/TikTok/YouTube
FMT = "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo"
SIDECHAIN = "sidechaincompress=threshold=0.03:ratio=4:attack=25:release=380:makeup=1:level_sc=1"

_LUFS_RE = re.compile(r"^\s+I:\s+(-?\d+\.?\d*)\s+LUFS", re.M)
_PEAK_RE = re.compile(r"max_volume:\s+(-?\d+\.?\d*) dB")


# ── matemática (pura, testeable) ─────────────────────────────────────────────

def bed_gain_db(voice_lufs: float, bed_lufs: float, duck_lu: float = DUCK_LU) -> float:
    """Cuántos dB hay que mover la cama para que quede `duck_lu` LU bajo la voz."""
    return (voice_lufs - duck_lu) - bed_lufs


def sfx_gain_db(voice_peak: float, rel_db: float, sfx_peak: float) -> float:
    """Cuántos dB mover un efecto para que su pico quede `rel_db` bajo el de la voz."""
    return voice_peak + rel_db - sfx_peak


def db_to_gain(db: float) -> float:
    return round(10 ** (db / 20), 4)


# ── medición ─────────────────────────────────────────────────────────────────

def _ffmpeg_stderr(args: list[str]) -> str:
    return subprocess.run(["ffmpeg", "-hide_banner", *args, "-f", "null", "-"],
                          capture_output=True, text=True).stderr


def lufs(path: str, stream: str | None = None) -> float:
    args = ["-i", path]
    if stream:
        args += ["-map", stream]
    out = _ffmpeg_stderr(args + ["-af", "ebur128"])
    vals = _LUFS_RE.findall(out)
    if not vals:
        raise RuntimeError(f"no pude medir la sonoridad de {path}")
    return float(vals[-1])


def peak(path: str, stream: str | None = None) -> float:
    args = ["-i", path]
    if stream:
        args += ["-map", stream]
    out = _ffmpeg_stderr(args + ["-af", "volumedetect"])
    m = _PEAK_RE.search(out)
    if not m:
        raise RuntimeError(f"no pude medir el pico de {path}")
    return float(m.group(1))


def _duration(path: str) -> float:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "default=nw=1:nk=1", path], capture_output=True, text=True, check=True)
    return float(r.stdout.strip())


def _wh(path: str) -> tuple[int, int]:
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0",
                        "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", path],
                       capture_output=True, text=True, check=True)
    try:
        w, h = r.stdout.strip().split("x")[:2]
        return int(w), int(h)
    except ValueError:
        return 0, 0


# ── filtergraph (puro) ───────────────────────────────────────────────────────

def build_filtergraph(dur: float, voice_label: str, beds: list[dict], sfx: list[dict],
                      swap: float | None = None, xfade: float = 2.0,
                      loudnorm: bool = True, sidechain: bool = True) -> str:
    """Arma el filter_complex de la mezcla. Función pura (no mide, no ejecuta).

    beds: [{"label": "2:a", "gain": 0.31}]  (1 o 2 camas)
    sfx:  [{"label": "4:a", "at": 18.6, "gain": 0.22}]
    """
    parts = [f"[{voice_label}]{FMT},apad=whole_dur={dur:.3f},asplit=2[voice][vkey]"]
    mix = ["[voice]"]

    if beds:
        if len(beds) == 1 or swap is None:
            b = beds[0]
            fade_out_at = max(0.0, dur - 2.6)
            parts.append(f"[{b['label']}]{FMT},atrim=0:{dur:.3f},volume={b['gain']},"
                         f"afade=t=in:st=0:d=1.5,"
                         f"afade=t=out:st={fade_out_at:.3f}:d=2.6[bgmraw]")
        else:
            a, b = beds[0], beds[1]
            b_len = dur - swap + xfade
            parts.append(f"[{a['label']}]{FMT},atrim=0:{swap + xfade:.3f},volume={a['gain']},"
                         f"afade=t=in:st=0:d=1.5,"
                         f"afade=t=out:st={swap:.3f}:d={xfade}[bgA]")
            parts.append(f"[{b['label']}]{FMT},atrim=0:{b_len:.3f},volume={b['gain']},"
                         f"afade=t=in:st=0:d={xfade},"
                         f"afade=t=out:st={max(0.0, b_len - 2.6):.3f}:d=2.6,"
                         f"adelay={int(swap * 1000)}|{int(swap * 1000)}[bgB]")
            parts.append("[bgA][bgB]amix=inputs=2:normalize=0:duration=longest[bgmraw]")
        if sidechain:
            parts.append(f"[bgmraw][vkey]{SIDECHAIN}[bgm]")
        else:
            parts.append("[bgmraw]anull[bgm]")
        mix.append("[bgm]")

    for i, s in enumerate(sfx):
        tag = f"[sx{i}]"
        ms = int(round(s["at"] * 1000))
        parts.append(f"[{s['label']}]{FMT},volume={s['gain']},adelay={ms}|{ms}{tag}")
        mix.append(tag)

    tail = f"amix=inputs={len(mix)}:normalize=0:duration=first,atrim=0:{dur:.3f}"
    if loudnorm:
        tail += f",{LOUDNORM}"
    parts.append("".join(mix) + tail + ",aresample=48000[aout]")
    return ";".join(parts)


# ── mezcla ───────────────────────────────────────────────────────────────────

def mix(video: str, out: str, voice: str | None = None, bgm: list[str] | None = None,
        sfx_spec: list[dict] | None = None, duck: float = DUCK_LU, swap: float | None = None,
        xfade: float = 2.0, loudnorm: bool = True, sidechain: bool = True,
        reencode: str | None = None, quiet: bool = False) -> dict:
    """Mezcla y escribe `out`. Devuelve el informe de lo que midió y aplicó."""
    bgm = bgm or []
    sfx_spec = sfx_spec or []
    if len(bgm) > 2:
        raise ValueError("como máximo 2 camas (la segunda marca el giro del video).")
    dur = _duration(video)

    def say(*a):
        if not quiet:
            print(*a)

    say("-- midiendo --")
    voice_src = voice or video
    voice_stream = None if voice else "0:a:0"
    v_lufs = lufs(voice_src, voice_stream)
    v_peak = peak(voice_src, voice_stream)
    say(f"   voz      {v_lufs:6.1f} LUFS · pico {v_peak:5.1f} dBFS"
        f"{'  (pista del video)' if not voice else f'  ({os.path.basename(voice)})'}")

    inputs = ["-i", video]
    idx = 1
    if voice:
        voice_label = f"{idx}:a"
        inputs += ["-i", voice]
        idx += 1
    else:
        voice_label = "0:a"

    beds = []
    for i, path in enumerate(bgm):
        b_lufs = lufs(path)
        g_db = bed_gain_db(v_lufs, b_lufs, duck)
        beds.append({"label": f"{idx}:a", "gain": db_to_gain(g_db),
                     "path": path, "lufs": b_lufs, "gain_db": round(g_db, 2)})
        inputs += ["-stream_loop", "-1", "-i", path]
        idx += 1
        say(f"   cama {chr(65 + i)}   {b_lufs:6.1f} LUFS -> {g_db:+.1f} dB "
            f"(queda {duck:.0f} LU bajo la voz)")

    sfx = []
    for s in sfx_spec:
        p = s["file"]
        s_peak = peak(p)
        g_db = sfx_gain_db(v_peak, float(s.get("rel_db", -13)), s_peak)
        sfx.append({"label": f"{idx}:a", "at": float(s["at"]), "gain": db_to_gain(g_db),
                    "path": p, "gain_db": round(g_db, 2), "rel_db": s.get("rel_db", -13)})
        inputs += ["-i", p]
        idx += 1
    if sfx:
        say(f"   {len(sfx)} efectos calibrados por pico contra el pico de la voz")

    fg = build_filtergraph(dur, voice_label, beds, sfx, swap, xfade, loudnorm, sidechain)
    os.makedirs(os.path.dirname(os.path.abspath(out)) or ".", exist_ok=True)

    if reencode:
        w, h = _wh(video)
        vargs = encode_args(reencode, w, h, audio=False)
    else:
        vargs = ["-c:v", "copy"]
    cmd = ["ffmpeg", "-y", "-v", "warning", *inputs, "-filter_complex", fg,
           "-map", "0:v", *vargs, "-map", "[aout]", *audio_args(reencode or "social"),
           "-movflags", "+faststart", out]
    say(f"\n-- mezclando {1 + len(beds) + len(sfx)} pistas -> {os.path.basename(out)} --")
    subprocess.run(cmd, check=True)

    report = {"voice_lufs": round(v_lufs, 2), "voice_peak": round(v_peak, 2),
              "duck_lu": duck, "beds": beds, "sfx": sfx, "out": out,
              "loudnorm": loudnorm, "sidechain": sidechain}
    if beds:
        say(f"listo · la música va {duck:.0f} LU por debajo de la voz")
    else:
        say("listo · sin cama musical")
    return report


def main():
    ap = argparse.ArgumentParser(
        description="Mezcla medida: voz + cama + efectos. El video no se recomprime.")
    ap.add_argument("video")
    ap.add_argument("-o", "--out", required=True)
    ap.add_argument("--voice", help="voz limpia aparte (default: la pista del video)")
    ap.add_argument("--bgm", action="append", default=[],
                    help="cama musical; repetir para una segunda (marca el giro)")
    ap.add_argument("--duck", type=float, default=DUCK_LU,
                    help="LU que la cama queda por debajo de la voz (8 presente, 15-16 discreta)")
    ap.add_argument("--swap", type=float, help="segundo del cambio de cama A -> B")
    ap.add_argument("--xfade", type=float, default=2.0)
    ap.add_argument("--sfx", help="json [{file, at, rel_db}] con los efectos")
    ap.add_argument("--no-loudnorm", action="store_true",
                    help="no normalizar a -14 LUFS (si ya lo hace otro paso)")
    ap.add_argument("--no-sidechain", action="store_true")
    ap.add_argument("--reencode", choices=("social", "master", "intermediate", "preview"),
                    help="recomprimir el video con ese perfil (default: copiarlo tal cual)")
    ap.add_argument("--report", help="escribir el informe de la mezcla en este json")
    a = ap.parse_args()

    sfx_spec = json.load(open(a.sfx, encoding="utf-8")) if a.sfx else []
    rep = mix(a.video, a.out, a.voice, a.bgm, sfx_spec, a.duck, a.swap, a.xfade,
              not a.no_loudnorm, not a.no_sidechain, a.reencode)
    if a.report:
        json.dump(rep, open(a.report, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print(f"   informe -> {a.report}")


if __name__ == "__main__":
    main()
