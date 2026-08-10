"""Mapa del encuadre — medir ANTES de poner nada encima.

Sin esto se diseña a ciegas y los subtítulos o un overlay terminan sobre la cara
del que habla, o debajo de la botonera de TikTok. Da cuatro cosas:

  1. cortes de plano (dónde cambia el encuadre)
  2. tira de contactos (qué hay en cada tramo)
  3. regla con rejilla + danger zones dibujadas (para leer píxeles reales)
  4. recorte en resolución NATIVA (para medir lo que hay que tapar)

Los tres tipos de plano y dónde puede ir un gráfico
───────────────────────────────────────────────────
  · a cámara        → por debajo de la barbilla. La cara es el producto: nada la cruza.
  · plano de pantalla → en la franja sin contenido. El footage YA es la infografía;
                        no tapes la interfaz que estás señalando.
  · pantalla partida → todo vive en la costura. El pie de la captura suele ser
                        barra de estado y ese sí se puede tapar.

Qué anotar después de correr esto: barbilla, costura, zonas muertas, y CUALQUIER
cosa privada visible (correos, teléfonos, nombres de clientes, precios, rutas,
tokens). Lo privado se mide en nativo con `--crop`, nunca sobre la tira: sobre
una miniatura de 180px te podés desviar 400 píxeles reales.
"""
from __future__ import annotations
import argparse, os, re, subprocess

FORMATS = {
    "vertical": (1080, 1920),
    "horizontal": (1920, 1080),
    "cuadrado": (1080, 1080),
}

# Zonas que la UI de la plataforma se come. Nada informativo va acá adentro.
#
#   vertical  — unión del peor caso de TikTok y Reels (TikTok sube mucho por
#               abajo; Reels muerde arriba y a la derecha). Números medidos.
#   horizontal— YouTube/LinkedIn: barra de progreso y controles abajo, chrome
#               arriba al pasar el mouse. Derivado conservador, no medido.
#   cuadrado  — feed de IG: el menú arriba a la derecha. Derivado conservador.
#
# Están expresados en píxeles sobre la resolución de referencia del formato y se
# escalan solos si el video viene en otra resolución.
DANGER_ZONES = {
    "vertical": {"top": 250, "bottom": 500, "left": 70, "right": 140},
    "horizontal": {"top": 60, "bottom": 120, "left": 60, "right": 60},
    "cuadrado": {"top": 60, "bottom": 100, "left": 60, "right": 60},
}


def format_of(width: int, height: int) -> str:
    """Clasifica por relación de aspecto, no por resolución exacta."""
    if height > width * 1.15:
        return "vertical"
    if width > height * 1.15:
        return "horizontal"
    return "cuadrado"


def danger_zone(width: int, height: int) -> dict:
    """Danger zone del formato, escalada a la resolución real del video."""
    fmt = format_of(width, height)
    ref_w, ref_h = FORMATS[fmt]
    base = DANGER_ZONES[fmt]
    sx, sy = width / ref_w, height / ref_h
    return {
        "top": int(round(base["top"] * sy)),
        "bottom": int(round(base["bottom"] * sy)),
        "left": int(round(base["left"] * sx)),
        "right": int(round(base["right"] * sx)),
    }


def safe_box(width: int, height: int) -> dict:
    """Rectángulo utilizable: {x0, y0, x1, y1}. Todo lo informativo va acá adentro."""
    dz = danger_zone(width, height)
    return {"x0": dz["left"], "y0": dz["top"],
            "x1": width - dz["right"], "y1": height - dz["bottom"]}


def caption_margin_v(width: int, height: int, fontsize: int = 40,
                     floor_ratio: float = 0.195) -> int:
    """Margen inferior del subtítulo, en píxeles, que respeta la danger zone.

    Toma el mayor entre el margen relativo histórico (19.5% del alto, que es lo
    que ya venía usando el Modo C y se ve bien en horizontal) y el borde de la
    danger zone más medio renglón. Así el horizontal no cambia de aspecto y el
    vertical deja de caer debajo de la botonera de TikTok.
    """
    dz = danger_zone(width, height)
    return max(int(height * floor_ratio), dz["bottom"] + fontsize // 2)


def probe_wh(video: str) -> tuple[int, int]:
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0",
                        "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", video],
                       capture_output=True, text=True, check=True)
    w, h = r.stdout.strip().split("x")[:2]
    return int(w), int(h)


