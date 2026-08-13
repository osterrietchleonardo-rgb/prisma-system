"""Spec de export — un solo lugar donde vive el encoding.

Regla de generaciones: los pasos INTERMEDIOS del pipeline van en calidad alta
(`intermediate`, CRF 18, sin cap de bitrate). El cap de bitrate se aplica UNA
sola vez, en el archivo que se sube (`social`). Si capeás en cada paso, sumás
una generación de compresión por paso y llegás al final con el doble de daño.

Por qué el cap y no el máximo
─────────────────────────────
Instagram/TikTok recomprimen todo a ~3.5 Mbps, y cuanto más alto le entregás,
más agresiva es esa pasada: un máster de 30 Mbps se ve PEOR publicado que uno
de 6. El número de referencia (6 Mbps a 1080×1920) es medido; para otros
formatos se escala por cantidad de píxeles, con piso de 4.5 Mbps.

Por qué bt709 siempre
─────────────────────
Sin las etiquetas de color explícitas el encoder puede sacar `yuvj420p` con
`color_range=pc`, y los reproductores que ignoran la etiqueta te aplastan los
negros.

OJO CON LOS FLAGS: no alcanza con `-colorspace bt709 -color_primaries bt709
-color_trc bt709`. Verificado en ffmpeg 8.1.1: de esos, al VUI del H.264 solo
llegan `colorspace` y `color_range`; `color_primaries` y `color_trc` quedan en
`unknown` en el archivo. Hay que pasarlos ADEMÁS por `-x264-params`. Se
comprueba con:

    ffprobe -v error -select_streams v:0 \\
      -show_entries stream=color_space,color_primaries,color_transfer,color_range \\
      -of default=nw=1 <archivo>

Los cuatro tienen que decir bt709/tv. Si dos dicen `unknown`, faltan los
`-x264-params`.

H.265 nunca: pesa menos pero da errores de subida. No compensa.
"""
from __future__ import annotations

# Referencia medida para vertical 1080×1920.
REF_BITRATE_MBPS = 6.0
REF_PIXELS = 1080 * 1920
MIN_BITRATE_MBPS = 4.5

# Etiquetado de color a nivel de stream. Necesario pero NO suficiente (ver arriba).
BT709 = ["-color_range", "tv", "-colorspace", "bt709",
         "-color_primaries", "bt709", "-color_trc", "bt709"]
# Lo que de verdad escribe primaries y transfer en el VUI con libx264.
X264_BT709 = ["-x264-params", "colorprim=bt709:transfer=bt709:colormatrix=bt709:range=tv"]
# Etiquetado completo. Va en TODA salida, intermedia y final.
COLOR_TAGS = BT709 + X264_BT709

PROFILES = ("social", "master", "intermediate", "preview")


def social_bitrate_mbps(width: int, height: int) -> float:
    """Bitrate objetivo para publicar, escalado por píxeles desde la referencia.

    1080×1920 y 1920×1080 dan los dos 6.0 (mismo recuento de píxeles).
    1080×1080 baja, pero nunca por debajo del piso.
    """
    if width <= 0 or height <= 0:
        return REF_BITRATE_MBPS
    scaled = REF_BITRATE_MBPS * (width * height) / REF_PIXELS
    return round(max(MIN_BITRATE_MBPS, min(scaled, REF_BITRATE_MBPS)), 2)


def video_args(profile: str = "intermediate", width: int = 0, height: int = 0,
               fps: int | None = None) -> list[str]:
    """Argumentos de video de ffmpeg para el perfil pedido."""
    if profile not in PROFILES:
        raise ValueError(f"perfil desconocido: {profile} (usá {', '.join(PROFILES)})")
    args = ["-c:v", "libx264", "-pix_fmt", "yuv420p"]
    if profile == "social":
        mbps = social_bitrate_mbps(width, height)
        args += [
            "-profile:v", "high", "-level", "4.1", "-preset", "slow",
            "-b:v", f"{mbps}M",
            "-maxrate", f"{round(mbps * 1.08, 2)}M",
            "-bufsize", f"{round(mbps * 2, 2)}M",
        ]
        if fps:
            # keyframe cada 2 s: lo que esperan los reproductores de feed.
            args += ["-g", str(int(fps * 2)), "-keyint_min", str(int(fps))]
    elif profile == "master":
        args += ["-preset", "slow", "-crf", "17"]
    elif profile == "intermediate":
        args += ["-preset", "medium", "-crf", "18"]
    else:  # preview
        args += ["-preset", "veryfast", "-crf", "23"]
    return args + COLOR_TAGS


def audio_args(profile: str = "intermediate") -> list[str]:
    """AAC 256k/48 kHz para lo que se publica; 192k alcanza para lo intermedio."""
    bitrate = "256k" if profile in ("social", "master") else "192k"
    return ["-c:a", "aac", "-b:a", bitrate, "-ar", "48000"]


def container_args(profile: str = "intermediate") -> list[str]:
    """+faststart mueve el índice al principio: sin eso, el reproductor web
    tiene que bajar el archivo entero antes de empezar."""
    return ["-movflags", "+faststart"] if profile in ("social", "master") else []


def encode_args(profile: str = "intermediate", width: int = 0, height: int = 0,
                fps: int | None = None, audio: bool = True) -> list[str]:
    """Todos los argumentos de salida del perfil, listos para concatenar al comando."""
    args = video_args(profile, width, height, fps)
    if audio:
        args += audio_args(profile)
    return args + container_args(profile)


def describe(profile: str, width: int = 0, height: int = 0) -> str:
    """Una línea legible de qué se va a escribir (para el log)."""
    if profile == "social":
        mbps = social_bitrate_mbps(width, height)
        return (f"social · H.264 {width}×{height} · ~{mbps} Mbps (cap) · "
                f"AAC 256k/48k · bt709 · +faststart")
    crf = {"master": 17, "intermediate": 18, "preview": 23}.get(profile, 18)
    return f"{profile} · H.264 CRF {crf} · bt709"
