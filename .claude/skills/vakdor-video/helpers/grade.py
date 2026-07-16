"""Color grade por ffmpeg. Presets + filtro crudo. Se aplica por-segmento (Regla Dura 2)."""
from __future__ import annotations
import argparse, subprocess

GRADE_PRESETS: dict[str, str] = {
    "none": "",
    # Corrección mínima: contraste + curva S suave, sin virar tono.
    "neutral_punch": "eq=contrast=1.08:saturation=1.05,curves=all='0/0 0.25/0.22 0.75/0.8 1/1'",
    # Teal/orange sutil, desaturado, look técnico/retro. Seguro para talking heads.
    "warm_cinematic": "curves=all='0/0.02 0.5/0.5 1/0.98',eq=saturation=0.92:contrast=1.06:gamma_r=1.03:gamma_b=0.98",
    # Look premium/lujo: contraste elevado, sombras profundas frías, altas cálidas, nítido.
    "luxury": "curves=r='0/0.01 0.5/0.52 1/1':b='0/0.03 0.5/0.48 1/0.97',eq=contrast=1.12:saturation=0.96:gamma=0.98,unsharp=5:5:0.5",
}


def grade_filter(name_or_raw: str | None) -> str:
    if not name_or_raw:
        return ""
    if name_or_raw in GRADE_PRESETS:
        return GRADE_PRESETS[name_or_raw]
    return name_or_raw  # raw ffmpeg filter


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input", nargs="?")
    ap.add_argument("-o", "--out")
    ap.add_argument("--preset")
    ap.add_argument("--filter", dest="raw")
    ap.add_argument("--list-presets", action="store_true")
    a = ap.parse_args()
    if a.list_presets:
        for k, v in GRADE_PRESETS.items():
            print(f"{k}: {v or '(sin cambios)'}")
        return
    filt = grade_filter(a.raw or a.preset or "none")
    vf = ["-vf", filt] if filt else []
    subprocess.run(["ffmpeg", "-i", a.input, *vf, "-y", a.out], check=True)
    print("Grade OK ->", a.out)


if __name__ == "__main__":
    main()