def probe_duration(video: str) -> float:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "default=nw=1:nk=1", video],
                       capture_output=True, text=True, check=True)
    return float(r.stdout.strip())


_PTS = re.compile(r"pts_time:([\d.]+)")


def parse_scene_times(ffmpeg_log: str) -> list[float]:
    """Extrae los pts_time del log de metadata=print. Función pura, testeable."""
    return [round(float(m.group(1)), 2) for m in _PTS.finditer(ffmpeg_log)]


def scene_cuts(video: str, threshold: float = 0.15) -> list[float]:
    """Segundos donde cambia el plano. Umbral bajo = más sensible."""
    r = subprocess.run(
        ["ffmpeg", "-hide_banner", "-v", "error", "-i", video,
         "-vf", f"select='gt(scene,{threshold})',metadata=print:file=-",
         "-an", "-f", "null", "-"],
        capture_output=True, text=True)
    return parse_scene_times(r.stdout + r.stderr)


def contact_sheet(video: str, out: str, frames: int = 12) -> str:
    """Tira horizontal con N frames repartidos en todo el video."""
    dur = probe_duration(video)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    tmp = []
    tmpdir = os.path.join(os.path.dirname(os.path.abspath(out)), "_tira")
    os.makedirs(tmpdir, exist_ok=True)
    for i in range(frames):
        t = dur * i / frames
        p = os.path.join(tmpdir, f"t{i:02d}.png")
        subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", video,
                        "-frames:v", "1", "-vf", "scale=200:-1", "-y", p], check=True)
        tmp.append(p)
    ins = sum([["-i", p] for p in tmp], [])
    subprocess.run(["ffmpeg", "-v", "error", *ins, "-filter_complex",
                    "".join(f"[{i}]" for i in range(frames)) + f"hstack={frames}",
                    "-y", out], check=True)
    for p in tmp:
        os.remove(p)
    os.rmdir(tmpdir)
    return out


def ruler_filter(width: int, height: int, step: int = 100) -> str:
    """Filtro de la regla: rejilla + danger zones sombreadas. Función pura.

    Se dibuja a resolución NATIVA a propósito: lo que leés en la imagen es el
    píxel real, sin multiplicar por nada. Multiplicar a ojo es de donde salen
    los errores de 400 píxeles.
    """
    parts = []
    dz = danger_zone(width, height)
    # Danger zones en rojo translúcido: lo que se ve tapado es lo que la app tapa.
    if dz["top"]:
        parts.append(f"drawbox=x=0:y=0:w=iw:h={dz['top']}:color=red@0.20:t=fill")
    if dz["bottom"]:
        parts.append(f"drawbox=x=0:y={height - dz['bottom']}:w=iw:h={dz['bottom']}"
                     ":color=red@0.20:t=fill")
    if dz["left"]:
        parts.append(f"drawbox=x=0:y=0:w={dz['left']}:h=ih:color=red@0.20:t=fill")
    if dz["right"]:
        parts.append(f"drawbox=x={width - dz['right']}:y=0:w={dz['right']}:h=ih"
                     ":color=red@0.20:t=fill")
    # Rejilla: línea fina cada `step`, línea gruesa cada 5 pasos (para contar rápido).
    for y in range(step, height, step):
        thick = (y % (step * 5) == 0)
        parts.append(f"drawbox=x=0:y={y}:w=iw:h={2 if thick else 1}"
                     f":color={'cyan' if thick else 'white'}@{0.75 if thick else 0.35}:t=fill")
    for x in range(step, width, step):
        thick = (x % (step * 5) == 0)
        parts.append(f"drawbox=x={x}:y=0:w={2 if thick else 1}:h=ih"
                     f":color={'cyan' if thick else 'white'}@{0.75 if thick else 0.35}:t=fill")
    return ",".join(parts)


