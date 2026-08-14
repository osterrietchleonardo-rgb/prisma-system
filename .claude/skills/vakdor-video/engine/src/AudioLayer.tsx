// AudioLayer.tsx — Componentes de audio para el motor Vakdor-Video.
// Cubre: musica de fondo, SFX, ducking, fade in/out, y control de volumen.
//
// Uso:
//   <AudioLayer src={staticFile("musica.mp3")} volume={0.3} fadeInSec={1} fadeOutSec={2} />
//   <AudioDucked music={staticFile("bg.mp3")} musicVolume={0.4} duckTo={0.08} duckRanges={[{from:2,to:15}]} />

import React from "react";
import {
  Audio,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
  staticFile,
} from "remotion";

// ---------- AudioLayer: musica/SFX con fade in/out ----------
export type AudioLayerProps = {
  /** Ruta al archivo de audio (staticFile o URL http) */
  src: string;
  /** Volumen base (0-1). Default 0.5 */
  volume?: number;
  /** Fade in en segundos. Default 0 (sin fade) */
  fadeInSec?: number;
  /** Fade out en segundos. Default 0 (sin fade) */
  fadeOutSec?: number;
  /** Offset en segundos desde donde empieza a sonar el audio. Default 0 */
  startFromSec?: number;
  /** Si true, el audio loopea (se repite). Default false */
  loop?: boolean;
  /** Cuanto suena el audio en segundos (si no se pone, suena todo). Util para SFX. */
  playForSec?: number;
};

export const AudioLayer: React.FC<AudioLayerProps> = ({
  src,
  volume = 0.5,
  fadeInSec = 0,
  fadeOutSec = 0,
  startFromSec = 0,
  loop = false,
  playForSec,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const totalSec = durationInFrames / fps;

  const currentSec = frame / fps;
  const endSec = playForSec ? Math.min(playForSec, totalSec) : totalSec;

  // Fade in
  const fadeInVol =
    fadeInSec > 0
      ? interpolate(currentSec, [0, fadeInSec], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 1;

  // Fade out
  const fadeOutVol =
    fadeOutSec > 0
      ? interpolate(
          currentSec,
          [endSec - fadeOutSec, endSec],
          [1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        )
      : 1;

  const finalVol = volume * fadeInVol * fadeOutVol;

  const resolveSrc = (p: string) =>
    /^https?:\/\//.test(p) || p.startsWith("data:") ? p : staticFile(p);

  return (
    <Audio
      src={resolveSrc(src)}
      volume={finalVol}
      startFrom={Math.round(startFromSec * fps)}
      loop={loop}
    />
  );
};

// ---------- AudioDucked: musica que baja cuando hay voz ----------
// "Ducking" = bajar el volumen de la musica cuando alguien habla.
// duckRanges son los rangos de tiempo (en segundos del video EDITADO) donde hay voz.
export type DuckRange = { from: number; to: number };

export type AudioDuckedProps = {
  /** Ruta a la musica de fondo */
  music: string;
  /** Volumen normal de la musica (0-1). Default 0.35 */
  musicVolume?: number;
  /** Volumen al que baja cuando hay voz (0-1). Default 0.08 */
  duckTo?: number;
  /** Rangos de tiempo donde hay voz (ducking activo) */
  duckRanges: DuckRange[];
  /** Transicion del ducking en segundos. Default 0.3 */
  duckTransitionSec?: number;
  /** Fade in de la musica en segundos. Default 1 */
  fadeInSec?: number;
  /** Fade out de la musica en segundos. Default 2 */
  fadeOutSec?: number;
  /** Loop de la musica. Default true */
  loop?: boolean;
};

export const AudioDucked: React.FC<AudioDuckedProps> = ({
  music,
  musicVolume = 0.35,
  duckTo = 0.08,
  duckRanges,
  duckTransitionSec = 0.3,
  fadeInSec = 1,
  fadeOutSec = 2,
  loop = true,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const currentSec = frame / fps;
  const totalSec = durationInFrames / fps;

  // Ducking: si estamos dentro de algun rango de voz, bajar
  let duckFactor = 1;
  for (const r of duckRanges) {
    const enterStart = r.from - duckTransitionSec;
    const enterEnd = r.from;
    const exitStart = r.to;
    const exitEnd = r.to + duckTransitionSec;

    if (currentSec >= enterStart && currentSec < exitEnd) {
      // Dentro o cerca de un rango de voz
      const enterDuck = interpolate(
        currentSec,
        [enterStart, enterEnd],
        [1, duckTo / musicVolume],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
      );
      const exitDuck = interpolate(
        currentSec,
        [exitStart, exitEnd],
        [duckTo / musicVolume, 1],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
      );
      if (currentSec < enterEnd) {
        duckFactor = Math.min(duckFactor, enterDuck);
      } else if (currentSec >= exitStart) {
        duckFactor = Math.min(duckFactor, exitDuck);
      } else {
        duckFactor = Math.min(duckFactor, duckTo / musicVolume);
      }
    }
  }

  // Fades globales
  const fadeIn =
    fadeInSec > 0
      ? interpolate(currentSec, [0, fadeInSec], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 1;
  const fadeOut =
    fadeOutSec > 0
      ? interpolate(currentSec, [totalSec - fadeOutSec, totalSec], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 1;

  const resolveSrc = (p: string) =>
    /^https?:\/\//.test(p) || p.startsWith("data:") ? p : staticFile(p);

  return (
    <Audio
      src={resolveSrc(music)}
      volume={musicVolume * duckFactor * fadeIn * fadeOut}
      loop={loop}
    />
  );
};

// ---------- SFX: efecto de sonido puntual ----------
export type SfxProps = {
  /** Ruta al archivo de SFX */
  src: string;
  /** Frame en el que empieza a sonar (en la composicion) */
  fromFrame: number;
  /** Cuantos frames dura. Default 30 (1s a 30fps) */
  durationInFrames?: number;
  /** Volumen (0-1). Default 0.7 */
  volume?: number;
};

export const Sfx: React.FC<SfxProps> = ({
  src,
  fromFrame,
  durationInFrames = 30,
  volume = 0.7,
}) => {
  const resolveSrc = (p: string) =>
    /^https?:\/\//.test(p) || p.startsWith("data:") ? p : staticFile(p);

  return (
    <Sequence from={fromFrame} durationInFrames={durationInFrames}>
      <Audio src={resolveSrc(src)} volume={volume} />
    </Sequence>
  );
};
