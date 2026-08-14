// ColorGrade.tsx — Color grading / correccion de color por CSS filters.
// Se pone como capa SOBRE el video o foto (children pass-through).
//
// Uso:
//   <ColorGrade preset="cinematic"><OffthreadVideo ... /></ColorGrade>
//   <ColorGrade brightness={1.1} contrast={1.2} saturate={0.9}><Img ... /></ColorGrade>

import React from "react";
import { AbsoluteFill } from "remotion";

export type ColorGradePreset =
  | "none"
  | "cinematic"    // oscuro, contrastado, ligeramente desaturado
  | "warm"          // tonos calidos
  | "cool"          // tonos frios
  | "vintage"       // sepia suave
  | "bw"            // blanco y negro
  | "highContrast"  // alto contraste
  | "moody"         // oscuro y dramatico
  | "golden"        // dorado (hora dorada)
  | "teal-orange";  // teal & orange (cine moderno)

export type ColorGradeProps = {
  /** Preset predefinido. Si se pone, los valores individuales lo sobreescriben. */
  preset?: ColorGradePreset;
  /** Brillo (1 = normal, >1 = mas claro). Default 1 */
  brightness?: number;
  /** Contraste (1 = normal). Default 1 */
  contrast?: number;
  /** Saturacion (1 = normal, 0 = gris). Default 1 */
  saturate?: number;
  /** Matiz en grados (-180 a 180). Default 0 */
  hueRotate?: number;
  /** Sepia (0 = nada, 1 = full sepia). Default 0 */
  sepia?: number;
  /** Overlay de color semitransparente (para tinting). Ej: "rgba(192,124,65,0.15)" */
  tintOverlay?: string;
  /** Vignette oscuro en los bordes. Default false */
  vignette?: boolean;
  children: React.ReactNode;
};

const PRESETS: Record<
  ColorGradePreset,
  {
    brightness: number;
    contrast: number;
    saturate: number;
    hueRotate: number;
    sepia: number;
    tint?: string;
    vignette?: boolean;
  }
> = {
  none: { brightness: 1, contrast: 1, saturate: 1, hueRotate: 0, sepia: 0 },
  cinematic: {
    brightness: 0.92,
    contrast: 1.2,
    saturate: 0.85,
    hueRotate: 0,
    sepia: 0.05,
    vignette: true,
  },
  warm: {
    brightness: 1.05,
    contrast: 1.05,
    saturate: 1.15,
    hueRotate: 5,
    sepia: 0.12,
    tint: "rgba(255,180,50,0.08)",
  },
  cool: {
    brightness: 1.02,
    contrast: 1.08,
    saturate: 0.9,
    hueRotate: -10,
    sepia: 0,
    tint: "rgba(50,100,200,0.1)",
  },
  vintage: {
    brightness: 1.05,
    contrast: 0.95,
    saturate: 0.7,
    hueRotate: -5,
    sepia: 0.3,
    vignette: true,
  },
  bw: {
    brightness: 1.05,
    contrast: 1.15,
    saturate: 0,
    hueRotate: 0,
    sepia: 0,
  },
  highContrast: {
    brightness: 1.08,
    contrast: 1.4,
    saturate: 1.2,
    hueRotate: 0,
    sepia: 0,
  },
  moody: {
    brightness: 0.85,
    contrast: 1.25,
    saturate: 0.75,
    hueRotate: -5,
    sepia: 0.08,
    tint: "rgba(0,20,60,0.15)",
    vignette: true,
  },
  golden: {
    brightness: 1.08,
    contrast: 1.1,
    saturate: 1.2,
    hueRotate: 8,
    sepia: 0.15,
    tint: "rgba(192,124,65,0.12)",
  },
  "teal-orange": {
    brightness: 1.0,
    contrast: 1.15,
    saturate: 1.3,
    hueRotate: -8,
    sepia: 0.05,
    tint: "rgba(0,128,128,0.06)",
  },
};

export const ColorGrade: React.FC<ColorGradeProps> = ({
  preset = "none",
  brightness,
  contrast,
  saturate,
  hueRotate,
  sepia,
  tintOverlay,
  vignette,
  children,
}) => {
  const p = PRESETS[preset] ?? PRESETS.none;
  const b = brightness ?? p.brightness;
  const c = contrast ?? p.contrast;
  const s = saturate ?? p.saturate;
  const h = hueRotate ?? p.hueRotate;
  const se = sepia ?? p.sepia;
  const tint = tintOverlay ?? p.tint;
  const vig = vignette ?? p.vignette ?? false;

  const filter = [
    `brightness(${b})`,
    `contrast(${c})`,
    `saturate(${s})`,
    h !== 0 ? `hue-rotate(${h}deg)` : "",
    se > 0 ? `sepia(${se})` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ filter }}>{children}</AbsoluteFill>
      {tint && (
        <AbsoluteFill
          style={{ backgroundColor: tint, mixBlendMode: "overlay" }}
        />
      )}
      {vig && (
        <AbsoluteFill
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.55) 100%)",
          }}
        />
      )}
    </AbsoluteFill>
  );
};
