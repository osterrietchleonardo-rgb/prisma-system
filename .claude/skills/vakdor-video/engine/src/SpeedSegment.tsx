// SpeedSegment.tsx — Speed ramping para segmentos de video.
// Permite slow-mo, fast-forward, y transiciones de velocidad suaves.
//
// Uso:
//   <SpeedSegment src="current/raw.mp4" fromSec={5} toSec={10} speed={0.5} />  // slow-mo 50%
//   <SpeedSegment src="current/raw.mp4" fromSec={15} toSec={25} speed={2} />   // 2x rapido
//   <SpeedRamp src="current/raw.mp4" fromSec={0} toSec={8}
//     speedCurve={[{at:0, speed:1}, {at:0.5, speed:0.3}, {at:1, speed:1}]} />  // ramp

import React from "react";
import {
  OffthreadVideo,
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  staticFile,
} from "remotion";

// ---------- SpeedSegment: velocidad constante ----------
export type SpeedSegmentProps = {
  /** Ruta al video */
  src: string;
  /** Segundo de inicio en el video original */
  fromSec: number;
  /** Segundo de fin en el video original */
  toSec: number;
  /** Velocidad: 1 = normal, 0.5 = slow-mo, 2 = fast-forward. Default 1 */
  speed?: number;
  /** objectFit del video. Default "cover" */
  fit?: "cover" | "contain" | "fill";
};

export const SpeedSegment: React.FC<SpeedSegmentProps> = ({
  src,
  fromSec,
  toSec,
  speed = 1,
  fit = "cover",
}) => {
  const { fps } = useVideoConfig();
  const resolveSrc = (p: string) =>
    /^https?:\/\//.test(p) || p.startsWith("data:") ? p : staticFile(p);

  return (
    <AbsoluteFill>
      <OffthreadVideo
        src={resolveSrc(src)}
        playbackRate={speed}
        startFrom={Math.round(fromSec * fps)}
        endAt={Math.round(toSec * fps)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: fit,
        }}
      />
    </AbsoluteFill>
  );
};

// Helper: calcular cuantos frames dura un SpeedSegment en la composicion
export const speedSegmentFrames = (
  fromSec: number,
  toSec: number,
  speed: number,
  fps: number
): number => Math.round(((toSec - fromSec) / speed) * fps);

// ---------- SpeedRamp: velocidad variable (curva) ----------
export type SpeedPoint = {
  /** Posicion normalizada (0-1) dentro del segmento */
  at: number;
  /** Velocidad en ese punto */
  speed: number;
};

export type SpeedRampProps = {
  /** Ruta al video */
  src: string;
  /** Segundo de inicio en el video original */
  fromSec: number;
  /** Segundo de fin en el video original */
  toSec: number;
  /** Curva de velocidad. Minimo 2 puntos. Default [{at:0,speed:1},{at:1,speed:1}] */
  speedCurve?: SpeedPoint[];
  /** objectFit del video. Default "cover" */
  fit?: "cover" | "contain" | "fill";
};

export const SpeedRamp: React.FC<SpeedRampProps> = ({
  src,
  fromSec,
  toSec,
  speedCurve = [
    { at: 0, speed: 1 },
    { at: 1, speed: 1 },
  ],
  fit = "cover",
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Posicion normalizada del frame actual
  const progress = frame / Math.max(durationInFrames - 1, 1);

  // Interpolar velocidad segun la curva
  const sorted = [...speedCurve].sort((a, b) => a.at - b.at);
  const ats = sorted.map((p) => p.at);
  const speeds = sorted.map((p) => p.speed);
  const currentSpeed = interpolate(progress, ats, speeds, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const resolveSrc = (p: string) =>
    /^https?:\/\//.test(p) || p.startsWith("data:") ? p : staticFile(p);

  return (
    <AbsoluteFill>
      <OffthreadVideo
        src={resolveSrc(src)}
        playbackRate={Math.max(0.1, currentSpeed)}
        startFrom={Math.round(fromSec * fps)}
        endAt={Math.round(toSec * fps)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: fit,
        }}
      />
    </AbsoluteFill>
  );
};
