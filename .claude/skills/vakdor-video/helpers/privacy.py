"""Máscaras de privacidad — tapar lo que no debía publicarse.

Si en un plano se ve una pantalla, casi seguro se ve algo que no querías
publicar: un chat con el teléfono de un cliente, una bandeja de correo, precios,
nombres, una ruta de archivo, un token. Esto lo tapa sin matar la demo.

DESENFOQUE, NO CAJA OPACA
─────────────────────────
A 1080p un blur de sigma 15-18 destruye texto de 12-14 px y aun así deja ver el
MOVIMIENTO — que muchas veces ES la demo ("toco acá y se actualiza allá"). Una
caja negra mata las dos cosas y encima grita "acá había algo".

LOS CUATRO ERRORES QUE CUESTAN UNA RONDA DE RENDER
──────────────────────────────────────────────────
1. MEDIR SOBRE MINIATURAS. Sobre un thumb de 200 px te desviás 400 píxeles
   reales. Se mide en nativo: `frame_map.py --at <seg> --crop x,y,w,h`.
2. AJUSTAR LA CAJA EXACTA AL TEXTO. El degradado del borde se come ~26 px en
   cada extremo, así que el texto se lee en el filo. Toda caja se expande
   `FEATHER` px por lado — acá se hace solo, no lo calcules a mano.
3. PERSEGUIR EL TEXTO FRAME A FRAME. Si la cámara va a mano e interpolás la
   POSICIÓN, la caja se adelanta al contenido y deja renglones al aire, además
   del temblor. La regla es ANCLAR Y CRECER: si pasás `rects_end`, acá se usa
   la UNIÓN de la caja inicial y la final durante toda la ventana. Tapa un poco
   de más al principio y nunca de menos.
4. BARRIDOS DE CÁMARA CON CAJA FIJA. En un paneo el contenido cruza en diagonal
   y ninguna caja lo sigue. Esos tramos van a cuadro completo (`"full"`).
   Recortado al giro real (0.5-0.7 s) no se nota: ya viene con motion blur.

VERIFICAR SIEMPRE SOBRE EL ARCHIVO FINAL, con recortes nativos de los bordes de
cada máscara (`verify_masks`). Nunca sobre el still escalado del render.

Formato de las máscaras (lista, o `masks` dentro del EDL):

    [{"from": 18.4, "to": 21.8,
      "rects": [[250, 300, 600, 470], [0, 1380, 1080, 620]],
      "rects_end": [[250, 300, 830, 600], [0, 1380, 1080, 620]],
      "note": "ventana con datos del cliente, la cámara deriva"},
     {"from": 21.8, "to": 22.5, "rects": "full", "note": "barrido"}]
"""
from __future__ import annotations
import argparse, json, os, subprocess, sys

sys.path.insert(0, os.path.dirname(__file__))
from export import encode_args  # noqa: E402

FEATHER = 26      # px que la caja se pasa del texto por el degradado del borde
SIGMA = 17.0      # fuerza del blur a 1080p: mata texto de 12-14px
SIGMA_FULL = 18.0
PAD_IN = 0.20     # el blur entra/sale con un fundido: aparecer de golpe se lee como glitch


def _even(v: int) -> int:
    return v if v % 2 == 0 else v + 1


def expand_rect(rect, width: int, height: int, feather: int = FEATHER):
    """Expande la caja `feather` px por lado y la recorta al cuadro. Función pura."""
    x, y, w, h = (int(round(v)) for v in rect)
    x0 = max(0, x - feather)
    y0 = max(0, y - feather)
    x1 = min(width, x + w + feather)
    y1 = min(height, y + h + feather)
    w2 = _even(max(2, x1 - x0))
    h2 = _even(max(2, y1 - y0))
    # si el redondeo a par se pasó del borde, corregir el origen
    if x0 + w2 > width:
        x0 = max(0, width - w2)
    if y0 + h2 > height:
        y0 = max(0, height - h2)
    return (x0, y0, w2, h2)


def union_rect(a, b):
    """Unión de dos cajas — la implementación de 'anclar y crecer'. Función pura."""
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    x0, y0 = min(ax, bx), min(ay, by)
    x1, y1 = max(ax + aw, bx + bw), max(ay + ah, by + bh)
    return (x0, y0, x1 - x0, y1 - y0)


def resolve_mask(mask: dict, width: int, height: int, feather: int = FEATHER):
    """Cajas finales de una máscara, ya unidas y expandidas. Función pura.

    Devuelve "full" o una lista de tuplas (x, y, w, h).
    """
    rects = mask.get("rects")
    if rects == "full":
        return "full"
    ends = mask.get("rects_end") or []
    out = []
    for i, r in enumerate(rects or []):
        base = tuple(int(round(v)) for v in r)
        if i < len(ends):
            base = union_rect(base, tuple(int(round(v)) for v in ends[i]))
        out.append(expand_rect(base, width, height, feather))
    return out


