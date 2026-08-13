// Formatos de salida de los Modos A/B. La composición se adapta por dimensión.
export type VideoFormat = "vertical" | "horizontal" | "cuadrado";

export const FORMATS: Record<VideoFormat, { width: number; height: number }> = {
  vertical: { width: 1080, height: 1920 },
  horizontal: { width: 1920, height: 1080 },
  cuadrado: { width: 1080, height: 1080 },
};

// Factor de escala relativo a la dimensión MENOR de diseño base (1080). Se escala por el lado
// más corto (no por el ancho) para que en horizontal 1920×1080 el texto no se desborde en alto.
// Para los 3 formatos estándar el mínimo es 1080 => u=1 (layout idéntico al probado); queda
// listo para formatos no-1080 (4K, 720) sin romper.
export const unit = (width: number, height: number): number =>
  Math.min(width, height) / 1080;

export const resolveFormat = (f?: string): VideoFormat =>
  f === "horizontal" || f === "cuadrado" ? f : "vertical";
