export const FORMATOS = {
  "16:9": { ancho: 1920, alto: 1080 },
  "9:16": { ancho: 1080, alto: 1920 },
  "1:1":  { ancho: 1080, alto: 1080 },
  "4:5":  { ancho: 1080, alto: 1350 },
};

/**
 * subtitulosY: fraccion de la altura donde va la linea de subtitulos (0 arriba, 1 abajo).
 * En 9:16 sube a 0.62 porque la UI de Instagram/TikTok tapa el fondo del cuadro.
 * evitarCentro: los callouts no pueden invadir el tercio central (ahi esta la cara).
 */
export const ZONAS_SEGURAS = {
  "16:9": { subtitulosY: 0.88, evitarCentro: false },
  "9:16": { subtitulosY: 0.62, evitarCentro: true },
  "1:1":  { subtitulosY: 0.84, evitarCentro: true },
  "4:5":  { subtitulosY: 0.85, evitarCentro: true },
};

/** Escala y recorta (o pone barras) para llegar al formato pedido. */
export function filtroDeFormato({ anchoOrigen, altoOrigen, formato, modo = "recortar" }) {
  const destino = FORMATOS[formato];
  if (!destino) {
    throw new Error(
      `El formato "${formato}" no existe. Los validos son: ${Object.keys(FORMATOS).join(", ")}.`
    );
  }
  const { ancho: W, alto: H } = destino;

  if (anchoOrigen === W && altoOrigen === H) return `scale=${W}:${H},setsar=1`;

  if (modo === "barras") {
    // Entra completo, se rellena con negro.
    return [
      `scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos`,
      `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black`,
      "setsar=1",
    ].join(",");
  }
  // "recortar": llena el cuadro y recorta el sobrante, centrado.
  return [
    `scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos`,
    `crop=${W}:${H}`,
    "setsar=1",
  ].join(",");
}
