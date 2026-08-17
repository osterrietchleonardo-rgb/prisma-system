// PictureInPicture.tsx — Componente de Picture-in-Picture (PiP).
// Superpone un video o imagen circular/redondeado sobre el contenido principal.
// Caso tipico: cara del broker hablando sobre la propiedad.
//
// Uso:
//   <PictureInPicture
//     src={staticFile("current/broker.mp4")}
//     position="bottom-left"
//     size={220}
//   />

import React from "react";
import {
  OffthreadVideo,
  Img,
  staticFile,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BRAND } from "./brand";

export type PipPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "center-left"
  | "center-right";

export type PictureInPictureProps = {
  /** Ruta al video o imagen del PiP */
  src: string;
  /** Posicion en la pantalla. Default "bottom-left" */
  position?: PipPosition;
  /** Tamaño del PiP en px (ancho y alto). Default 240 */
  size?: number;
  /** Margen desde el borde en px. Default 50 */
  margin?: number;
  /** Ancho del borde. Default 4 */
  borderWidth?: number;
  /** Color del borde. Default accent */
  borderColor?: string;
  /** Radio del borde (px o "50%" para circulo). Default "50%" */
  borderRadius?: string | number;
  /** Si es video (true) o imagen (false). Default true */
  isVideo?: boolean;
  /** Animacion de entrada. Default true */
  animate?: boolean;
  /** Sombra. Default true */
  shadow?: boolean;
  /** Opacidad (0-1). Default 1 */
  opacity?: number;
  /** Trim del video PiP: desde que segundo empieza. Default 0 */
  trimFromSec?: number;
};

const positionStyles = (
  pos: PipPosition,
  margin: number
): React.CSSProperties => {
  switch (pos) {
    case "top-left":
      return { top: margin, left: margin };
    case "top-right":
      return { top: margin, right: margin };
    case "bottom-left":
      return { bottom: margin, left: margin };
    case "bottom-right":
      return { bottom: margin, right: margin };
    case "center-left":
      return { top: "50%", left: margin, transform: "translateY(-50%)" };
    case "center-right":
      return { top: "50%", right: margin, transform: "translateY(-50%)" };
    default:
      return { bottom: margin, left: margin };
  }
};

export const PictureInPicture: React.FC<PictureInPictureProps> = ({
  src,
  position = "bottom-left",
  size = 240,
  margin = 50,
  borderWidth = 4,
  borderColor = BRAND.accent,
  borderRadius = "50%",
  isVideo = true,
  animate = true,
  shadow = true,
  opacity = 1,
  trimFromSec = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const resolveSrc = (p: string) =>
    /^https?:\/\//.test(p) || p.startsWith("data:") ? p : staticFile(p);

  const scale = animate
    ? spring({ frame, fps, config: { damping: 200 } })
    : 1;

  const posStyle = positionStyles(position, margin);

  return (
    <div
      style={{
        position: "absolute",
        ...posStyle,
        width: size,
        height: size,
        borderRadius,
        border: `${borderWidth}px solid ${borderColor}`,
        overflow: "hidden",
        transform: `${posStyle.transform ?? ""} scale(${interpolate(scale, [0, 1], [0.5, 1])})`,
        opacity: opacity * (typeof scale === "number" ? scale : 1),
        boxShadow: shadow
          ? "0 8px 32px rgba(0,0,0,0.6)"
          : "none",
        zIndex: 10,
      }}
    >
      {isVideo ? (
        <OffthreadVideo
          src={resolveSrc(src)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
          startFrom={Math.round(trimFromSec * fps)}
        />
      ) : (
        <Img
          src={resolveSrc(src)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      )}
    </div>
  );
};
