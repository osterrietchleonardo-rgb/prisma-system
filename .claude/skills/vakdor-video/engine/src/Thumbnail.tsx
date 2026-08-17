// Thumbnail.tsx — Composicion de 1 frame para generar thumbnails / previews.
// Renderiza un solo frame con la marca Vakdor para usar como portada del reel.
//
// Uso desde render: node thumbnail.mjs --props=props.json --out=thumb.jpg

import React from "react";
import {
  AbsoluteFill,
  Img,
  staticFile,
  interpolate,
  useCurrentFrame,
  CalculateMetadataFunction,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";
import { BRAND } from "./brand";

const { fontFamily } = loadFont();

export const THUMB_FPS = 1;

export type ThumbnailProps = {
  /** Foto principal del thumbnail */
  photo: string;
  /** Titulo grande */
  title: string;
  /** Precio o subtitulo */
  price: string;
  /** Tag superior (ej "En Venta"). Opcional */
  tag?: string;
  /** Formato: "vertical" (1080x1920) o "horizontal" (1920x1080). Default "vertical" */
  format?: "vertical" | "horizontal";
};

export const thumbnailDefaults: ThumbnailProps = {
  photo: "https://picsum.photos/seed/thumb/1080/1920",
  title: "Departamento 3 amb",
  price: "USD 185.000",
  tag: "En Venta",
  format: "vertical",
};

export const calcThumbnailMetadata: CalculateMetadataFunction<
  ThumbnailProps
> = ({ props }) => {
  const isVert = (props.format ?? "vertical") === "vertical";
  return {
    durationInFrames: 1,
    fps: THUMB_FPS,
    width: isVert ? 1080 : 1920,
    height: isVert ? 1920 : 1080,
  };
};

const resolveSrc = (p: string) =>
  /^https?:\/\//.test(p) || p.startsWith("data:") ? p : staticFile(p);

export const Thumbnail: React.FC<ThumbnailProps> = ({
  photo,
  title,
  price,
  tag,
}) => {
  return (
    <AbsoluteFill>
      {/* Foto de fondo */}
      <Img
        src={resolveSrc(photo)}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
      {/* Vignette */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(10,15,26,0.5) 0%, rgba(10,15,26,0) 30%, rgba(10,15,26,0) 50%, rgba(10,15,26,0.92) 100%)",
        }}
      />
      {/* Logos */}
      <Img
        src={staticFile("logo-vakdor.png")}
        style={{
          position: "absolute",
          top: 70,
          left: 60,
          width: 88,
          height: 88,
          objectFit: "contain",
        }}
      />
      <Img
        src={staticFile("logo-icon.png")}
        style={{
          position: "absolute",
          top: 70,
          right: 60,
          width: 88,
          height: 88,
          objectFit: "contain",
        }}
      />
      {/* Tag */}
      {tag && (
        <div
          style={{
            position: "absolute",
            top: 180,
            left: 60,
            backgroundColor: BRAND.accent,
            color: BRAND.title,
            fontFamily,
            fontSize: 32,
            fontWeight: 700,
            padding: "12px 32px",
            borderRadius: 8,
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          {tag}
        </div>
      )}
      {/* Titulo + Precio */}
      <div
        style={{
          position: "absolute",
          bottom: 100,
          left: 60,
          right: 60,
          fontFamily,
        }}
      >
        <div
          style={{
            width: 100,
            height: 6,
            backgroundColor: BRAND.accent,
            borderRadius: 3,
            marginBottom: 20,
          }}
        />
        <div
          style={{
            color: BRAND.title,
            fontSize: 64,
            fontWeight: 800,
            lineHeight: 1.08,
          }}
        >
          {title}
        </div>
        <div
          style={{
            color: BRAND.accent,
            fontSize: 56,
            fontWeight: 800,
            marginTop: 12,
          }}
        >
          {price}
        </div>
      </div>
    </AbsoluteFill>
  );
};