def validate_masks(masks: list[dict], width: int = 0, height: int = 0) -> list[str]:
    """Errores de las máscaras, en castellano. Función pura."""
    errs: list[str] = []
    for i, m in enumerate(masks or []):
        f, t = m.get("from"), m.get("to")
        if f is None or t is None:
            errs.append(f"mask[{i}]: faltan 'from' y/o 'to'.")
            continue
        if not (f < t):
            errs.append(f"mask[{i}]: 'from' debe ser < 'to' (from={f}, to={t}).")
        rects = m.get("rects")
        if rects != "full":
            if not rects:
                errs.append(f"mask[{i}]: sin 'rects' (usá una lista o \"full\").")
                continue
            for j, r in enumerate(rects):
                if len(r) != 4:
                    errs.append(f"mask[{i}].rects[{j}]: se esperaban 4 números [x,y,w,h].")
                elif r[2] <= 0 or r[3] <= 0:
                    errs.append(f"mask[{i}].rects[{j}]: ancho y alto deben ser > 0.")
                elif width and height and (r[0] >= width or r[1] >= height):
                    errs.append(f"mask[{i}].rects[{j}]: la caja arranca fuera del cuadro "
                                f"({width}x{height}).")
            ends = m.get("rects_end")
            if ends and len(ends) != len(rects):
                errs.append(f"mask[{i}]: 'rects_end' tiene {len(ends)} cajas y 'rects' "
                            f"{len(rects)}; tienen que coincidir.")
    return errs


def build_filtergraph(masks: list[dict], width: int, height: int, sigma: float = SIGMA,
                      feather: int = FEATHER, soft: bool = True,
                      in_label: str = "0:v", out_label: str = "vmask") -> str:
    """filter_complex que aplica todas las máscaras. Función pura (no toca disco).

    Cada caja se compone de dos capas cuando `soft`: un anillo exterior con blur
    suave y la caja interior con el blur fuerte. Ese escalón hace que no se lea
    como una barra de censura (es lo que en Remotion daría el degradado del
    borde, que en ffmpeg no existe gratis).
    """
    regions = []  # (rect|"full", sigma, from, to)
    for m in masks or []:
        resolved = resolve_mask(m, width, height, feather)
        f, t = float(m["from"]), float(m["to"])
        if resolved == "full":
            regions.append(("full", SIGMA_FULL, f, t))
            continue
        for rect in resolved:
            if soft:
                outer = expand_rect(rect, width, height, feather)
                if outer != rect:
                    regions.append((outer, sigma / 3.0, f, t))
            regions.append((rect, sigma, f, t))
    if not regions:
        return ""

    n = len(regions)
    parts = [f"[{in_label}]split={n + 1}[base]" + "".join(f"[r{i}]" for i in range(n))]
    for i, (rect, sg, _f, _t) in enumerate(regions):
        if rect == "full":
            parts.append(f"[r{i}]gblur=sigma={sg:.2f}[b{i}]")
        else:
            x, y, w, h = rect
            parts.append(f"[r{i}]crop={w}:{h}:{x}:{y},gblur=sigma={sg:.2f}[b{i}]")
    last = "[base]"
    for i, (rect, _sg, f, t) in enumerate(regions):
        # el fundido de entrada/salida se hace ensanchando la ventana de enable;
        # el blur duro aparece un pelo antes y se va un pelo después del rango útil
        en = f"between(t,{max(0.0, f - PAD_IN):.3f},{t + PAD_IN:.3f})"
        pos = "0:0" if rect == "full" else f"{rect[0]}:{rect[1]}"
        tag = f"[v{i}]" if i < n - 1 else f"[{out_label}]"
        parts.append(f"{last}[b{i}]overlay={pos}:enable='{en}':eof_action=pass{tag}")
        last = tag
    return ";".join(parts)


def _probe_wh(video: str) -> tuple[int, int]:
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0",
                        "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", video],
                       capture_output=True, text=True, check=True)
    w, h = r.stdout.strip().split("x")[:2]
    return int(w), int(h)


def _probe_duration(video: str) -> float:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "default=nw=1:nk=1", video],
                       capture_output=True, text=True, check=True)
    return float(r.stdout.strip())


def apply_masks(video: str, masks: list[dict], out: str, profile: str = "intermediate",
                sigma: float = SIGMA, feather: int = FEATHER, soft: bool = True) -> str:
    """Aplica las máscaras y escribe `out`. El audio pasa sin tocar."""
    w, h = _probe_wh(video)
    errs = validate_masks(masks, w, h)
    if errs:
        raise ValueError("máscaras inválidas:\n  - " + "\n  - ".join(errs))
    fg = build_filtergraph(masks, w, h, sigma, feather, soft)
    os.makedirs(os.path.dirname(os.path.abspath(out)) or ".", exist_ok=True)
    if not fg:
        subprocess.run(["ffmpeg", "-i", video, "-c", "copy", "-y", out],
                       check=True, capture_output=True)
        return out
    cmd = ["ffmpeg", "-i", video, "-filter_complex", fg, "-map", "[vmask]", "-map", "0:a?",
           *encode_args(profile, w, h, audio=False), "-c:a", "copy", "-y", out]
    subprocess.run(cmd, check=True, capture_output=True)
    return out