def ruler_frame(video: str, t: float, out: str, step: int = 100) -> str:
    """Un frame con la regla encima, en resolución nativa."""
    w, h = probe_wh(video)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", video,
                    "-frames:v", "1", "-vf", ruler_filter(w, h, step), "-y", out], check=True)
    return out


def crop_native(video: str, t: float, rect: tuple[int, int, int, int], out: str) -> str:
    """Recorte a tamaño real de una zona (para leer qué dice antes de taparla)."""
    x, y, w, h = rect
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", video,
                    "-frames:v", "1", "-vf", f"crop={w}:{h}:{x}:{y}", "-y", out], check=True)
    return out


def main():
    ap = argparse.ArgumentParser(description="Mapa del encuadre: planos, tira, regla, recorte.")
    ap.add_argument("video")
    ap.add_argument("-o", "--out-dir", help="carpeta de salida (default: <video>/mapa)")
    ap.add_argument("--scene-threshold", type=float, default=0.15)
    ap.add_argument("--frames", type=int, default=12, help="cuadros de la tira de contactos")
    ap.add_argument("--ruler-at", type=float, help="segundo del frame con regla (default: mitad)")
    ap.add_argument("--step", type=int, default=100, help="paso de la rejilla en px")
    ap.add_argument("--crop", help="recorte nativo 'x,y,w,h' (requiere --at)")
    ap.add_argument("--at", type=float, help="segundo del recorte nativo")
    a = ap.parse_args()

    out_dir = a.out_dir or os.path.join(os.path.dirname(os.path.abspath(a.video)), "mapa")
    os.makedirs(out_dir, exist_ok=True)
    w, h = probe_wh(a.video)
    dur = probe_duration(a.video)
    fmt = format_of(w, h)
    dz = danger_zone(w, h)
    sb = safe_box(w, h)

    print(f"== {os.path.basename(a.video)} · {w}x{h} · {dur:.1f}s · formato {fmt} ==")
    print(f"   danger zone: arriba {dz['top']} · abajo {dz['bottom']} · "
          f"izq {dz['left']} · der {dz['right']}")
    print(f"   caja segura: x {sb['x0']}-{sb['x1']} · y {sb['y0']}-{sb['y1']}")
    print(f"   margen de subtítulo recomendado: {caption_margin_v(w, h)} px desde abajo")

    if a.crop:
        if a.at is None:
            ap.error("--crop necesita --at <segundo>")
        x, y, cw, ch = (int(v) for v in a.crop.split(","))
        p = crop_native(a.video, a.at, (x, y, cw, ch), os.path.join(out_dir, "crop.png"))
        print(f"\n   recorte nativo -> {p}")
        return

    cuts = scene_cuts(a.video, a.scene_threshold)
    print(f"\n== cortes de plano ({len(cuts)}) ==")
    print("   " + (", ".join(f"{c:.2f}s" for c in cuts) if cuts
                   else "ninguno (plano fijo o umbral muy alto)"))

    tira = contact_sheet(a.video, os.path.join(out_dir, "tira.png"), a.frames)
    print(f"\n== tira de contactos -> {tira} ==")

    at = a.ruler_at if a.ruler_at is not None else dur / 2
    regla = ruler_frame(a.video, at, os.path.join(out_dir, "regla.png"), a.step)
    print(f"== regla ({at:.1f}s) -> {regla} ==")
    print(f"   rejilla cada {a.step}px (línea cian cada {a.step * 5}px) · "
          f"resolución nativa, el píxel que leés es el píxel real")
    print("   las bandas rojas son lo que tapa la app: nada informativo ahí adentro")

    print("\n-- QUÉ ANOTAR --")
    print("   · barbilla en los planos a cámara -> techo de cualquier overlay")
    print("   · si hay pantalla partida: fin de la captura y arriba de la cabeza")
    print("   · si hay plano de pantalla: qué franja NO tiene nada que leer")
    print("   · TODO dato privado visible (correos, teléfonos, clientes, precios, rutas, tokens)")
    print(f"   para medir lo privado en nativo:")
    print(f"     python frame_map.py \"{os.path.basename(a.video)}\" --at <seg> --crop x,y,w,h")


if __name__ == "__main__":
    main()
