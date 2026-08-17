// TextFx.tsx — Animaciones de texto avanzadas para el motor Vakdor-Video.
// Componentes reutilizables que van mas alla de spring+interpolate basico.
//
// Componentes:
//   <PerLetterReveal text="Hola" /> — revela letra por letra con stagger
//   <Typewriter text="Escribiendo..." /> — efecto maquina de escribir
//   <WordByWord text="Cada palabra aparece" /> — spring por palabra
//   <CountUp from={0} to={185000} prefix="USD " /> — contador animado
//   <GradientText text="Premium" colors={["#C07C41","#FFFFFF"]} /> — texto con gradiente

import React from "react";
import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";
import { BRAND, FONT_FAMILY } from "./brand";

// ---------- PerLetterReveal ----------
export type PerLetterRevealProps = {
  text: string;
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  /** Delay entre letras en frames. Default 2 */
  stagger?: number;
  /** Tipo de animacion por letra: "fade" | "slideUp" | "scale". Default "slideUp" */
  effect?: "fade" | "slideUp" | "scale";
  style?: React.CSSProperties;
};

export const PerLetterReveal: React.FC<PerLetterRevealProps> = ({
  text,
  fontSize = 72,
  fontWeight = 800,
  color = BRAND.title,
  stagger = 2,
  effect = "slideUp",
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        fontFamily: FONT_FAMILY,
        fontSize,
        fontWeight,
        ...style,
      }}
    >
      {text.split("").map((char, i) => {
        const delay = i * stagger;
        const progress = spring({
          frame: Math.max(0, frame - delay),
          fps,
          config: { damping: 200 },
        });

        let transform = "";
        let opacity = progress;
        if (effect === "slideUp") {
          transform = `translateY(${interpolate(progress, [0, 1], [30, 0])}px)`;
        } else if (effect === "scale") {
          transform = `scale(${interpolate(progress, [0, 1], [0.3, 1])})`;
        }

        return (
          <span
            key={i}
            style={{
              color,
              opacity,
              transform,
              display: "inline-block",
              whiteSpace: char === " " ? "pre" : undefined,
            }}
          >
            {char}
          </span>
        );
      })}
    </div>
  );
};

// ---------- Typewriter ----------
export type TypewriterProps = {
  text: string;
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  /** Frames por caracter. Default 3 */
  speed?: number;
  /** Mostrar cursor parpadeante. Default true */
  showCursor?: boolean;
  cursorColor?: string;
  style?: React.CSSProperties;
};

export const Typewriter: React.FC<TypewriterProps> = ({
  text,
  fontSize = 56,
  fontWeight = 600,
  color = BRAND.title,
  speed = 3,
  showCursor = true,
  cursorColor = BRAND.accent,
  style,
}) => {
  const frame = useCurrentFrame();
  const charsToShow = Math.min(Math.floor(frame / speed), text.length);
  const visible = text.slice(0, charsToShow);
  const cursorVisible = Math.floor(frame / 15) % 2 === 0;

  return (
    <div
      style={{
        fontFamily: FONT_FAMILY,
        fontSize,
        fontWeight,
        color,
        ...style,
      }}
    >
      {visible}
      {showCursor && charsToShow < text.length && (
        <span style={{ color: cursorColor, opacity: cursorVisible ? 1 : 0 }}>
          |
        </span>
      )}
    </div>
  );
};

// ---------- WordByWord ----------
export type WordByWordProps = {
  text: string;
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  activeColor?: string;
  /** Delay entre palabras en frames. Default 8 */
  stagger?: number;
  /** Cuantos frames dura el "highlight" de cada palabra. Default 12 */
  highlightDuration?: number;
  style?: React.CSSProperties;
};

export const WordByWord: React.FC<WordByWordProps> = ({
  text,
  fontSize = 72,
  fontWeight = 800,
  color = BRAND.title,
  activeColor = BRAND.accent,
  stagger = 8,
  highlightDuration = 12,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(/\s+/);

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 18,
        fontFamily: FONT_FAMILY,
        fontSize,
        fontWeight,
        justifyContent: "center",
        ...style,
      }}
    >
      {words.map((word, i) => {
        const delay = i * stagger;
        const appear = spring({
          frame: Math.max(0, frame - delay),
          fps,
          config: { damping: 200 },
        });
        const isActive =
          frame >= delay && frame < delay + highlightDuration;

        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              color: isActive ? activeColor : color,
              opacity: appear,
              transform: `translateY(${interpolate(appear, [0, 1], [25, 0])}px) scale(${isActive ? 1.08 : 1})`,
              transition: "color 0.1s",
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};

// ---------- CountUp ----------
export type CountUpProps = {
  from?: number;
  to: number;
  /** Frames que tarda en contar. Default 45 */
  durationFrames?: number;
  prefix?: string;
  suffix?: string;
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  /** Formato con separador de miles. Default true */
  formatNumber?: boolean;
  style?: React.CSSProperties;
};

export const CountUp: React.FC<CountUpProps> = ({
  from = 0,
  to,
  durationFrames = 45,
  prefix = "",
  suffix = "",
  fontSize = 96,
  fontWeight = 800,
  color = BRAND.accent,
  formatNumber = true,
  style,
}) => {
  const frame = useCurrentFrame();
  const raw = interpolate(frame, [0, durationFrames], [from, to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const value = Math.round(raw);
  const display = formatNumber
    ? value.toLocaleString("es-AR")
    : String(value);

  return (
    <div
      style={{
        fontFamily: FONT_FAMILY,
        fontSize,
        fontWeight,
        color,
        fontVariantNumeric: "tabular-nums",
        ...style,
      }}
    >
      {prefix}
      {display}
      {suffix}
    </div>
  );
};

// ---------- GradientText ----------
export type GradientTextProps = {
  text: string;
  colors?: string[];
  fontSize?: number;
  fontWeight?: number;
  /** Angulo del gradiente en grados. Default 90 */
  angle?: number;
  /** Si true, el gradiente se anima (se mueve). Default false */
  animated?: boolean;
  style?: React.CSSProperties;
};

export const GradientText: React.FC<GradientTextProps> = ({
  text,
  colors = [BRAND.accent, BRAND.title],
  fontSize = 80,
  fontWeight = 800,
  angle = 90,
  animated = false,
  style,
}) => {
  const frame = useCurrentFrame();
  const shift = animated ? (frame * 2) % 360 : 0;
  const gradient = `linear-gradient(${angle + shift}deg, ${colors.join(", ")})`;

  return (
    <div
      style={{
        fontFamily: FONT_FAMILY,
        fontSize,
        fontWeight,
        background: gradient,
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
        ...style,
      }}
    >
      {text}
    </div>
  );
};