def verify_masks(video: str, masks: list[dict], out_dir: str, feather: int = FEATHER) -> list[str]:
    """Recortes NATIVOS de cada máscara sobre el archivo dado, para revisar a ojo.

    Se toman tres momentos por máscara (entrada, medio, salida) y se recorta un
    poco MÁS grande que la caja: así se ve si quedó una franja nítida en el borde.
    """
    w, h = _probe_wh(video)
    dur = _probe_duration(video)
    os.makedirs(out_dir, exist_ok=True)
    written, skipped = [], []
    for i, m in enumerate(masks or []):
        resolved = resolve_mask(m, w, h, feather)
        f, t = float(m["from"]), float(m["to"])
        if f >= dur:
            skipped.append(f"mask[{i}] ({f:.2f}s) cae fuera del archivo ({dur:.2f}s): "
                           f"¿estás verificando con tiempos de la FUENTE sobre el archivo cortado?")
            continue
        t = min(t, dur)
        moments = [f + 0.10, (f + t) / 2, max(f + 0.10, t - 0.10)]
        boxes = [(0, 0, w, h)] if resolved == "full" else [
            expand_rect(r, w, h, feather) for r in resolved]
        for k, at in enumerate(moments):
            if at >= dur:
                continue
            for j, (x, y, bw, bh) in enumerate(boxes):
                p = os.path.join(out_dir, f"mask{i:02d}_r{j}_{k}.png")
                subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{at:.2f}", "-i", video,
                                "-frames:v", "1", "-vf", f"crop={bw}:{bh}:{x}:{y}",
                                "-y", p], check=True)
                if os.path.exists(p):
                    written.append(p)
    for s in skipped:
        print(f"   [!] {s}")
    return written


def main():
    ap = argparse.ArgumentParser(description="Máscaras de privacidad (blur) sobre un video.")
    ap.add_argument("video")
    ap.add_argument("--masks", required=True,
                    help="json con la lista de máscaras, o un EDL con clave 'masks'")
    ap.add_argument("-o", "--out")
    ap.add_argument("--profile", default="intermediate",
                    choices=("social", "master", "intermediate", "preview"))
    ap.add_argument("--sigma", type=float, default=SIGMA)
    ap.add_argument("--feather", type=int, default=FEATHER)
    ap.add_argument("--hard", action="store_true", help="sin anillo suave (borde duro)")
    ap.add_argument("--verify", metavar="DIR",
                    help="solo verificar: recortes nativos del video dado en DIR")
    ap.add_argument("--print-filter", action="store_true", help="imprimir el filter_complex y salir")
    a = ap.parse_args()

    data = json.load(open(a.masks, encoding="utf-8"))
    masks = data.get("masks", data) if isinstance(data, dict) else data
    # Si lo que te pasaron es un EDL, sus máscaras están en tiempo de FUENTE y hay
    # que llevarlas a la timeline de salida antes de tocar el archivo ya cortado.
    if isinstance(data, dict) and data.get("ranges"):
        from edl import map_masks_to_output  # import local: edl importa este módulo
        mapped = map_masks_to_output(data)
        print(f"   (EDL detectado: {len(masks)} máscaras de fuente -> {len(mapped)} "
              f"en la timeline de salida)")
        masks = mapped
    w, h = _probe_wh(a.video)

    errs = validate_masks(masks, w, h)
    if errs:
        print("máscaras inválidas:")
        for e in errs:
            print("  -", e)
        raise SystemExit(1)

    if a.print_filter:
        print(build_filtergraph(masks, w, h, a.sigma, a.feather, not a.hard))
        return
    if a.verify:
        files = verify_masks(a.video, masks, a.verify, a.feather)
        print(f"{len(files)} recortes nativos en {a.verify}")
        print("   revisá el BORDE de cada uno: si se lee texto nítido, agrandá la caja")
        return

    out = a.out or os.path.join(os.path.dirname(os.path.abspath(a.video)), "masked.mp4")
    apply_masks(a.video, masks, out, a.profile, a.sigma, a.feather, not a.hard)
    n_full = sum(1 for m in masks if m.get("rects") == "full")
    print(f"[privacidad] {len(masks)} máscaras ({n_full} a cuadro completo) -> {out}")
    print(f"   verificá sobre ESTE archivo: privacy.py \"{out}\" --masks {a.masks} "
          f"--verify <dir>")


if __name__ == "__main__":
    main()
