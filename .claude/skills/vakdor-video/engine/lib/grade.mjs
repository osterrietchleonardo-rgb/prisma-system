/**
 * Los 9 presets de ColorGrade.tsx traducidos a ffmpeg.
 * eq: contrast/brightness/saturation/gamma. colorbalance: rs/gs/bs (sombras), rm/gm/bm (medios),
 * rh/gh/bh (altas). Valores entre -1 y 1.
 */
export const PRESETS_COLOR = {
  // El DEFAULT. "Como salio de la camara, un poco mejor": no baja el brillo, no pone
  // viñeta y abre apenas las sombras, para que el lado de la cara donde no da la luz
  // no se cierre. Medido sobre un frame real (00:08 del reel 2, recorte de 70x70):
  //   lado en sombra   sin grade 76  ·  natural 79  ·  cinematic 38
  //   esquina del cuadro  sin grade 186  ·  natural 193  ·  cinematic 97
  // `cinematic` se comia la MITAD de la luz del lado en sombra. Para una cara hablando
  // contra una pared eso no se lee como cine, se lee como mal iluminado. La calidad no
  // viene de gradear: viene de `--limpiar` (ver lib/enhance.mjs, medido con VMAF).
  natural:        { curves: "all='0/0.015 0.25/0.28 0.75/0.78 1/1'", eq: "contrast=1.03:saturation=1.02" },
  cinematic:      { eq: "contrast=1.15:brightness=-0.05:saturation=0.90:gamma=0.95", colorbalance: "rs=-0.05:bs=0.08", vignette: true },
  warm:           { eq: "contrast=1.05:saturation=1.10",            colorbalance: "rm=0.10:bm=-0.06" },
  cool:           { eq: "contrast=1.05:saturation=0.90",            colorbalance: "rm=-0.08:bm=0.12" },
  vintage:        { eq: "contrast=0.95:saturation=0.65:gamma=1.05", colorbalance: "rs=0.08:bs=-0.10", vignette: true },
  bw:             { eq: "contrast=1.10:saturation=0.00" },
  highContrast:   { eq: "contrast=1.35:saturation=1.15" },
  moody:          { eq: "contrast=1.20:brightness=-0.10:saturation=0.80", colorbalance: "bs=0.10", vignette: true },
  golden:         { eq: "contrast=1.08:saturation=1.15:gamma=1.02",  colorbalance: "rm=0.14:gm=0.05:bm=-0.10" },
  "teal-orange":  { eq: "contrast=1.18:saturation=1.05",             colorbalance: "rh=0.12:bs=0.14" },
};

const VINETA = "vignette=angle=PI/5";

/** Devuelve la cadena de filtros de color, lista para meter en el grafo. */
export function filtroDeColor(preset, { vignette = null } = {}) {
  if (!preset || preset === "ninguno") return "";
  const p = PRESETS_COLOR[preset];
  if (!p) {
    throw new Error(
      `El preset de color "${preset}" no existe. Los validos son: ${Object.keys(PRESETS_COLOR).join(", ")}.`
    );
  }
  const partes = [];
  // `curves` va ANTES que `eq`: curves reparte la luz (abre sombras, contiene altas) y
  // eq ajusta el resultado. Al reves, eq trabaja sobre una distribucion que curves
  // todavia no armo y el efecto de la curva se pierde a medias.
  if (p.curves) partes.push(`curves=${p.curves}`);
  if (p.eq) partes.push(`eq=${p.eq}`);
  if (p.colorbalance) partes.push(`colorbalance=${p.colorbalance}`);

  const quiereVineta = vignette === null ? Boolean(p.vignette) : vignette;
  if (quiereVineta) partes.push(VINETA);

  return partes.join(",");
}
