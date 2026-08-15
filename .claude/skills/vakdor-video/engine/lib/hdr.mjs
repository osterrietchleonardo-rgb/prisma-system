/**
 * HDR -> SDR (tone mapping).
 *
 * POR QUE EXISTE ESTE MODULO (medido, no teorico):
 * Los celulares modernos graban en HDR por defecto. Los .mov de Leonardo vienen
 * `color_space=bt2020nc`, `color_transfer=arib-std-b67` (HLG), `pix_fmt=yuv420p10le`.
 * Hasta que esto existio, el motor tomaba esa señal y la procesaba como si fuera SDR
 * bt709 comun. El resultado, MEDIDO sobre "Video reel 2.mov" (frame en 00:08, pared
 * blanca del fondo, promedio R,G,B de un recorte de 200x200):
 *
 *   sin tonemap (lo que hacia antes)  R=173 G=174 B=162  <- el verde le pasa al rojo
 *                                                            y el azul queda hundido:
 *                                                            ese es el "amarillo".
 *   con tonemap (lo que hace ahora)   R=189 G=178 B=161  <- escalera natural R>G>B,
 *                                                            que es como se ve una
 *                                                            pared blanca con luz calida.
 *
 * Ademas de virar el tono, la señal HLG leida como si fuera gamma bt709 sale oscura:
 * todo el video queda apagado respecto del original.
 *
 * El tonemap tiene que ir PRIMERO en la cadena de filtros: el grade (eq/colorbalance)
 * esta pensado sobre imagen SDR ya normalizada. Gradear sobre HLG crudo es gradear
 * sobre una curva que no es la que uno cree.
 */

/** Curvas de transferencia que significan HDR. El resto se trata como SDR. */
export const TRANSFERENCIAS_HDR = new Set(["arib-std-b67", "smpte2084"]);

/** Primarios anchos. Alcanzan para considerar HDR aunque la transferencia venga sin marcar. */
export const PRIMARIOS_HDR = new Set(["bt2020"]);

/**
 * ¿Este video es HDR? Se decide por los metadatos que trae el archivo (lo que devuelve
 * `probe`), no por el nombre ni por la resolucion.
 */
export function esHDR(color) {
  if (!color) return false;
  return TRANSFERENCIAS_HDR.has(color.transfer) || PRIMARIOS_HDR.has(color.primaries);
}

/**
 * Cadena de filtros que baja HDR a SDR bt709. Devuelve "" si el video ya es SDR
 * (no toca nada: un video normal no paga ni un filtro de mas).
 *
 * `modo`: "auto" (default, tonemapea solo si hace falta) | "no" (nunca tonemapea).
 * `npl` es el nivel de blanco de referencia en nits; 100 es el estandar para HLG.
 *
 * Los pasos, en criollo: pasar la señal a luz lineal, llevarla a espacio de color
 * bt709, comprimir el rango con la curva `hable` (la que menos "lava" las caras) y
 * volver a codificar en bt709 rango TV, que es lo que espera cualquier reproductor.
 * `desat=0` porque el default de ffmpeg (desat=2) desatura las altas y en un plano de
 * cara con pared clara eso deja la piel gris.
 */
export function filtroDeTonemap(color, { modo = "auto", npl = 100 } = {}) {
  if (modo === "no") return "";
  if (!esHDR(color)) return "";
  return [
    `zscale=t=linear:npl=${npl}`,
    "format=gbrpf32le",
    "zscale=p=bt709",
    "tonemap=hable:desat=0",
    "zscale=t=bt709:m=bt709:r=tv",
    "format=yuv420p",
  ].join(",");
}

/**
 * Etiquetas de color para el archivo de salida. Se aplican SOLO cuando hubo tonemap:
 * despues de tonemapear sabemos con certeza que lo que sale es bt709 rango TV, y hay
 * que decirselo al archivo. Sin estas etiquetas el mp4 sale con
 * `color_transfer=unknown` y cada reproductor adivina — que es otra forma de que el
 * color se corra.
 *
 * Para un video que ya era SDR NO se toca nada: no sabemos que era y no hay que mentir.
 */
export function argsDeColorDeSalida(huboTonemap) {
  if (!huboTonemap) return [];
  return [
    "-color_primaries", "bt709",
    "-color_trc", "bt709",
    "-colorspace", "bt709",
    "-color_range", "tv",
  ];
}
