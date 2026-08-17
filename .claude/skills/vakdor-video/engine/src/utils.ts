// utils.ts — Utilidades compartidas del motor Vakdor-Video.
// Helpers para duraciones, formatos, resolución de assets, y patrones avanzados de Remotion.

import {
  interpolate,
  measureSpring,
  Easing,
} from "remotion";

// ---------- Resolucion de rutas de assets ----------
export const resolveSrc = (p: string): string =>
  /^https?:\/\//.test(p) || p.startsWith("data:") ? p : `/${p}`;

export const isHttp = (p: string): boolean => /^https?:\/\//.test(p);

// ---------- Conversiones de tiempo ----------
export const secToFrames = (sec: number, fps: number): number =>
  Math.round(sec * fps);

export const framesToSec = (frames: number, fps: number): number =>
  frames / fps;

export const msToFrames = (ms: number, fps: number): number =>
  Math.round((ms / 1000) * fps);

export const framesToMs = (frames: number, fps: number): number =>
  (frames / fps) * 1000;

// ---------- Medir duracion de un spring ----------
// Util para saber cuantos frames dura una animacion spring
// y calcular la duracion total de la composicion correctamente.
export const getSpringDuration = (
  fps: number,
  config?: { damping?: number; mass?: number; stiffness?: number }
): number =>
  measureSpring({
    fps,
    config: config ?? { damping: 200 },
    threshold: 0.005,
  });

// ---------- Easing presets ----------
export const EASINGS = {
  smooth: Easing.bezier(0.25, 0.1, 0.25, 1),
  snapIn: Easing.bezier(0.4, 0, 0.2, 1),
  snapOut: Easing.bezier(0, 0, 0.2, 1),
  bounce: Easing.bounce,
  elastic: Easing.elastic(1),
  cubic: Easing.inOut(Easing.cubic),
  expo: Easing.inOut(Easing.exp),
} as const;

// ---------- Formatos de video ----------
export type VideoFormat = {
  width: number;
  height: number;
  label: string;
};

export const FORMATS: Record<string, VideoFormat> = {
  // Vertical (Reels, TikTok, Stories)
  reelHD: { width: 1080, height: 1920, label: "Reel HD (9:16)" },
  reel4K: { width: 2160, height: 3840, label: "Reel 4K (9:16)" },
  // Horizontal (YouTube, web)
  landscape720: { width: 1280, height: 720, label: "720p (16:9)" },
  landscape1080: { width: 1920, height: 1080, label: "1080p (16:9)" },
  landscape4K: { width: 3840, height: 2160, label: "4K (16:9)" },
  // Cuadrado (Feed IG, LinkedIn)
  square: { width: 1080, height: 1080, label: "Cuadrado (1:1)" },
  // Casi cuadrado (Feed IG vertical)
  portrait4x5: { width: 1080, height: 1350, label: "Portrait 4:5" },
};

// ---------- Interpolaciones utiles ----------

// Fade in suave (devuelve opacidad 0->1)
export const fadeIn = (
  frame: number,
  startFrame: number,
  durationFrames: number
): number =>
  interpolate(frame, [startFrame, startFrame + durationFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

// Fade out suave (devuelve opacidad 1->0)
export const fadeOut = (
  frame: number,
  endFrame: number,
  durationFrames: number
): number =>
  interpolate(frame, [endFrame - durationFrames, endFrame], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

// Slide in desde abajo (devuelve translateY en px)
export const slideUp = (
  frame: number,
  startFrame: number,
  durationFrames: number,
  distancePx: number = 40
): number =>
  interpolate(
    frame,
    [startFrame, startFrame + durationFrames],
    [distancePx, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

// Pulso de escala (scale up y vuelve)
export const pulse = (
  frame: number,
  startFrame: number,
  durationFrames: number,
  amount: number = 0.08
): number => {
  const mid = startFrame + durationFrames / 2;
  if (frame < startFrame || frame > startFrame + durationFrames) return 1;
  return frame <= mid
    ? interpolate(frame, [startFrame, mid], [1, 1 + amount], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : interpolate(frame, [mid, startFrame + durationFrames], [1 + amount, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
};

// ---------- Formato de numeros ----------
export const formatPrice = (price: number, currency = "USD"): string =>
  `${currency} ${price.toLocaleString("es-AR")}`;

export const formatDuration = (totalSec: number): string => {
  const min = Math.floor(totalSec / 60);
  const sec = Math.round(totalSec % 60);
  return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
};
